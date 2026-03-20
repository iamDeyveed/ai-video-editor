"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, Clapperboard, AlertCircle } from "lucide-react";

interface VideoUploadProps {
  onVideoLoaded: (file: File, url: string) => void;
}

const SUPPORTED_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"];
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;

export default function VideoUpload({ onVideoLoaded }: VideoUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    setError(null);
    const validExt = /\.(mp4|mov|webm|m4v)$/i.test(file.name);

    if (!SUPPORTED_TYPES.includes(file.type) && !validExt) {
      setError("Unsupported format. Please upload MP4, MOV, or WebM.");
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File too large. Maximum 1GB.");
      return;
    }

    setLoading(true);
    const url = URL.createObjectURL(file);
    setTimeout(() => {
      onVideoLoaded(file, url);
      setLoading(false);
    }, 100);
  }, [onVideoLoaded]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-8"
      style={{ background: "var(--bg)" }}
    >
      <div className="mb-12 flex flex-col items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #3b6bff 0%, #6b93ff 100%)",
              boxShadow: "0 4px 20px rgba(79,127,255,0.35)",
            }}
          >
            <Clapperboard className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-2xl font-bold tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
              Clip<span style={{ color: "var(--accent2)" }}>AI</span>
            </span>
          </div>
        </div>
        <p className="text-sm" style={{ color: "var(--text2)" }}>
          Professional AI video editor in your browser
        </p>
      </div>

      <div
        className={`upload-zone w-full max-w-lg rounded-2xl cursor-pointer flex flex-col items-center gap-5 transition-all ${dragging ? "drag-active" : ""}`}
        style={{
          background: dragging ? "rgba(79,127,255,0.06)" : "var(--surface)",
          padding: "48px 32px",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) processFile(file);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
          }}
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
            />
            <p className="text-sm" style={{ color: "var(--text2)" }}>Loading video...</p>
          </div>
        ) : (
          <>
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: dragging ? "rgba(79,127,255,0.15)" : "var(--surface2)",
                border: `1px solid ${dragging ? "var(--accent)" : "var(--border2)"}`,
                transition: "all 0.2s",
              }}
            >
              <Upload className="w-6 h-6" style={{ color: dragging ? "var(--accent2)" : "var(--text3)" }} />
            </div>
            <div className="text-center">
              <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                {dragging ? "Drop to open" : "Drop a video here"}
              </p>
              <p className="text-sm" style={{ color: "var(--text3)" }}>
                MP4 · MOV · WebM · Up to 1 GB
              </p>
            </div>
            <button
              className="px-5 py-2 rounded-lg text-sm font-semibold pointer-events-none transition-colors"
              style={{ background: "var(--accent)", color: "white", boxShadow: "0 2px 12px rgba(79,127,255,0.35)" }}
            >
              Browse Files
            </button>
          </>
        )}
      </div>

      {error && (
        <div
          className="mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-xl max-w-lg w-full"
          style={{ background: "rgba(255,95,95,0.08)", border: "1px solid rgba(255,95,95,0.2)", color: "#ff8080" }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-2 justify-center">
        {["Exposure & Tone", "LUT Presets", "Clarity & Vibrance", "AI Captions", "Trim & Export"].map((feature) => (
          <span
            key={feature}
            className="px-3 py-1.5 rounded-full text-xs"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text3)" }}
          >
            {feature}
          </span>
        ))}
      </div>
    </div>
  );
}
