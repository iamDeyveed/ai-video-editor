"use client";

import React, { useState, useCallback } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { VideoAdjustments, LutPreset } from "@/types";
import { DEFAULT_ADJUSTMENTS, LUT_PRESETS } from "@/lib/filters";

interface AdjustmentPanelProps {
  adjustments: VideoAdjustments;
  onChange: (adj: VideoAdjustments) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  colorClass?: string;
  onChange: (v: number) => void;
  onReset: () => void;
  defaultValue?: number;
}

function SliderRow({
  label, value, min, max, step = 1, colorClass = "", onChange, onReset, defaultValue = 0,
}: SliderRowProps) {
  const pct = ((value - min) / (max - min)) * 100;
  const isDirty = Math.abs(value - defaultValue) > 0.001;

  return (
    <div className="flex items-center gap-2 group py-[5px]">
      <span
        className="text-[11px] w-24 shrink-0 cursor-default select-none"
        style={{ color: isDirty ? "var(--text)" : "var(--text2)" }}
      >
        {label}
      </span>
      <div className="flex-1 relative flex items-center">
        {/* Track fill */}
        <div className="absolute left-0 h-[3px] rounded-l pointer-events-none" style={{
          width: `${pct}%`,
          background: isDirty ? "var(--accent)" : "var(--border2)",
          transition: "background 0.2s",
        }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`adj-slider ${colorClass}`}
        />
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="number-input"
      />
      <button
        onClick={onReset}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-text3 hover:text-text2 flex-shrink-0"
        title="Reset"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  dirty?: boolean;
}

function Section({ title, children, defaultOpen = true, dirty = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: dirty ? "var(--accent2)" : "var(--text2)" }}>
          {title}
          {dirty && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-accent inline-block align-middle" />}
        </span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform duration-200"
          style={{ color: "var(--text3)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function AdjustmentPanel({ adjustments: adj, onChange }: AdjustmentPanelProps) {
  const set = useCallback(
    <K extends keyof VideoAdjustments>(key: K, value: VideoAdjustments[K]) => {
      onChange({ ...adj, [key]: value });
    },
    [adj, onChange]
  );

  const resetKey = (key: keyof VideoAdjustments) => {
    onChange({ ...adj, [key]: DEFAULT_ADJUSTMENTS[key] });
  };

  const resetSection = (keys: (keyof VideoAdjustments)[]) => {
    const patch: Partial<VideoAdjustments> = {};
    keys.forEach((k) => { (patch as Record<string, unknown>)[k] = DEFAULT_ADJUSTMENTS[k]; });
    onChange({ ...adj, ...patch });
  };

  const isSectionDirty = (keys: (keyof VideoAdjustments)[]) =>
    keys.some((k) => {
      const v = adj[k];
      const d = DEFAULT_ADJUSTMENTS[k];
      return typeof v === "number" ? Math.abs((v as number) - (d as number)) > 0.001 : v !== d;
    });

  const toneKeys: (keyof VideoAdjustments)[] = ["exposure", "contrast", "highlights", "shadows", "whites", "blacks"];
  const presenceKeys: (keyof VideoAdjustments)[] = ["clarity", "vibrance", "saturation"];
  const detailKeys: (keyof VideoAdjustments)[] = ["sharpening", "noiseReduction"];
  const colorKeys: (keyof VideoAdjustments)[] = ["temperature", "tint"];
  const effectKeys: (keyof VideoAdjustments)[] = ["vignette"];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: "var(--surface)" }}>
      {/* LUT Presets */}
      <div className="panel-section">
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "var(--text2)" }}>
              LUT Presets
            </span>
            {adj.lut !== "none" && (
              <button
                onClick={() => set("lut", "none")}
                className="text-[10px] transition-colors"
                style={{ color: "var(--text3)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}
              >
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {LUT_PRESETS.map((lut) => (
              <LUTCard
                key={lut.id}
                lut={lut}
                selected={adj.lut === lut.id}
                onSelect={() => set("lut", lut.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable adjustment sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Tone */}
        <Section title="Tone" dirty={isSectionDirty(toneKeys)}>
          <div className="flex justify-end mb-1">
            {isSectionDirty(toneKeys) && (
              <button onClick={() => resetSection(toneKeys)} className="text-[10px]" style={{ color: "var(--text3)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text2)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3)")}
              >Reset all</button>
            )}
          </div>
          <SliderRow label="Exposure" value={adj.exposure} min={-3} max={3} step={0.05} onChange={(v) => set("exposure", v)} onReset={() => resetKey("exposure")} />
          <SliderRow label="Contrast" value={adj.contrast} min={-100} max={100} onChange={(v) => set("contrast", v)} onReset={() => resetKey("contrast")} />
          <SliderRow label="Highlights" value={adj.highlights} min={-100} max={100} onChange={(v) => set("highlights", v)} onReset={() => resetKey("highlights")} />
          <SliderRow label="Shadows" value={adj.shadows} min={-100} max={100} onChange={(v) => set("shadows", v)} onReset={() => resetKey("shadows")} />
          <SliderRow label="Whites" value={adj.whites} min={-100} max={100} onChange={(v) => set("whites", v)} onReset={() => resetKey("whites")} />
          <SliderRow label="Blacks" value={adj.blacks} min={-100} max={100} onChange={(v) => set("blacks", v)} onReset={() => resetKey("blacks")} />
        </Section>

        {/* Presence */}
        <Section title="Presence" dirty={isSectionDirty(presenceKeys)}>
          <SliderRow label="Clarity" value={adj.clarity} min={-100} max={100} onChange={(v) => set("clarity", v)} onReset={() => resetKey("clarity")} />
          <SliderRow label="Vibrance" value={adj.vibrance} min={-100} max={100} colorClass="positive" onChange={(v) => set("vibrance", v)} onReset={() => resetKey("vibrance")} />
          <SliderRow label="Saturation" value={adj.saturation} min={-100} max={100} colorClass="positive" onChange={(v) => set("saturation", v)} onReset={() => resetKey("saturation")} />
        </Section>

        {/* Color */}
        <Section title="Color" dirty={isSectionDirty(colorKeys)}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px]" style={{ color: "var(--text3)" }}>Cool</span>
            <span className="text-[10px]" style={{ color: "var(--text3)" }}>Warm</span>
          </div>
          <SliderRow label="Temperature" value={adj.temperature} min={-100} max={100} colorClass="warm" onChange={(v) => set("temperature", v)} onReset={() => resetKey("temperature")} />
          <SliderRow label="Tint" value={adj.tint} min={-100} max={100} onChange={(v) => set("tint", v)} onReset={() => resetKey("tint")} />
        </Section>

        {/* Detail */}
        <Section title="Detail" dirty={isSectionDirty(detailKeys)} defaultOpen={false}>
          <SliderRow label="Sharpening" value={adj.sharpening} min={0} max={150} onChange={(v) => set("sharpening", v)} onReset={() => resetKey("sharpening")} defaultValue={0} />
          <SliderRow label="Noise Reduc." value={adj.noiseReduction} min={0} max={100} onChange={(v) => set("noiseReduction", v)} onReset={() => resetKey("noiseReduction")} defaultValue={0} />
        </Section>

        {/* Effects */}
        <Section title="Effects" dirty={isSectionDirty(effectKeys)} defaultOpen={false}>
          <SliderRow label="Vignette" value={adj.vignette} min={-100} max={100} onChange={(v) => set("vignette", v)} onReset={() => resetKey("vignette")} />
        </Section>
      </div>

      {/* Reset all */}
      <div className="px-4 py-2.5 border-t" style={{ borderColor: "var(--border)" }}>
        <button
          onClick={() => onChange({ ...DEFAULT_ADJUSTMENTS })}
          className="w-full py-1.5 text-[11px] font-medium rounded-md transition-colors"
          style={{ color: "var(--text3)", background: "transparent" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--text2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text3)"; }}
        >
          Reset All Adjustments
        </button>
      </div>
    </div>
  );
}

function LUTCard({ lut, selected, onSelect }: { lut: LutPreset; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`lut-card rounded-lg overflow-hidden text-left ${selected ? "selected" : ""}`}
      style={{ border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}` }}
    >
      <div
        className="h-9 w-full"
        style={{ background: lut.thumbnail }}
      />
      <div className="px-1.5 py-1" style={{ background: "var(--surface2)" }}>
        <p className="text-[10px] font-medium truncate" style={{ color: selected ? "var(--accent2)" : "var(--text2)" }}>
          {lut.name}
        </p>
        <p className="text-[9px] truncate" style={{ color: "var(--text3)" }}>{lut.category}</p>
      </div>
    </button>
  );
}
