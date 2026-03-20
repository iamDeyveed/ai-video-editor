"use client";

import { useRef, useEffect } from "react";
import { formatTimeShort } from "@/lib/filters";

interface TimelineProps {
  duration: number;
  trimStart: number;
  trimEnd: number;
  currentTime: number;
  onTrimChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
}

export default function Timeline({
  duration, trimStart, trimEnd, currentTime, onTrimChange, onSeek,
}: TimelineProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "playhead" | null>(null);

  const toP = (t: number) => duration > 0 ? (t / duration) * 100 : 0;
  const fromFrac = (f: number) => f * duration;

  const getX = (e: MouseEvent | React.MouseEvent) => {
    const rect = railRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current) return;
      const frac = getX(e);
      const t = fromFrac(frac);
      if (dragging.current === "start") onTrimChange(Math.min(t, trimEnd - 0.5), trimEnd);
      else if (dragging.current === "end") onTrimChange(trimStart, Math.max(t, trimStart + 0.5));
      else onSeek(Math.max(trimStart, Math.min(trimEnd, t)));
    };
    const up = () => { dragging.current = null; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  });

  const interval = duration <= 30 ? 5 : duration <= 120 ? 15 : duration <= 300 ? 30 : 60;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) ticks.push(t);

  const sp = toP(trimStart);
  const ep = toP(trimEnd);
  const pp = toP(currentTime);

  return (
    <div className="flex flex-col gap-1" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "var(--text3)" }}>
          Timeline
        </span>
        <div className="flex gap-4 text-[11px] font-mono" style={{ color: "var(--text3)" }}>
          <span>
            <span style={{ color: "var(--text3)" }}>In </span>
            <span style={{ color: "var(--text2)" }}>{formatTimeShort(trimStart)}</span>
          </span>
          <span>
            <span style={{ color: "var(--text3)" }}>Out </span>
            <span style={{ color: "var(--text2)" }}>{formatTimeShort(trimEnd)}</span>
          </span>
          <span>
            <span style={{ color: "var(--text3)" }}>Dur </span>
            <span style={{ color: "var(--accent2)" }}>{formatTimeShort(trimEnd - trimStart)}</span>
          </span>
        </div>
      </div>

      {/* Rail */}
      <div
        ref={railRef}
        className="relative rounded-md cursor-pointer overflow-visible"
        style={{ height: 40, background: "var(--surface2)", border: "1px solid var(--border)" }}
        onClick={(e) => {
          if (dragging.current) return;
          onSeek(fromFrac(getX(e)));
        }}
      >
        {/* Waveform bars */}
        <div className="absolute inset-0 flex items-center px-1 gap-px overflow-hidden rounded-md">
          {Array.from({ length: 120 }).map((_, i) => {
            const h = 20 + Math.sin(i * 0.6) * 10 + Math.sin(i * 1.8) * 6 + Math.sin(i * 4.1) * 3;
            const inRange = (i / 120) * 100 >= sp && (i / 120) * 100 <= ep;
            return (
              <div key={i} className="flex-1 rounded-[1px]"
                style={{ height: `${h}%`, background: inRange ? "rgba(79,127,255,0.5)" : "rgba(255,255,255,0.08)" }} />
            );
          })}
        </div>

        {/* Dark overlay outside trim */}
        <div className="absolute inset-0 pointer-events-none rounded-l-md" style={{
          background: "rgba(0,0,0,0.55)", clipPath: `polygon(0 0,${sp}% 0,${sp}% 100%,0 100%)`,
        }} />
        <div className="absolute inset-0 pointer-events-none rounded-r-md" style={{
          background: "rgba(0,0,0,0.55)", clipPath: `polygon(${ep}% 0,100% 0,100% 100%,${ep}% 100%)`,
        }} />

        {/* Trim selection border top/bottom */}
        <div className="absolute top-0 pointer-events-none" style={{
          left: `${sp}%`, width: `${ep - sp}%`, height: "100%",
          borderTop: "1.5px solid var(--accent)", borderBottom: "1.5px solid var(--accent)",
        }} />

        {/* Start handle */}
        <div
          className="absolute top-0 h-full flex items-center justify-center cursor-ew-resize z-10 select-none"
          style={{ left: `${sp}%`, transform: "translateX(-100%)", width: 10, background: "var(--accent)", borderRadius: "3px 0 0 3px" }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = "start"; }}
        >
          <div style={{ width: 1.5, height: "55%", background: "rgba(255,255,255,0.7)", borderRadius: 1 }} />
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 h-full flex items-center justify-center cursor-ew-resize z-10 select-none"
          style={{ left: `${ep}%`, width: 10, background: "var(--accent)", borderRadius: "0 3px 3px 0" }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = "end"; }}
        >
          <div style={{ width: 1.5, height: "55%", background: "rgba(255,255,255,0.7)", borderRadius: 1 }} />
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 h-full z-20 cursor-ew-resize select-none"
          style={{ left: `${pp}%`, transform: "translateX(-50%)" }}
          onMouseDown={(e) => { e.preventDefault(); dragging.current = "playhead"; }}
        >
          <div style={{ width: 1.5, height: "100%", background: "white", opacity: 0.9 }} />
          <div style={{
            position: "absolute", top: -4, left: "50%", transform: "translateX(-50%)",
            width: 8, height: 8, background: "white", borderRadius: "50%",
            boxShadow: "0 0 4px rgba(255,255,255,0.6)",
          }} />
        </div>
      </div>

      {/* Tick marks */}
      <div className="relative h-4">
        {ticks.map((t) => (
          <div key={t} className="absolute text-[9px] font-mono -translate-x-1/2"
            style={{ left: `${toP(t)}%`, color: "var(--text3)" }}>
            {formatTimeShort(t)}
          </div>
        ))}
      </div>
    </div>
  );
}
