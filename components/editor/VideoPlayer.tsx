"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { Caption, CaptionStyle, VideoAdjustments } from "@/types";
import { getCaptionAccentFontStack, getCaptionFontStack, isGlowScriptPreset, isSnapCaptionPreset, splitCaptionForGlowScript, splitGlowCaptionIntoLines } from "@/lib/captions";
import { adjustmentsToCSSFilter } from "@/lib/filters";

interface VideoPlayerProps {
  url: string;
  adjustments: VideoAdjustments;
  captions: Caption[];
  captionStyle: CaptionStyle;
  onCaptionStyleChange: (style: CaptionStyle) => void;
  trimStart: number;
  trimEnd: number;
  onDurationChange: (d: number) => void;
  onTimeUpdate: (t: number) => void;
  currentTime: number;
}

function formatTC(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const fr = Math.floor((s % 1) * 30);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}:${String(fr).padStart(2,"0")}`;
}

export default function VideoPlayer({
  url, adjustments, captions, captionStyle,
  onCaptionStyleChange, trimStart, trimEnd, onDurationChange, onTimeUpdate, currentTime,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [localTime, setLocalTime] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [draggingCaption, setDraggingCaption] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const h = () => { setDuration(v.duration); onDurationChange(v.duration); };
    v.addEventListener("loadedmetadata", h);
    return () => v.removeEventListener("loadedmetadata", h);
  }, [onDurationChange]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const h = () => {
      setLocalTime(v.currentTime);
      onTimeUpdate(v.currentTime);
      if (v.currentTime >= trimEnd && trimEnd > 0) {
        v.currentTime = trimStart;
        if (!v.paused) v.play();
      }
    };
    v.addEventListener("timeupdate", h);
    return () => v.removeEventListener("timeupdate", h);
  }, [trimStart, trimEnd, onTimeUpdate]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || Math.abs(v.currentTime - currentTime) < 0.3) return;
    v.currentTime = currentTime;
  }, [currentTime]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime >= trimEnd) v.currentTime = trimStart;
      v.play(); setPlaying(true);
    } else { v.pause(); setPlaying(false); }
  };

  const cssFilter = adjustmentsToCSSFilter(adjustments);
  const activeCaption = [...captions].reverse().find((c) => localTime >= c.start && localTime <= c.end);
  const progress = duration > 0 ? (localTime / duration) * 100 : 0;
  const trimStartPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const trimEndPct = duration > 0 ? (trimEnd / duration) * 100 : 100;

  const captionPlacement = {
    left: `${captionStyle.x}%`,
    top: `${captionStyle.y}%`,
    transform: `translate(${captionStyle.textAlign === "left" ? "0" : captionStyle.textAlign === "right" ? "-100%" : "-50%"}, -50%)`,
  };
  const isSnapPreset = isSnapCaptionPreset(captionStyle.preset);
  const glowParts = activeCaption ? splitCaptionForGlowScript(activeCaption.text) : [];
  const glowLines = activeCaption ? splitGlowCaptionIntoLines(activeCaption.text) : [];

  const updateCaptionPosition = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    onCaptionStyleChange({ ...captionStyle, x, y });
  };

  const handleCaptionPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingCaption(true);
    updateCaptionPosition(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCaptionPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingCaption) return;
    updateCaptionPosition(event.clientX, event.clientY);
  };

  const handleCaptionPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingCaption) return;
    setDraggingCaption(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black overflow-hidden"
      style={{ aspectRatio: "16/9" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <video
        ref={videoRef}
        src={url}
        className="w-full h-full object-contain"
        style={{ filter: cssFilter, transition: "filter 0.05s" }}
        onClick={togglePlay}
        playsInline
      />

      {/* Captions */}
      {activeCaption && (
        <div
          key={activeCaption.id}
          className="caption-overlay"
          onPointerDown={handleCaptionPointerDown}
          onPointerMove={handleCaptionPointerMove}
          onPointerUp={handleCaptionPointerUp}
          style={{
            ...captionPlacement,
            fontSize: captionStyle.fontSize,
            color: captionStyle.color,
            background: captionStyle.background ? "rgba(0,0,0,0.72)" : "transparent",
            padding: captionStyle.background ? "4px 14px" : "0",
            borderRadius: captionStyle.background ? "5px" : "0",
            fontWeight: captionStyle.preset === "social" || captionStyle.preset === "glow-script" || isSnapPreset ? 800 : 600,
            textShadow: captionStyle.background || captionStyle.preset === "glow-script"
              ? "none"
              : isSnapPreset
                ? "0 2px 10px rgba(0,0,0,0.5), 0 0 2px rgba(0,0,0,0.35)"
                : "0 1px 6px rgba(0,0,0,0.9)",
            textTransform: captionStyle.preset === "social" ? "uppercase" : "none",
            letterSpacing: `${captionStyle.letterSpacing}px`,
            fontFamily: getCaptionFontStack(captionStyle.fontFamily),
            lineHeight: captionStyle.lineHeight,
            textAlign: captionStyle.textAlign,
            pointerEvents: "auto",
            cursor: draggingCaption ? "grabbing" : "grab",
            userSelect: "none",
            whiteSpace: "pre-wrap",
            maxWidth: isSnapPreset ? "68%" : "90%",
            filter: isSnapPreset ? "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" : "none",
          }}
        >
          {isGlowScriptPreset(captionStyle.preset) && glowParts.length > 0 ? (
            <span className="caption-glow-script">
              {glowLines.map((line, lineIndex) => (
                <span key={`${activeCaption.id}-glow-line-${lineIndex}`} className="caption-glow-line">
                  {line.map((part, index) => (
                    <span
                      key={`${activeCaption.id}-glow-${lineIndex}-${index}`}
                      className={part.accent ? "caption-accent" : "caption-regular"}
                      style={part.accent
                        ? { fontFamily: getCaptionAccentFontStack(), fontSize: `${captionStyle.fontSize * 1.28}px`, fontWeight: 400 }
                        : undefined}
                    >
                      {part.text}
                    </span>
                  ))}
                </span>
              ))}
            </span>
          ) : (
            activeCaption.text
          )}
        </div>
      )}

      {/* Center play button */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center cursor-pointer" onClick={togglePlay}>
          <div
            className="w-16 h-16 flex items-center justify-center rounded-full transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(8px)",
              border: "1.5px solid rgba(255,255,255,0.2)",
              opacity: hovered ? 1 : 0.7,
              transform: hovered ? "scale(1.05)" : "scale(1)",
            }}
          >
            <Play className="w-7 h-7 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col transition-opacity duration-200"
        style={{
          opacity: hovered || !playing ? 1 : 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
          paddingBottom: 10, paddingLeft: 12, paddingRight: 12, paddingTop: 24,
        }}
      >
        {/* Scrub bar */}
        <div
          className="relative h-[3px] mb-2.5 rounded-full cursor-pointer group/prog"
          style={{ background: "rgba(255,255,255,0.15)" }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = (e.clientX - rect.left) / rect.width;
            const v = videoRef.current;
            if (v) v.currentTime = frac * duration;
          }}
        >
          {/* Trim region highlight */}
          <div className="absolute top-0 h-full rounded-full pointer-events-none"
            style={{ left: `${trimStartPct}%`, width: `${trimEndPct - trimStartPct}%`, background: "rgba(79,127,255,0.35)" }} />
          {/* Playback progress */}
          <div className="absolute top-0 left-0 h-full rounded-full pointer-events-none"
            style={{ width: `${progress}%`, background: "rgba(255,255,255,0.9)" }} />
          {/* Hover expand effect */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover/prog:opacity-100 pointer-events-none transition-opacity"
            style={{ left: `${progress}%` }} />
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2.5">
          <button onClick={togglePlay} className="text-white hover:text-white/80 transition-colors">
            {playing
              ? <Pause className="w-4 h-4 fill-current" />
              : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(!muted); } }}
            className="text-white/70 hover:text-white transition-colors">
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          <span className="font-mono text-[11px] text-white/60 ml-1 tracking-wider">
            {formatTC(localTime)}
          </span>
          <span className="text-[11px] text-white/30">·</span>
          <span className="font-mono text-[11px] text-white/40 tracking-wider">
            {formatTC(duration)}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => containerRef.current?.requestFullscreen?.()}
            className="text-white/50 hover:text-white transition-colors"
          >
            <Maximize className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
