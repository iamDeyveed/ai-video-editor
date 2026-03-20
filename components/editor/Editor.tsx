"use client";

import { useState, useCallback } from "react";
import { Clapperboard, Scissors, MessageSquare, Download, RotateCcw, SlidersHorizontal } from "lucide-react";
import VideoPlayer from "./VideoPlayer";
import Timeline from "./Timeline";
import AdjustmentPanel from "./AdjustmentPanel";
import CaptionsPanel from "./CaptionsPanel";
import ExportPanel from "./ExportPanel";
import { Caption, CaptionStyle, VideoAdjustments, TrimRange } from "@/types";
import { DEFAULT_ADJUSTMENTS, formatTimeShort } from "@/lib/filters";

interface EditorProps {
  videoFile: File;
  videoUrl: string;
  onReset: () => void;
}

type RightTab = "adjust" | "captions" | "trim" | "export";

const RIGHT_TABS: { id: RightTab; label: string; Icon: React.ElementType }[] = [
  { id: "adjust",   label: "Adjust",   Icon: SlidersHorizontal },
  { id: "captions", label: "Captions", Icon: MessageSquare },
  { id: "trim",     label: "Trim",     Icon: Scissors },
  { id: "export",   label: "Export",   Icon: Download },
];

export default function Editor({ videoFile, videoUrl, onReset }: EditorProps) {
  const [activeTab, setActiveTab] = useState<RightTab>("adjust");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [adjustments, setAdjustments] = useState<VideoAdjustments>(DEFAULT_ADJUSTMENTS);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({
    fontSize: 20,
    color: "#FFFFFF",
    background: false,
    position: "bottom",
    x: 50,
    y: 79,
    textAlign: "center",
    preset: "snap",
    fontFamily: "montserrat",
    maxLines: 2,
    lineHeight: 0.98,
    letterSpacing: -0.2,
  });
  const [trim, setTrim] = useState<TrimRange>({ start: 0, end: 0 });

  const handleDurationChange = useCallback((d: number) => {
    setDuration(d);
    setTrim({ start: 0, end: d });
  }, []);

  const fileSizeMB = (videoFile.size / 1024 / 1024).toFixed(1);
  const effectiveTrim = { start: trim.start, end: trim.end || duration };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header
        className="flex-shrink-0 flex items-center gap-3 px-4 py-0"
        style={{
          height: 44,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #3b6bff 0%, #6b93ff 100%)" }}>
            <Clapperboard className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold tracking-tight" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>
            Clip<span style={{ color: "var(--accent2)" }}>AI</span>
          </span>
        </div>

        <div className="w-px h-4 flex-shrink-0" style={{ background: "var(--border2)" }} />

        {/* File chip */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md flex-shrink-0"
          style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#3ecf8e" }} />
          <span className="text-[11px] font-medium max-w-[180px] truncate" style={{ color: "var(--text2)" }}>
            {videoFile.name}
          </span>
          <span className="text-[10px]" style={{ color: "var(--text3)" }}>{fileSizeMB} MB</span>
        </div>

        {duration > 0 && (
          <span className="text-[11px] font-mono" style={{ color: "var(--text3)" }}>
            {formatTimeShort(duration)}
          </span>
        )}

        <div className="flex-1" />

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
          style={{ color: "var(--text3)", background: "transparent" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.color = "var(--text2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text3)"; }}
        >
          <RotateCcw className="w-3 h-3" />
          New video
        </button>
      </header>

      {/* ── Main layout ─────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center: video + timeline */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: "1px solid var(--border)" }}>
          {/* Video area */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden"
            style={{ background: "#080808" }}>
            <div className="w-full max-w-4xl">
              <VideoPlayer
                url={videoUrl}
                adjustments={adjustments}
                captions={captions}
                captionStyle={captionStyle}
                onCaptionStyleChange={setCaptionStyle}
                trimStart={effectiveTrim.start}
                trimEnd={effectiveTrim.end}
                onDurationChange={handleDurationChange}
                onTimeUpdate={setCurrentTime}
                currentTime={currentTime}
              />
            </div>
          </div>

          {/* Timeline */}
          {duration > 0 && (
            <div className="flex-shrink-0 p-3" style={{ borderTop: "1px solid var(--border)" }}>
              <Timeline
                duration={duration}
                trimStart={effectiveTrim.start}
                trimEnd={effectiveTrim.end}
                currentTime={currentTime}
                onTrimChange={(s, e) => setTrim({ start: s, end: e })}
                onSeek={setCurrentTime}
              />
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: 300, background: "var(--surface)" }}>
          {/* Tab bar */}
          <div className="flex-shrink-0 grid grid-cols-4 relative" style={{ borderBottom: "1px solid var(--border)" }}>
            {RIGHT_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className="flex flex-col items-center gap-0.5 py-2.5 transition-colors relative"
                style={{
                  color: activeTab === id ? "var(--accent2)" : "var(--text3)",
                  background: activeTab === id ? "rgba(79,127,255,0.06)" : "transparent",
                  borderBottom: activeTab === id ? "2px solid var(--accent)" : "2px solid transparent",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[9px] font-semibold tracking-wider uppercase">{label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "adjust" && (
              <div className="flex-1 overflow-hidden">
                <AdjustmentPanel adjustments={adjustments} onChange={setAdjustments} />
              </div>
            )}

            {activeTab === "captions" && (
              <div className="flex-1 overflow-y-auto p-4">
                <CaptionsPanel
                  videoFile={videoFile}
                  captions={captions}
                  style={captionStyle}
                  onCaptionsChange={setCaptions}
                  onStyleChange={setCaptionStyle}
                />
              </div>
            )}

            {activeTab === "trim" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-[11px]" style={{ color: "var(--text3)" }}>
                  Drag the blue handles on the timeline to set in and out points.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "In Point", val: effectiveTrim.start },
                    { label: "Out Point", val: effectiveTrim.end },
                  ].map(({ label, val }) => (
                    <div key={label} className="rounded-lg p-3"
                      style={{ background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <p className="text-[9px] uppercase tracking-widest mb-1.5" style={{ color: "var(--text3)" }}>{label}</p>
                      <p className="text-base font-mono font-bold" style={{ color: "var(--text)" }}>
                        {formatTimeShort(val)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg p-3" style={{ background: "rgba(79,127,255,0.08)", border: "1px solid rgba(79,127,255,0.2)" }}>
                  <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: "var(--accent2)" }}>Clip Duration</p>
                  <p className="text-2xl font-mono font-bold" style={{ color: "var(--text)" }}>
                    {formatTimeShort(effectiveTrim.end - effectiveTrim.start)}
                  </p>
                </div>
                <p className="text-[10px]" style={{ color: "var(--text3)" }}>
                  Tip: Click anywhere on the timeline to move the playhead for precise positioning.
                </p>
              </div>
            )}

            {activeTab === "export" && (
              <div className="flex-1 overflow-y-auto p-4">
                <ExportPanel
                  videoFile={videoFile}
                  trim={effectiveTrim}
                  duration={duration}
                  adjustments={adjustments}
                  captions={captions}
                  captionStyle={captionStyle}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
