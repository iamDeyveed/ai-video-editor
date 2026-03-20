"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, CheckCircle2, AlertCircle, Clapperboard } from "lucide-react";
import { Caption, CaptionStyle, VideoAdjustments, TrimRange } from "@/types";
import { exportVideo, type ExportQualityMode } from "@/lib/ffmpeg";
import { formatTimeShort } from "@/lib/filters";

interface ExportPanelProps {
  videoFile: File | null;
  trim: TrimRange;
  duration: number;
  adjustments: VideoAdjustments;
  captions: Caption[];
  captionStyle: CaptionStyle;
}

export default function ExportPanel({ videoFile, trim, duration, adjustments, captions, captionStyle }: ExportPanelProps) {
  const [stage, setStage] = useState<"idle" | "encoding" | "done" | "error">("idle");
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string | null>(null);
  const [downloadExtension, setDownloadExtension] = useState("webm");
  const [quality, setQuality] = useState<ExportQualityMode>("fast");
  const [renderer, setRenderer] = useState<"preview" | "native">("native");
  const exportDuration = trim.end > trim.start ? trim.end - trim.start : duration;

  useEffect(() => {
    return () => {
      revokeObjectUrl(downloadUrl);
    };
  }, [downloadUrl]);

  const handleExport = async () => {
    if (!videoFile || duration <= 0) return;

    revokeObjectUrl(downloadUrl);
    setDownloadUrl(null);
    setDownloadName(null);
    setDownloadExtension(renderer === "preview" ? "webm" : "mp4");
    setStage("encoding");
    setPercent(0);
    setMessage(renderer === "preview" ? "Preparing preview-match export..." : "Preparing native export...");

    let progressTimer: number | null = null;
    try {
      let blob: Blob;

      if (renderer === "preview") {
        blob = await exportVideo(
          videoFile,
          trim,
          adjustments,
          captions,
          captionStyle,
          { quality },
          (s, p) => {
            setPercent(p);
            setMessage(
              s === "encoding-fast"
                ? "Rendering in browser fast mode..."
                : s === "encoding-balanced"
                  ? "Rendering in browser balanced mode..."
                  : s === "encoding"
                    ? "Rendering in browser..."
                    : s
            );
          }
        );
      } else {
        let currentPercent = 0;
        progressTimer = window.setInterval(() => {
          currentPercent = Math.min(currentPercent + (quality === "fast" ? 6 : 4), 94);
          setPercent(currentPercent);
        }, 500);

        const formData = new FormData();
        formData.append("file", videoFile, videoFile.name);
        formData.append("payload", JSON.stringify({
          trim,
          adjustments,
          captions,
          captionStyle,
          quality,
        }));

        setMessage(quality === "fast" ? "Server rendering in fast mode..." : "Server rendering in balanced mode...");
        const response = await fetch("/api/export", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || "Native export failed");
        }

        const data = await response.json().catch(() => null) as { downloadUrl?: string; fileName?: string } | null;
        if (!data?.downloadUrl) {
          throw new Error("Native export finished but no download link was returned");
        }

        setPercent(96);
        setMessage("Downloading rendered MP4...");
        const downloadResponse = await fetch(data.downloadUrl, {
          method: "GET",
          cache: "no-store",
        });

        if (!downloadResponse.ok) {
          const errorData = await downloadResponse.json().catch(() => null);
          throw new Error(errorData?.error || "Rendered file download failed");
        }

        const finalBlob = await downloadResponse.blob();
        if (finalBlob.size < 1024) {
          throw new Error("Rendered file was empty or invalid");
        }

        const finalUrl = URL.createObjectURL(finalBlob);
        const resolvedName = getDownloadFileName(
          downloadResponse.headers.get("Content-Disposition"),
          data.fileName
        );

        setPercent(100);
        setMessage("Download ready");
        triggerBrowserDownload(finalUrl, resolvedName);
        setDownloadName(resolvedName);
        setDownloadExtension("mp4");
        setDownloadUrl(finalUrl);
        setStage("done");
        return;
      }

      const extension = blob.type.includes("webm") ? "webm" : "mp4";
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadExtension(extension);
      setStage("done");
      setPercent(100);

      setTimeout(() => {
        const a = document.createElement("a");
        a.href = url;
        a.download = `clipai-${Date.now()}.${extension}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, 300);
    } catch (e: unknown) {
      setStage("error");
      setMessage(e instanceof Error ? e.message : "Export failed");
    } finally {
      if (progressTimer) window.clearInterval(progressTimer);
    }
  };

  const triggerBrowserDownload = (url: string, suggestedName?: string) => {
    const a = document.createElement("a");
    a.href = url;
    if (suggestedName) {
      a.download = suggestedName;
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const revokeObjectUrl = (url: string | null) => {
    if (url?.startsWith("blob:")) {
      URL.revokeObjectURL(url);
    }
  };

  const getDownloadFileName = (contentDisposition: string | null, fallback?: string) => {
    const utf8Match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const quotedMatch = contentDisposition?.match(/filename=\"([^\"]+)\"/i);
    if (quotedMatch?.[1]) {
      return quotedMatch[1];
    }

    const plainMatch = contentDisposition?.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) {
      return plainMatch[1].trim();
    }

    return fallback ?? `clipai-${Date.now()}.mp4`;
  };

  const SummaryRow = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-[11px]" style={{ color: "var(--text3)" }}>{label}</span>
      <span className="text-[11px] font-medium" style={{ color: "var(--text2)" }}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-3" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--text3)" }}>Export Summary</p>
        <SummaryRow label="Trim" value={`${formatTimeShort(trim.start)} -> ${formatTimeShort(trim.end)}`} />
        <SummaryRow label="Duration" value={formatTimeShort(Math.max(exportDuration, 0))} />
        <SummaryRow label="Color grade" value={adjustments.lut !== "none" ? adjustments.lut.replace(/_/g, " ") : "Manual"} />
        <SummaryRow label="Captions" value={captions.length > 0 ? `${captions.length} chunks` : "None"} />
        <SummaryRow label="Renderer" value={renderer === "preview" ? "Preview Match Browser" : "Native FFmpeg"} />
        <SummaryRow label="Quality" value={quality === "fast" ? "Fast 1080p target" : "Balanced source-size target"} />
        <SummaryRow label="Format" value={renderer === "preview" ? "Browser recorded video" : "Native FFmpeg MP4"} />
      </div>

      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--text3)" }}>Export Renderer</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "native" as const, label: "Native FFmpeg", hint: "MP4 download, higher quality" },
            { id: "preview" as const, label: "Preview Match", hint: "Closest look, slower" },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setRenderer(option.id)}
              disabled={stage === "encoding"}
              className="rounded-lg px-3 py-2 text-left transition-colors"
              style={{
                background: renderer === option.id ? "rgba(79,127,255,0.12)" : "var(--surface3)",
                border: renderer === option.id ? "1px solid rgba(79,127,255,0.45)" : "1px solid var(--border)",
                opacity: stage === "encoding" ? 0.65 : 1,
              }}
            >
              <p className="text-[12px] font-semibold" style={{ color: renderer === option.id ? "var(--accent2)" : "var(--text)" }}>
                {option.label}
              </p>
              <p className="text-[10px]" style={{ color: "var(--text3)" }}>
                {option.hint}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-3 space-y-2" style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
        <p className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--text3)" }}>Export Speed</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "fast" as const, label: "Fast", hint: "Quicker 1080p export" },
            { id: "balanced" as const, label: "Balanced", hint: "Keeps more of the source file" },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => setQuality(option.id)}
              disabled={stage === "encoding"}
              className="rounded-lg px-3 py-2 text-left transition-colors"
              style={{
                background: quality === option.id ? "rgba(79,127,255,0.12)" : "var(--surface3)",
                border: quality === option.id ? "1px solid rgba(79,127,255,0.45)" : "1px solid var(--border)",
                opacity: stage === "encoding" ? 0.65 : 1,
              }}
            >
              <p className="text-[12px] font-semibold" style={{ color: quality === option.id ? "var(--accent2)" : "var(--text)" }}>
                {option.label}
              </p>
              <p className="text-[10px]" style={{ color: "var(--text3)" }}>
                {option.hint}
              </p>
            </button>
          ))}
        </div>
      </div>

      {stage !== "done" && (
        <button
          onClick={handleExport}
          disabled={stage === "encoding" || !videoFile || duration <= 0}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all"
          style={{
            background: stage === "encoding" ? "var(--surface3)" : "var(--accent)",
            color: "white",
            opacity: !videoFile || duration <= 0 ? 0.4 : 1,
            boxShadow: stage === "encoding" ? "none" : "0 2px 14px rgba(79,127,255,0.35)",
          }}
        >
          {stage === "encoding"
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Exporting... {Math.round(percent)}%</>
            : <><Clapperboard className="w-4 h-4" /> Export Video</>}
        </button>
      )}

      {duration <= 0 && (
        <p className="text-[11px]" style={{ color: "#ff8080" }}>
          Wait for the video preview to finish loading before exporting.
        </p>
      )}

      {stage === "encoding" && (
        <div className="space-y-2">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface3)" }}>
            <div className="h-full rounded-full progress-shimmer transition-all duration-500"
              style={{ width: `${Math.max(4, percent)}%` }} />
          </div>
          <div className="flex justify-between">
            <p className="text-[11px]" style={{ color: "var(--text3)" }}>{message}</p>
            <p className="text-[11px] font-mono" style={{ color: "var(--text3)" }}>{Math.round(percent)}%</p>
          </div>
          <p className="text-[10px]" style={{ color: "var(--text3)" }}>
            {renderer === "preview"
              ? "Preview Match uses the browser renderer for closer font and caption styling, but it is slower."
              : "Native FFmpeg renders faster on the server route, but text can differ from the live preview."}
          </p>
        </div>
      )}

      {stage === "done" && downloadUrl && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg text-sm"
            style={{ background: "rgba(62,207,142,0.08)", border: "1px solid rgba(62,207,142,0.2)", color: "#3ecf8e" }}>
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{renderer === "native" ? "Download started in your browser." : "Export complete!"}</span>
          </div>
          <a href={downloadUrl} download={renderer === "preview" ? `clipai-${Date.now()}.${downloadExtension}` : downloadName ?? undefined}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm transition-colors"
            style={{ background: "#3ecf8e", color: "#0a2e20" }}>
            <Download className="w-4 h-4" /> {renderer === "native" ? "Download again" : `Download ${downloadExtension.toUpperCase()}`}
          </a>
          <button onClick={() => {
            revokeObjectUrl(downloadUrl);
            setStage("idle");
            setDownloadUrl(null);
            setDownloadName(null);
          }}
            className="w-full text-[11px] py-1.5 transition-colors"
            style={{ color: "var(--text3)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text2)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}>
            Export again
          </button>
        </div>
      )}

      {stage === "error" && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 rounded-lg text-sm"
            style={{ background: "rgba(255,95,95,0.08)", border: "1px solid rgba(255,95,95,0.2)", color: "#ff8080" }}>
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Export failed</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#ff6666" }}>{message}</p>
            </div>
          </div>
          <button onClick={() => setStage("idle")} className="w-full text-[11px] py-1.5"
            style={{ color: "var(--text3)" }}>Try again</button>
        </div>
      )}
    </div>
  );
}
