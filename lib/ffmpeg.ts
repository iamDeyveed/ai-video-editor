import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { Caption, CaptionStyle, VideoAdjustments, TrimRange } from "@/types";
import { getCaptionAccentFontStack, getCaptionFontStack, isGlowScriptPreset, isSnapCaptionPreset, splitCaptionIntoLines, splitGlowCaptionIntoLines } from "@/lib/captions";
import { adjustmentsToCSSFilter } from "@/lib/filters";

let ffmpeg: FFmpeg | null = null;
let loaded = false;

type CaptureVideoElement = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

type ExportAudioGraph = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  destination: MediaStreamAudioDestinationNode;
};

export type ExportQualityMode = "fast" | "balanced";

type ExportVideoOptions = {
  quality?: ExportQualityMode;
};

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;
  ffmpeg = new FFmpeg();
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  loaded = true;
  return ffmpeg;
}

export async function extractAudio(
  videoFile: File,
  onProgress?: (p: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();
  const inputName = "input_audio.mp4";
  const outputName = "audio.mp3";

  const handler = ({ progress }: { progress: number }) => {
    onProgress?.(Math.min(progress * 100, 99));
  };
  ff.on("progress", handler);

  await ff.writeFile(inputName, await fetchFile(videoFile));
  await ff.exec([
    "-i", inputName,
    "-vn",
    "-ar", "16000",
    "-ac", "1",
    "-b:a", "64k",
    outputName,
  ]);

  ff.off("progress", handler);
  const data = await ff.readFile(outputName);
  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  const buf = (data as Uint8Array).buffer as ArrayBuffer;
  return new Blob([buf], { type: "audio/mp3" });
}

export async function splitAudioBlob(
  audioBlob: Blob,
  durationSeconds: number,
  chunkDurationSeconds: number,
  onProgress?: (p: number) => void
): Promise<Array<{ blob: Blob; start: number; end: number }>> {
  const ff = await getFFmpeg();
  const inputName = "input_chunk_source.mp3";
  const segments: Array<{ blob: Blob; start: number; end: number }> = [];

  await ff.writeFile(inputName, await fetchFile(audioBlob));

  let index = 0;
  for (let start = 0; start < durationSeconds; start += chunkDurationSeconds) {
    const end = Math.min(durationSeconds, start + chunkDurationSeconds);
    const outputName = `audio_chunk_${index}.mp3`;

    await ff.exec([
      "-ss", String(start),
      "-t", String(end - start),
      "-i", inputName,
      "-ar", "16000",
      "-ac", "1",
      "-b:a", "64k",
      "-y",
      outputName,
    ]);

    const data = await ff.readFile(outputName);
    const bytes = new Uint8Array(data as Uint8Array);
    segments.push({
      blob: new Blob([bytes], { type: "audio/mp3" }),
      start,
      end,
    });

    await ff.deleteFile(outputName);
    index += 1;
    onProgress?.((end / durationSeconds) * 100);
  }

  await ff.deleteFile(inputName);

  return segments;
}

export async function exportVideo(
  videoFile: File,
  trim: TrimRange,
  adjustments: VideoAdjustments,
  captions: Caption[],
  captionStyle: CaptionStyle,
  options?: ExportVideoOptions,
  onProgress?: (stage: string, percent: number) => void
): Promise<Blob> {
  if (typeof window === "undefined") {
    throw new Error("Video export is only available in the browser");
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video export");
  }

  const objectUrl = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.src = objectUrl;
  video.preload = "auto";
  video.muted = true;
  video.volume = 0;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  const waitForEvent = <T extends Event>(target: EventTarget, eventName: string) =>
    new Promise<T>((resolve, reject) => {
      const onSuccess = (event: Event) => {
        cleanup();
        resolve(event as T);
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed while waiting for ${eventName}`));
      };
      const cleanup = () => {
        target.removeEventListener(eventName, onSuccess as EventListener);
        target.removeEventListener("error", onError as EventListener);
      };

      target.addEventListener(eventName, onSuccess as EventListener, { once: true });
      target.addEventListener("error", onError as EventListener, { once: true });
    });

  const cleanupNodes = () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
    URL.revokeObjectURL(objectUrl);
  };

  let audioGraph: ExportAudioGraph | null = null;

  const cleanupAudio = async () => {
    if (!audioGraph) return;
    try {
      audioGraph.source.disconnect();
      audioGraph.gain.disconnect();
      audioGraph.destination.disconnect();
      if (audioGraph.context.state !== "closed") {
        await audioGraph.context.close();
      }
    } catch {
      // Ignore audio teardown errors during export cleanup.
    }
    audioGraph = null;
  };

  try {
    await waitForEvent(video, "loadedmetadata");
    if (video.readyState < 2) {
      await waitForEvent(video, "loadeddata");
    }

    const sourceWidth = Math.max(2, Math.floor(video.videoWidth || 1280));
    const sourceHeight = Math.max(2, Math.floor(video.videoHeight || 720));
    const start = Math.max(0, trim.start || 0);
    const naturalEnd = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : start + 1;
    const end = trim.end > start ? Math.min(trim.end, naturalEnd) : naturalEnd;
    const duration = Math.max(0.1, end - start);
    const exportSettings = getExportSettings(sourceWidth, sourceHeight, options?.quality ?? "fast");
    const { width, height, frameRate, videoBitrate, audioBitrate, statusLabel } = exportSettings;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas export context is unavailable");

    const canvasStream = canvas.captureStream(frameRate);
    if (typeof AudioContext !== "undefined") {
      const context = new AudioContext();
      const source = context.createMediaElementSource(video);
      const gain = context.createGain();
      const destination = context.createMediaStreamDestination();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(destination);
      gain.connect(context.destination);
      audioGraph = { context, source, gain, destination };
      if (context.state === "suspended") {
        await context.resume();
      }
    }

    const captureVideo = video as CaptureVideoElement;
    const mediaCapture = typeof captureVideo.captureStream === "function"
      ? captureVideo.captureStream()
      : typeof captureVideo.mozCaptureStream === "function"
        ? captureVideo.mozCaptureStream()
        : null;
    const audioTracks = audioGraph?.destination.stream.getAudioTracks()
      ?? mediaCapture?.getAudioTracks()
      ?? [];

    const mixedTracks = [
      ...canvasStream.getVideoTracks(),
      ...audioTracks,
    ];
    const outputStream = new MediaStream(mixedTracks);

    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));

    if (!mimeType) {
      throw new Error("This browser cannot record a supported video format");
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: audioTracks.length > 0 ? audioBitrate : undefined,
    });
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };

    const recorderStopped = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Recording failed during export"));
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1024) {
          reject(new Error("Exported video file was empty or invalid"));
          return;
        }
        resolve(blob);
      };
    });

    const cssFilter = adjustmentsToCSSFilter(adjustments);
    const fontStack = getCaptionFontStack(captionStyle.fontFamily);
    const accentFontStack = getCaptionAccentFontStack();

    const drawCaption = (captionTime: number) => {
      const activeCaption = [...captions].reverse().find((caption) => captionTime >= caption.start && captionTime <= caption.end);
      if (!activeCaption) return;

      const text = activeCaption.text.trim();
      if (!text) return;

      const isGlowScript = isGlowScriptPreset(captionStyle.preset);
      const isSnapPreset = isSnapCaptionPreset(captionStyle.preset);
      const glowLines = splitGlowCaptionIntoLines(text);
      ctx.font = `${captionStyle.preset === "social" || isGlowScript || isSnapPreset ? 800 : 600} ${captionStyle.fontSize}px ${fontStack}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const maxTextWidth = width * (captionStyle.preset === "glow-script" ? 0.64 : isSnapPreset ? 0.68 : 0.58);
      const wrappedLines = isGlowScript
        ? glowLines.map((line) => line.map((part) => part.text).join(" "))
        : splitCaptionIntoLines(captionStyle.preset === "social" ? text.toUpperCase() : text, captionStyle.maxLines);
      const fittedLines = isGlowScript ? wrappedLines : fitCaptionLinesToWidth(ctx, wrappedLines, maxTextWidth, captionStyle.letterSpacing);
      const glowMetrics = isGlowScript
        ? measureGlowScriptBlock(ctx, glowLines, captionStyle.fontSize, fontStack, accentFontStack, captionStyle.lineHeight)
        : null;
      const regularMetrics = isGlowScript
        ? null
        : measureWrappedText(ctx, fittedLines, captionStyle.letterSpacing);
      const paddingX = 14;
      const paddingY = 8;
      const boxWidth = (glowMetrics?.width ?? regularMetrics?.width ?? 0) + paddingX * 2;
      const lineHeightPx = captionStyle.fontSize * captionStyle.lineHeight;
      const boxHeight = (glowMetrics?.height ?? fittedLines.length * lineHeightPx) + paddingY * 2;
      const anchorX = (width * captionStyle.x) / 100;
      const centerY = (height * captionStyle.y) / 100;
      const boxLeft = captionStyle.textAlign === "left"
        ? anchorX
        : captionStyle.textAlign === "right"
          ? anchorX - boxWidth
          : anchorX - boxWidth / 2;

      if (captionStyle.background) {
        ctx.fillStyle = "rgba(0,0,0,0.72)";
        roundRect(ctx, boxLeft, centerY - boxHeight / 2, boxWidth, boxHeight, 8);
        ctx.fill();
      }

      if (isGlowScript) {
        drawGlowScriptCaption(ctx, anchorX, centerY, glowLines, captionStyle.fontSize, fontStack, accentFontStack, captionStyle.textAlign, captionStyle.lineHeight);
      } else {
        ctx.fillStyle = captionStyle.color;
        ctx.shadowColor = captionStyle.background ? "transparent" : isSnapPreset ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.9)";
        ctx.shadowBlur = captionStyle.background ? 0 : isSnapPreset ? 6 : 8;
        ctx.shadowOffsetY = isSnapPreset ? 1.5 : 0;
        drawWrappedCaptionLines(ctx, fittedLines, anchorX, centerY, lineHeightPx, captionStyle.letterSpacing, captionStyle.textAlign);
        ctx.shadowBlur = 0;
        ctx.shadowColor = "transparent";
        ctx.shadowOffsetY = 0;
      }
    };

    let stopped = false;
    const stopEverything = () => {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== "inactive") {
        recorder.requestData();
        recorder.stop();
      }
    };

    const renderFrame = () => {
      if (stopped) return;
      const currentTime = video.currentTime;
      const relativeTime = Math.max(0, currentTime - start);

      ctx.clearRect(0, 0, width, height);
      ctx.filter = cssFilter || "none";
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = "none";
      drawCaption(currentTime);

      const percent = Math.min(99, (relativeTime / duration) * 100);
      onProgress?.(statusLabel, Number.isFinite(percent) ? percent : 0);

      if (currentTime >= end || video.ended) {
        stopEverything();
        return;
      }

      if ("requestVideoFrameCallback" in video) {
        (video as HTMLVideoElement & {
          requestVideoFrameCallback: (callback: () => void) => number;
        }).requestVideoFrameCallback(() => renderFrame());
      } else {
        requestAnimationFrame(renderFrame);
      }
    };

    video.currentTime = start;
    await waitForEvent(video, "seeked");

    recorder.start(200);
    onProgress?.("encoding", 0);
    const playPromise = video.play();
    if (playPromise) {
      try {
        await playPromise;
      } catch {
        video.muted = true;
        await video.play();
      }
    }
    renderFrame();

    const exportedBlob = await recorderStopped;
    outputStream.getTracks().forEach((track) => track.stop());
    canvasStream.getTracks().forEach((track) => track.stop());
    mediaCapture?.getTracks().forEach((track) => track.stop());
    await cleanupAudio();

    return exportedBlob;
  } finally {
    await cleanupAudio();
    cleanupNodes();
  }
}

function getExportSettings(
  sourceWidth: number,
  sourceHeight: number,
  quality: ExportQualityMode
) {
  const maxDimension = quality === "fast" ? 720 : 1080;
  const frameRate = quality === "fast" ? 24 : 30;
  const videoBitrate = quality === "fast" ? 2_500_000 : 5_000_000;
  const audioBitrate = quality === "fast" ? 96_000 : 128_000;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;

  return {
    width: normalizeDimension(sourceWidth * scale),
    height: normalizeDimension(sourceHeight * scale),
    frameRate,
    videoBitrate,
    audioBitrate,
    statusLabel: quality === "fast" ? "encoding-fast" : "encoding-balanced",
  };
}

function normalizeDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.lineTo(x + width - clampedRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  ctx.lineTo(x + width, y + height - clampedRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  ctx.lineTo(x + clampedRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  ctx.lineTo(x, y + clampedRadius);
  ctx.quadraticCurveTo(x, y, x + clampedRadius, y);
  ctx.closePath();
}

function measureGlowScriptWidth(
  ctx: CanvasRenderingContext2D,
  parts: Array<{ text: string; accent: boolean }>,
  fontSize: number,
  regularFont: string,
  accentFont: string
) {
  let width = 0;
  parts.forEach((part, index) => {
    ctx.font = part.accent ? `400 ${fontSize * 1.28}px ${accentFont}` : `800 ${fontSize}px ${regularFont}`;
    width += ctx.measureText(part.text).width;
    if (index < parts.length - 1) width += fontSize * 0.22;
  });
  return { width };
}

function measureGlowScriptBlock(
  ctx: CanvasRenderingContext2D,
  lines: Array<Array<{ text: string; accent: boolean }>>,
  fontSize: number,
  regularFont: string,
  accentFont: string,
  lineHeight: number
) {
  return {
    width: Math.max(...lines.map((line) => measureGlowScriptWidth(ctx, line, fontSize, regularFont, accentFont).width), 0),
    height: Math.max(lines.length, 1) * fontSize * lineHeight,
  };
}

function drawGlowScriptCaption(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  centerY: number,
  lines: Array<Array<{ text: string; accent: boolean }>>,
  fontSize: number,
  regularFont: string,
  accentFont: string,
  textAlign: CaptionStyle["textAlign"],
  lineHeight: number
) {
  ctx.textAlign = "left";
  const totalHeight = (Math.max(lines.length, 1) - 1) * fontSize * lineHeight;
  const startY = centerY - totalHeight / 2;

  lines.forEach((parts, lineIndex) => {
    const totalWidth = measureGlowScriptWidth(ctx, parts, fontSize, regularFont, accentFont).width;
    let currentX = textAlign === "left"
      ? anchorX
      : textAlign === "right"
        ? anchorX - totalWidth
        : anchorX - totalWidth / 2;
    const lineY = startY + lineIndex * fontSize * lineHeight;

    parts.forEach((part, index) => {
      ctx.font = part.accent ? `400 ${fontSize * 1.28}px ${accentFont}` : `800 ${fontSize}px ${regularFont}`;
      ctx.fillStyle = part.accent ? "#ffbf47" : "#fffdf8";
      ctx.shadowColor = part.accent ? "rgba(255,168,43,0.75)" : "rgba(0,0,0,0.9)";
      ctx.shadowBlur = part.accent ? 14 : 8;
      ctx.fillText(part.text, currentX, lineY + (part.accent ? fontSize * 0.04 : 0));
      currentX += ctx.measureText(part.text).width;
      if (index < parts.length - 1) currentX += fontSize * 0.22;
    });
  });

  ctx.textAlign = "center";
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";
}

function measureWrappedText(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  letterSpacing: number
) {
  return {
    width: Math.max(...lines.map((line) => measureTextWithLetterSpacing(ctx, line, letterSpacing)), 0),
  };
}

function measureTextWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacing: number
) {
  const baseWidth = ctx.measureText(text).width;
  return text.length > 1 ? baseWidth + (text.length - 1) * letterSpacing : baseWidth;
}

function drawWrappedCaptionLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  anchorX: number,
  centerY: number,
  lineHeightPx: number,
  letterSpacing: number,
  textAlign: CaptionStyle["textAlign"]
) {
  const totalHeight = (lines.length - 1) * lineHeightPx;
  const startY = centerY - totalHeight / 2;

  lines.forEach((line, index) => {
    drawTextWithLetterSpacing(ctx, line, anchorX, startY + index * lineHeightPx, letterSpacing, textAlign);
  });
}

function drawTextWithLetterSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  anchorX: number,
  y: number,
  letterSpacing: number,
  textAlign: CaptionStyle["textAlign"]
) {
  if (!text) return;
  if (Math.abs(letterSpacing) < 0.01) {
    ctx.textAlign = textAlign;
    ctx.fillText(text, anchorX, y);
    ctx.textAlign = "center";
    return;
  }

  const totalWidth = measureTextWithLetterSpacing(ctx, text, letterSpacing);
  let currentX = textAlign === "left"
    ? anchorX
    : textAlign === "right"
      ? anchorX - totalWidth
      : anchorX - totalWidth / 2;
  ctx.textAlign = "left";

  for (const char of text) {
    ctx.fillText(char, currentX, y);
    currentX += ctx.measureText(char).width + letterSpacing;
  }

  ctx.textAlign = "center";
}

function fitCaptionLinesToWidth(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  maxWidth: number,
  letterSpacing: number
) {
  if (lines.every((line) => measureTextWithLetterSpacing(ctx, line, letterSpacing) <= maxWidth)) {
    return lines;
  }

  const flattened = lines.join(" ").split(" ").filter(Boolean);
  if (flattened.length <= 2) return [flattened.join(" ")];

  const midpoint = Math.ceil(flattened.length / 2);
  return [
    flattened.slice(0, midpoint).join(" "),
    flattened.slice(midpoint).join(" "),
  ];
}
