"use client";

import { useState } from "react";
import { Sparkles, Loader2, AlertCircle, ChevronDown, Trash2 } from "lucide-react";
import { Caption, CaptionStyle } from "@/types";
import { CAPTION_FONT_OPTIONS } from "@/lib/captions";
import { extractAudio, splitAudioBlob } from "@/lib/ffmpeg";
import { formatTimeShort } from "@/lib/filters";

interface CaptionsPanelProps {
  videoFile: File | null;
  captions: Caption[];
  style: CaptionStyle;
  onCaptionsChange: (c: Caption[]) => void;
  onStyleChange: (s: CaptionStyle) => void;
}

const PRESETS: { id: CaptionStyle["preset"]; label: string; desc: string }[] = [
  { id: "snap", label: "Snap", desc: "Short viral reel captions" },
  { id: "default", label: "Subtitle", desc: "Clean and readable" },
  { id: "social", label: "Social", desc: "Bold uppercase" },
  { id: "highlighted", label: "Box", desc: "Background fill" },
  { id: "glow-script", label: "Glow", desc: "Orange script accent" },
];

export default function CaptionsPanel({ videoFile, captions, style, onCaptionsChange, onStyleChange }: CaptionsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const getMediaDuration = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const media = document.createElement("video");
      media.preload = "metadata";
      media.src = url;
      await new Promise<void>((resolve, reject) => {
        media.onloadedmetadata = () => resolve();
        media.onerror = () => reject(new Error("Failed to read video duration"));
      });
      return media.duration;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const generate = async () => {
    if (!videoFile) return;
    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      const maxTranscriptionBytes = 24 * 1024 * 1024;
      const mediaDuration = await getMediaDuration(videoFile);
      setProgress(8);

      const audioBlob = await extractAudio(videoFile, (p) => setProgress(8 + p * 0.42));
      const chunkDuration = audioBlob.size > maxTranscriptionBytes
        ? Math.max(45, Math.floor(mediaDuration * ((maxTranscriptionBytes * 0.85) / audioBlob.size)))
        : mediaDuration;

      const chunks = audioBlob.size > maxTranscriptionBytes
        ? await splitAudioBlob(audioBlob, mediaDuration, chunkDuration, (p) => setProgress(50 + p * 0.1))
        : [{ blob: audioBlob, start: 0, end: mediaDuration }];

      const mergedCaptions: Caption[] = [];

      for (let index = 0; index < chunks.length; index += 1) {
        const chunk = chunks[index];
        setProgress(60 + (index / Math.max(chunks.length, 1)) * 35);
        const formData = new FormData();
        formData.append("audio", chunk.blob, `audio-${index}.mp3`);

        const response = await fetch("/api/captions", { method: "POST", body: formData });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Transcription failed on chunk ${index + 1}`);
        }

        const chunkCaptions = ((data.captions ?? []) as Caption[]).map((caption, captionIndex) => ({
          ...caption,
          id: `chunk-${index}-${captionIndex}`,
          start: caption.start + chunk.start,
          end: caption.end + chunk.start,
        }));

        mergedCaptions.push(...chunkCaptions);
      }

      setProgress(100);
      onCaptionsChange(mergedCaptions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate captions");
    } finally {
      setLoading(false);
    }
  };

  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-[11px]" style={{ color: "var(--text2)" }}>{label}</span>
      {children}
    </div>
  );

  const updateCaptionText = (id: string, text: string) => {
    onCaptionsChange(captions.map((caption) => caption.id === id ? { ...caption, text } : caption));
  };

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={generate}
        disabled={loading || !videoFile}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all"
        style={{
          background: loading ? "var(--surface3)" : "var(--accent)",
          color: "white",
          opacity: !videoFile ? 0.4 : 1,
          boxShadow: loading ? "none" : "0 2px 12px rgba(79,127,255,0.3)",
        }}
      >
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating... {Math.round(progress)}%</>
          : <><Sparkles className="w-4 h-4" /> Generate AI Captions</>}
      </button>

      {loading && (
        <div className="h-[2px] rounded-full overflow-hidden" style={{ background: "var(--surface3)" }}>
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: "var(--accent)" }} />
        </div>
      )}

      {error && (
        <div
          className="flex items-start gap-2 text-xs p-3 rounded-lg"
          style={{ background: "rgba(255,95,95,0.08)", border: "1px solid rgba(255,95,95,0.2)", color: "#ff8080" }}
        >
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {captions.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onStyleChange({
                  ...style,
                  preset: preset.id,
                  background: preset.id === "highlighted",
                  fontSize: preset.id === "snap" ? 20 : preset.id === "social" ? 22 : preset.id === "glow-script" ? 30 : 18,
                  fontFamily: preset.id === "snap" ? "montserrat" : preset.id === "social" ? "bebas-neue" : preset.id === "glow-script" ? "outfit" : style.fontFamily,
                  color: preset.id === "glow-script" ? "#FFFDF8" : preset.id === "snap" ? "#FFFFFF" : style.color,
                  textAlign: "center",
                  maxLines: preset.id === "glow-script" ? 2 : 2,
                  lineHeight: preset.id === "snap" ? 0.98 : preset.id === "glow-script" ? 0.95 : 1.05,
                  letterSpacing: preset.id === "snap" ? -0.2 : preset.id === "social" ? 0.8 : preset.id === "glow-script" ? 0.2 : style.letterSpacing,
                  y: preset.id === "snap" ? 79 : style.y,
                })}
                className="flex flex-col p-2 rounded-lg transition-colors"
                style={{
                  background: style.preset === preset.id ? "rgba(79,127,255,0.12)" : "var(--surface2)",
                  border: `1px solid ${style.preset === preset.id ? "var(--accent)" : "var(--border)"}`,
                }}
              >
                <span className="text-[11px] font-semibold" style={{ color: style.preset === preset.id ? "var(--accent2)" : "var(--text)" }}>
                  {preset.label}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text3)" }}>{preset.desc}</span>
              </button>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <Row label={`Size - ${style.fontSize}px`}>
              <input
                type="range"
                min={12}
                max={36}
                value={style.fontSize}
                onChange={(e) => onStyleChange({ ...style, fontSize: Number(e.target.value) })}
                className="adj-slider w-28"
              />
            </Row>

            <Row label={`Line height - ${style.lineHeight.toFixed(2)}`}>
              <input
                type="range"
                min={0.8}
                max={1.8}
                step={0.05}
                value={style.lineHeight}
                onChange={(e) => onStyleChange({ ...style, lineHeight: Number(e.target.value) })}
                className="adj-slider w-28"
              />
            </Row>

            <Row label={`Letter spacing - ${style.letterSpacing.toFixed(1)}px`}>
              <input
                type="range"
                min={-1}
                max={6}
                step={0.1}
                value={style.letterSpacing}
                onChange={(e) => onStyleChange({ ...style, letterSpacing: Number(e.target.value) })}
                className="adj-slider w-28"
              />
            </Row>

            <Row label="Line count">
              <div className="flex gap-1">
                {([1, 2, 3] as const).map((maxLines) => (
                  <button
                    key={maxLines}
                    onClick={() => onStyleChange({ ...style, maxLines })}
                    className="px-2 py-1 rounded text-[10px] transition-colors"
                    style={{
                      background: style.maxLines === maxLines ? "var(--accent)" : "var(--surface3)",
                      color: style.maxLines === maxLines ? "white" : "var(--text3)",
                    }}
                  >
                    {maxLines} line{maxLines > 1 ? "s" : ""}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Color">
              <div className="flex gap-1.5">
                {["#FFFFFF", "#FFFF00", "#FF6B6B", "#74C0FC", "#A8FF78"].map((color) => (
                  <button
                    key={color}
                    onClick={() => onStyleChange({ ...style, color })}
                    className="w-6 h-6 rounded-full transition-transform hover:scale-110 flex-shrink-0"
                    style={{
                      background: color,
                      outline: style.color === color ? "2px solid var(--accent)" : "2px solid transparent",
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </Row>

            <Row label="Font">
              <select
                value={style.fontFamily}
                onChange={(e) => onStyleChange({ ...style, fontFamily: e.target.value as CaptionStyle["fontFamily"] })}
                className="text-[11px] px-2 py-1.5 rounded-md outline-none"
                style={{
                  background: "var(--surface3)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  minWidth: 124,
                }}
              >
                {CAPTION_FONT_OPTIONS.map((font) => (
                  <option key={font.id} value={font.id}>
                    {font.label}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Background box">
              <button
                onClick={() => onStyleChange({ ...style, background: !style.background })}
                className="relative w-9 h-5 rounded-full transition-colors"
                style={{ background: style.background ? "var(--accent)" : "var(--surface3)" }}
              >
                <div
                  className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                  style={{ transform: style.background ? "translateX(16px)" : "translateX(2px)" }}
                />
              </button>
            </Row>

            <Row label={`Horizontal - ${style.x.toFixed(0)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={style.x}
                onChange={(e) => onStyleChange({ ...style, x: Number(e.target.value) })}
                className="adj-slider w-28"
              />
            </Row>

            <Row label={`Vertical - ${style.y.toFixed(0)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={style.y}
                onChange={(e) => onStyleChange({ ...style, y: Number(e.target.value) })}
                className="adj-slider w-28"
              />
            </Row>

            <Row label="Alignment">
              <div className="flex gap-1">
                {(["left", "center", "right"] as const).map((textAlign) => (
                  <button
                    key={textAlign}
                    onClick={() => onStyleChange({ ...style, textAlign })}
                    className="px-2 py-1 rounded text-[10px] capitalize transition-colors"
                    style={{
                      background: style.textAlign === textAlign ? "var(--accent)" : "var(--surface3)",
                      color: style.textAlign === textAlign ? "white" : "var(--text3)",
                    }}
                  >
                    {textAlign}
                  </button>
                ))}
              </div>
            </Row>
          </div>
        </>
      )}

      {captions.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <button className="w-full flex items-center justify-between mb-2" onClick={() => setExpanded(!expanded)}>
            <span className="text-[11px]" style={{ color: "var(--text3)" }}>
              {captions.length} live chunks
            </span>
            <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ color: "var(--text3)", transform: expanded ? "rotate(180deg)" : "none" }} />
          </button>

          {expanded && (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {captions.map((caption) => (
                <div key={caption.id} className="flex items-start gap-2 p-2 rounded-lg group" style={{ background: "var(--surface2)" }}>
                  <span className="text-[10px] font-mono mt-0.5 flex-shrink-0" style={{ color: "var(--text3)" }}>
                    {formatTimeShort(caption.start)}
                  </span>
                  <input
                    type="text"
                    value={caption.text}
                    onChange={(e) => updateCaptionText(caption.id, e.target.value)}
                    className="flex-1 text-[11px] leading-snug rounded px-2 py-1 outline-none"
                    style={{ color: "var(--text2)", background: "var(--surface3)", border: "1px solid var(--border)" }}
                  />
                  <button
                    onClick={() => onCaptionsChange(captions.filter((entry) => entry.id !== caption.id))}
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: "var(--text3)" }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => onCaptionsChange([])}
            className="mt-2 text-[11px] transition-colors"
            style={{ color: "var(--text3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#ff8080")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}
          >
            Clear all captions
          </button>
        </div>
      )}
    </div>
  );
}
