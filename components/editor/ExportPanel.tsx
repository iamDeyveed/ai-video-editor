"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, CheckCircle2, AlertCircle, Clapperboard } from "lucide-react";
import { Caption, CaptionStyle, VideoAdjustments, TrimRange } from "@/types";
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
  const [downloadExtension, setDownloadExtension] = useState("mp4");
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
    setDownloadExtension("mp4");
    setStage("encoding");
    setPercent(0);
    setMessage("Preparing export...");

    let progressTimer: number | null = null;
    try {
      let currentPercent = 0;
      progressTimer = window.setInterval(() => {
        currentPercent = Math.min(currentPercent + 4, 94);
        setPercent(currentPercent);
      }, 500);

      const formData = new FormData();
      formData.append("file", videoFile, videoFile.name);
      formData.append("payload", JSON.stringify({
        trim,
        adjustments,
        captions,
        captionStyle,
        quality: "balanced",
      }));

      setMessage("Rendering video...");
      const response = await fetch("/api/export", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Export failed");
      }

      const data = await response.json().catch(() => null) as { downloadUrl?: string; fileName?: string } | null;
      if (!data?.downloadUrl) {
        throw new Error("Export finished but no download link was returned");
      }

      setPercent(96);
      setMessage("Downloading video...");
      const downloadResponse = await fetch(data.downloadUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (!downloadResponse.ok) {
        const errorData = await downloadResponse.json().catch(() => null);
        throw new Error(errorData?.error || "Download failed");
      }

      const finalBlob = await downloadResponse.blob();
      if (finalBlob.size < 1024) {
        throw new Error("Exported file was empty or invalid");
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
        <SummaryRow label="Format" value="MP4" />
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
