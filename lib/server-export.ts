import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { Caption, CaptionStyle, TrimRange, VideoAdjustments } from "@/types";
import { adjustmentsToFFmpegFilter } from "@/lib/filters";
import { getCaptionFontExportName, isGlowScriptPreset, isSnapCaptionPreset, splitCaptionIntoLines, splitGlowCaptionIntoLines } from "@/lib/captions";

const execFileAsync = promisify(execFile);

export type ServerExportQuality = "fast" | "balanced";

export type ServerExportPayload = {
  trim: TrimRange;
  adjustments: VideoAdjustments;
  captions: Caption[];
  captionStyle: CaptionStyle;
  quality: ServerExportQuality;
};

export type PreparedServerExport = {
  tempDir: string;
  outputPath: string;
  contentType: string;
  fileName: string;
};

type VideoMetadata = {
  width: number;
  height: number;
  duration: number;
};

type ServerExportSettings = {
  width: number;
  height: number;
  audioBitrateKbps: number;
  videoBitrateKbps: number;
};

export async function prepareVideoExport(file: File, payload: ServerExportPayload): Promise<PreparedServerExport> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clipai-export-"));

  try {
    const inputExtension = path.extname(file.name || "") || ".mp4";
    const inputPath = path.join(tempDir, `input${inputExtension}`);
    const outputPath = path.join(tempDir, "output.mp4");
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(inputPath, inputBuffer);

    const metadata = await getVideoMetadata(inputPath);
    const exportSettings = getServerExportSettings({
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      durationSeconds: metadata.duration,
      sourceSizeBytes: file.size,
      quality: payload.quality,
    });

    const filters: string[] = [];
    const adjustmentFilter = adjustmentsToFFmpegFilter(payload.adjustments);
    if (adjustmentFilter) filters.push(adjustmentFilter);

    if (exportSettings.width !== metadata.width || exportSettings.height !== metadata.height) {
      filters.push(`scale=${exportSettings.width}:${exportSettings.height}`);
    }

    const fontsDir = path.join(tempDir, "fonts");
    await prepareExportFonts(fontsDir, payload.captionStyle);

    let subtitlePath: string | null = null;
    if (payload.captions.length > 0) {
      subtitlePath = path.join(tempDir, "captions.ass");
      const assContent = buildAssSubtitles(payload.captions, payload.captionStyle, exportSettings.width, exportSettings.height);
      await fs.writeFile(subtitlePath, assContent, "utf8");
      filters.push(`subtitles='${escapeFilterPath(subtitlePath)}':fontsdir='${escapeFilterPath(fontsDir)}'`);
    }

    await runFfmpegEncode({
      inputPath,
      outputPath,
      trim: payload.trim,
      quality: payload.quality,
      exportSettings,
      filterGraph: filters.join(","),
    });

    return {
      tempDir,
      outputPath,
      contentType: "video/mp4",
      fileName: `clipai-${Date.now()}.mp4`,
    };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

export async function renderVideoExport(file: File, payload: ServerExportPayload) {
  const prepared = await prepareVideoExport(file, payload);

  try {
    const outputBuffer = await fs.readFile(prepared.outputPath);
    return {
      buffer: outputBuffer,
      contentType: prepared.contentType,
      fileName: prepared.fileName,
    };
  } finally {
    await fs.rm(prepared.tempDir, { recursive: true, force: true });
  }
}

async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    inputPath,
  ]);

  const parsed = JSON.parse(stdout);
  const stream = parsed?.streams?.[0];
  const duration = Number(parsed?.format?.duration);

  if (!stream?.width || !stream?.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("Could not determine video dimensions for export");
  }

  return {
    width: Number(stream.width),
    height: Number(stream.height),
    duration,
  };
}

async function runFfmpegEncode(options: {
  inputPath: string;
  outputPath: string;
  trim: TrimRange;
  quality: ServerExportQuality;
  exportSettings: ServerExportSettings;
  filterGraph: string;
}) {
  const encoders = [
    "h264_nvenc", // NVIDIA hardware acceleration - fastest
    "h264_amf",   // AMD hardware acceleration
    "h264_qsv",   // Intel Quick Sync Video
    "libx264"     // Software fallback
  ];

  let lastError: unknown = null;

  for (const encoder of encoders) {
    try {
      const args = buildFfmpegArgs({ ...options, encoder });
      await execFileAsync("ffmpeg", args, { windowsHide: true, maxBuffer: 1024 * 1024 * 16 });
      return;
    } catch (error) {
      lastError = error;
      await fs.rm(options.outputPath, { force: true });
    }
  }

  const details = extractFfmpegError(lastError);
  throw new Error(`Native export failed: ${details}`);
}

function buildFfmpegArgs(options: {
  inputPath: string;
  outputPath: string;
  trim: TrimRange;
  quality: ServerExportQuality;
  exportSettings: ServerExportSettings;
  filterGraph: string;
  encoder: string;
}) {
  const qualityArgs = getEncoderArgs(options.encoder, options.quality, options.exportSettings);
  const threads = Math.max(1, os.cpus().length); // Use all available CPU cores
  const args = [
    "-y",
    "-threads", threads.toString(), // Use all CPU cores
    "-fflags", "+discardcorrupt+genpts+igndts", // Better error handling and timestamp generation
    "-avoid_negative_ts", "make_zero", // Handle negative timestamps
    "-ss",
    `${Math.max(0, options.trim.start || 0)}`,
    "-to",
    `${Math.max(options.trim.end || 0, options.trim.start || 0.1)}`,
    "-i",
    options.inputPath,
  ];

  if (options.filterGraph) {
    args.push("-vf", options.filterGraph);
  }

  args.push(
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    ...qualityArgs,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart+write_colr",
    "-fflags",
    "+bitexact+discardcorrupt",
    options.outputPath
  );

  return args;
}

function getEncoderArgs(encoder: string, quality: ServerExportQuality, exportSettings: ServerExportSettings) {
  const settings = {
    videoBitrateKbps: exportSettings.videoBitrateKbps,
    maxRateKbps: Math.max(Math.round(exportSettings.videoBitrateKbps * 1.35), exportSettings.videoBitrateKbps + 2000),
    bufferKbps: Math.max(Math.round(exportSettings.videoBitrateKbps * 2), exportSettings.videoBitrateKbps + 4000),
    audioBitrateKbps: exportSettings.audioBitrateKbps,
  };

  if (encoder === "h264_nvenc") {
    return [
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p1", // Fastest preset available
      "-rc",
      "vbr_hq",
      "-cq",
      "23", // Slightly higher quality for better speed/quality balance
      "-b:v",
      `${settings.videoBitrateKbps}k`,
      "-maxrate",
      `${settings.maxRateKbps}k`,
      "-bufsize",
      `${settings.bufferKbps}k`,
      "-c:a",
      "aac",
      "-b:a",
      `${settings.audioBitrateKbps}k`,
    ];
  }

  if (encoder === "h264_amf") {
    return [
      "-c:v",
      "h264_amf",
      "-quality",
      "speed", // Maximum speed
      "-usage",
      "transcoding",
      "-b:v",
      `${settings.videoBitrateKbps}k`,
      "-maxrate",
      `${settings.maxRateKbps}k`,
      "-bufsize",
      `${settings.bufferKbps}k`,
      "-c:a",
      "aac",
      "-b:a",
      `${settings.audioBitrateKbps}k`,
    ];
  }

  if (encoder === "h264_qsv") {
    return [
      "-c:v",
      "h264_qsv",
      "-preset",
      "veryfast", // Fastest Intel QSV preset
      "-global_quality",
      "23", // Quality setting for QSV
      "-b:v",
      `${settings.videoBitrateKbps}k`,
      "-maxrate",
      `${settings.maxRateKbps}k`,
      "-bufsize",
      `${settings.bufferKbps}k`,
      "-c:a",
      "aac",
      "-b:a",
      `${settings.audioBitrateKbps}k`,
    ];
  }

  return [
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast", // Fastest software encoding preset
    "-crf",
    "21", // Slightly higher quality for better speed/quality balance
    "-b:v",
    `${settings.videoBitrateKbps}k`,
    "-maxrate",
    `${settings.maxRateKbps}k`,
    "-bufsize",
    `${settings.bufferKbps}k`,
    "-c:a",
    "aac",
    "-b:a",
    `${settings.audioBitrateKbps}k`,
  ];
}

function getServerExportSettings(options: {
  sourceWidth: number;
  sourceHeight: number;
  durationSeconds: number;
  sourceSizeBytes: number;
  quality: ServerExportQuality;
}): ServerExportSettings {
  const maxDimension = Math.max(options.sourceWidth, options.sourceHeight); // Always use source resolution for maximum quality
  const sourceBitsPerSecond = options.durationSeconds > 0
    ? (options.sourceSizeBytes * 8) / options.durationSeconds
    : 0;
  const sourceKbps = Math.max(0, Math.round(sourceBitsPerSecond / 1000));
  const audioBitrateKbps = 256; // Higher audio quality
  const minimumVideoKbps = 15000; // Much higher minimum bitrate for better quality
  const targetVideoKbps = Math.max(minimumVideoKbps, Math.round(sourceKbps * 1.2) - audioBitrateKbps); // Higher target bitrate
  const longestSide = Math.max(options.sourceWidth, options.sourceHeight);
  const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;

  return {
    width: normalizeDimension(options.sourceWidth * scale),
    height: normalizeDimension(options.sourceHeight * scale),
    audioBitrateKbps,
    videoBitrateKbps: targetVideoKbps,
  };
}

function normalizeDimension(value: number) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function buildAssSubtitles(captions: Caption[], style: CaptionStyle, width: number, height: number) {
  const fontName = getCaptionFontExportName(style.fontFamily);
  const primaryColor = isGlowScriptPreset(style.preset) ? "&HFFFDF8" : assColor(style.color);
  const outlineColor = style.background ? "&H00000000" : isGlowScriptPreset(style.preset) ? "&HFFFFFF" : "&H00000000";
  const backColor = style.background ? "&H50000000" : "&H00000000";
  const borderStyle = style.background ? 3 : 1;
  const alignment = style.textAlign === "left" ? 4 : style.textAlign === "right" ? 6 : 5;
  const spacing = style.letterSpacing.toFixed(1);
  const snapPreset = isSnapCaptionPreset(style.preset);
  const outline = style.background ? 0 : isGlowScriptPreset(style.preset) ? 4.0 : snapPreset ? 1.1 : 2.2;
  const shadow = style.background ? 0 : isGlowScriptPreset(style.preset) ? 3.5 : snapPreset ? 0.8 : 1.6;

  // Scale font size based on output video height (assume preview is designed for 1080p equivalent)
  // Use a stronger multiplier to achieve large caption text (nearly screen-filling)
  const referenceHeight = 1080;
  const exportFontMultiplier = 2.8; // tweak this for larger or smaller export caption text
  const scaledFontSize = Math.round(style.fontSize * (height / referenceHeight) * exportFontMultiplier);

  const events = captions
    .map((caption) => buildAssDialogue(caption, style, width, height, alignment))
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 2
YCbCr Matrix: TV.601

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${fontName},${scaledFontSize},${primaryColor},${primaryColor},${outlineColor},${backColor},${style.preset === "social" || style.preset === "glow-script" || snapPreset ? 1 : 0},0,0,0,100,100,${spacing},0,${borderStyle},${outline},${shadow},${alignment},24,24,24,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events}
`;
}

function buildAssDialogue(caption: Caption, style: CaptionStyle, width: number, height: number, alignment: number) {
  const x = Math.round((width * style.x) / 100);
  const y = Math.round((height * style.y) / 100);
  const text = isGlowScriptPreset(style.preset)
    ? formatGlowCaptionForAss(caption.text, style, height)
    : formatStandardCaptionForAss(caption.text, style);

  return `Dialogue: 0,${toAssTime(caption.start)},${toAssTime(caption.end)},Caption,,0,0,0,,{\\an${alignment}\\pos(${x},${y})}${text}`;
}

function formatStandardCaptionForAss(text: string, style: CaptionStyle) {
  const content = style.preset === "social" ? text.toUpperCase() : text;
  const lines = splitCaptionIntoLines(content, style.maxLines).map(escapeAssText);
  return lines.join("\\N");
}

function formatGlowCaptionForAss(text: string, style: CaptionStyle, height: number) {
  const lines = splitGlowCaptionIntoLines(text);
  const regularFont = getCaptionFontExportName(style.fontFamily);
  const accentFont = getCaptionFontExportName("parisienne");

  // Scale font sizes based on output video height (assume preview is designed for 1080p equivalent)
  const referenceHeight = 1080;
  const exportFontMultiplier = 2.8;
  const scaledRegularSize = Math.round(style.fontSize * (height / referenceHeight) * exportFontMultiplier);
  const scaledAccentSize = Math.round(style.fontSize * 1.28 * (height / referenceHeight) * exportFontMultiplier);

  // Match preview glow script visuals (white/cream regular + orange accent glow)
  const regularColour = "&H00F8FDFF"; // #fffdf8
  const accentColour = "&H0047BFFF"; // #ffbf47
  const outlineColour = "&H00000000";

  const regularTag = `{\\fn${escapeAssTag(regularFont)}\\fs${scaledRegularSize}\\1c${regularColour}\\3c${outlineColour}\\bord2.1\\shad3\\blur1.2}`;
  const accentTag = `{\\fn${escapeAssTag(accentFont)}\\fs${scaledAccentSize}\\1c${accentColour}\\3c${outlineColour}\\bord2.1\\shad4\\blur1.8}`;
  const resetTag = `{\\r}`;

  return lines.map((parts) => parts.map((part) => {
    const tag = part.accent ? accentTag : regularTag;
    return `${tag}${escapeAssText(part.text)}${resetTag}`;
  }).join(" ")).join("\\N");
}

function toAssTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const centis = Math.floor((safe % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function assColor(hex: string) {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  const r = normalized.slice(0, 2);
  const g = normalized.slice(2, 4);
  const b = normalized.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase();
}

function escapeAssText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, "\\N");
}

function escapeAssTag(text: string) {
  return text.replace(/[{}\\]/g, "");
}

function escapeFilterPath(filePath: string) {
  return filePath
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function extractFfmpegError(error: unknown) {
  if (error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string") {
    const stderr = error.stderr.trim().split(/\r?\n/);
    return stderr.slice(-6).join(" | ");
  }

  return error instanceof Error ? error.message : "Unknown FFmpeg error";
}

async function prepareExportFonts(fontsDir: string, style: CaptionStyle) {
  await fs.mkdir(fontsDir, { recursive: true });

  const fontFiles = new Set<string>();
  const regularFonts = getFontPackageFiles(style.fontFamily);
  regularFonts.forEach((filePath) => fontFiles.add(filePath));
  getFontPackageFiles("parisienne").forEach((filePath) => fontFiles.add(filePath));

  await Promise.all(
    Array.from(fontFiles).map(async (sourcePath) => {
      const targetPath = path.join(fontsDir, path.basename(sourcePath));
      await fs.copyFile(sourcePath, targetPath);
    })
  );
}

function getFontPackageFiles(fontFamily: CaptionStyle["fontFamily"]) {
  const root = process.cwd();
  const basePath = path.join(root, "app", "fonts", "export");

  switch (fontFamily) {
    case "outfit":
      return [
        path.join(basePath, "Outfit-Regular.ttf"),
        path.join(basePath, "Outfit-SemiBold.ttf"),
        path.join(basePath, "Outfit-ExtraBold.ttf"),
      ];
    case "poppins":
      return [
        path.join(basePath, "Poppins-Regular.ttf"),
        path.join(basePath, "Poppins-SemiBold.ttf"),
        path.join(basePath, "Poppins-ExtraBold.ttf"),
      ];
    case "montserrat":
      return [
        path.join(basePath, "Montserrat-Regular.ttf"),
        path.join(basePath, "Montserrat-SemiBold.ttf"),
        path.join(basePath, "Montserrat-ExtraBold.ttf"),
      ];
    case "bebas-neue":
      return [
        path.join(basePath, "BebasNeue-Regular.ttf"),
      ];
    case "parisienne":
      return [
        path.join(basePath, "Parisienne-Regular.ttf"),
      ];
    case "system":
    default:
      return [];
  }
}
