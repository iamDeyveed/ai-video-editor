import { VideoAdjustments, LutPreset } from "@/types";

export const DEFAULT_ADJUSTMENTS: VideoAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  clarity: 0,
  vibrance: 0,
  saturation: 0,
  sharpening: 0,
  noiseReduction: 0,
  temperature: 0,
  tint: 0,
  vignette: 0,
  lut: "none",
};

export const LUT_PRESETS: LutPreset[] = [
  {
    id: "none",
    name: "None",
    category: "Base",
    thumbnail: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    ffmpegFilter: "",
    cssVars: {},
  },
  {
    id: "cinematic_teal",
    name: "Teal Shadow",
    category: "Cinematic",
    thumbnail: "linear-gradient(135deg, #0d3b47 0%, #1a5c6e 40%, #c96a2a 100%)",
    ffmpegFilter: "colorchannelmixer=rr=1.05:gg=0.92:bb=0.88:rb=0.08:gb=0.03,curves=all='0/0 0.25/0.18 0.75/0.82 1/1'",
    cssVars: { contrast: 15, saturation: 10, temperature: 15 },
  },
  {
    id: "film_kodak",
    name: "Kodak Gold",
    category: "Film",
    thumbnail: "linear-gradient(135deg, #c8882a 0%, #e8b84b 40%, #f5d67a 100%)",
    ffmpegFilter: "curves=red='0/0.04 0.5/0.56 1/1.0':green='0/0.02 0.5/0.52 1/0.97':blue='0/0 0.5/0.46 1/0.88',colorbalance=ss=0.05:ms=0.03",
    cssVars: { temperature: 30, saturation: 15, contrast: 8 },
  },
  {
    id: "film_fuji",
    name: "Fuji Velvia",
    category: "Film",
    thumbnail: "linear-gradient(135deg, #2d5a1b 0%, #4a8f2e 40%, #e8c840 100%)",
    ffmpegFilter: "curves=red='0/0 0.5/0.54 1/1.02':green='0/0 0.5/0.53 1/1.0':blue='0/0 0.5/0.44 1/0.92',eq=saturation=1.35:contrast=1.08",
    cssVars: { saturation: 35, contrast: 8, temperature: 5 },
  },
  {
    id: "matte_fade",
    name: "Matte Fade",
    category: "Cinematic",
    thumbnail: "linear-gradient(135deg, #6b7a8a 0%, #8fa3b1 50%, #b8c9d4 100%)",
    ffmpegFilter: "curves=all='0/0.08 0.5/0.5 1/0.92',eq=saturation=0.75:contrast=0.9",
    cssVars: { contrast: -20, saturation: -25, blacks: 20 },
  },
  {
    id: "noir",
    name: "Noir",
    category: "Cinematic",
    thumbnail: "linear-gradient(135deg, #0a0a0a 0%, #2a2a2a 50%, #4a4a4a 100%)",
    ffmpegFilter: "hue=s=0,curves=all='0/0 0.3/0.15 0.7/0.85 1/1',unsharp=5:5:0.8",
    cssVars: { saturation: -100, contrast: 25, sharpening: 40 },
  },
  {
    id: "golden_hour",
    name: "Golden Hour",
    category: "Mood",
    thumbnail: "linear-gradient(135deg, #ff7e00 0%, #ffb347 50%, #ffd700 100%)",
    ffmpegFilter: "curves=red='0/0 0.5/0.6 1/1.08':green='0/0 0.5/0.52 1/0.94':blue='0/0 0.5/0.38 1/0.78',eq=saturation=1.2:brightness=1.05",
    cssVars: { temperature: 55, saturation: 20, exposure: 0.15 },
  },
  {
    id: "arctic_blue",
    name: "Arctic Blue",
    category: "Mood",
    thumbnail: "linear-gradient(135deg, #0a2a4a 0%, #1565c0 50%, #82b1ff 100%)",
    ffmpegFilter: "curves=red='0/0 0.5/0.44 1/0.9':green='0/0 0.5/0.5 1/0.96':blue='0/0.04 0.5/0.57 1/1.1',eq=saturation=0.9",
    cssVars: { temperature: -40, saturation: -10, contrast: 10 },
  },
  {
    id: "vintage_85",
    name: "Vintage 85",
    category: "Retro",
    thumbnail: "linear-gradient(135deg, #8b5e3c 0%, #c49a6c 50%, #e8d5a3 100%)",
    ffmpegFilter: "curves=all='0/0.05 0.5/0.52 1/0.94':red='0/0.05 1/1.0':blue='0/0 1/0.82',eq=saturation=0.7:contrast=0.95",
    cssVars: { temperature: 20, saturation: -30, contrast: -5, blacks: 10 },
  },
  {
    id: "neon_noir",
    name: "Neon Noir",
    category: "Retro",
    thumbnail: "linear-gradient(135deg, #1a0030 0%, #6600cc 50%, #ff0080 100%)",
    ffmpegFilter: "curves=red='0/0 0.5/0.55 1/1.1':blue='0/0.05 0.5/0.6 1/1.15',eq=saturation=1.4:contrast=1.15",
    cssVars: { saturation: 40, contrast: 15, tint: 20 },
  },
  {
    id: "desert_dust",
    name: "Desert Dust",
    category: "Mood",
    thumbnail: "linear-gradient(135deg, #c4a882 0%, #d4b896 50%, #e8d4b8 100%)",
    ffmpegFilter: "curves=red='0/0.02 1/1.02':green='0/0.01 1/0.98':blue='0/0 1/0.85',eq=saturation=0.85:contrast=1.05,vignette=PI/4",
    cssVars: { temperature: 25, saturation: -15, contrast: 5, vignette: -30 },
  },
];

// Convert adjustments to CSS filter string for live preview
export function adjustmentsToCSSFilter(adj: VideoAdjustments): string {
  const parts: string[] = [];

  // Exposure → brightness
  const brightness = Math.pow(2, adj.exposure) * (1 + adj.whites * 0.003) * (1 - adj.blacks * 0.002);
  parts.push(`brightness(${brightness.toFixed(3)})`);

  // Contrast
  const contrast = 1 + adj.contrast * 0.012;
  parts.push(`contrast(${Math.max(0.1, contrast).toFixed(3)})`);

  // Saturation = base saturation + vibrance approximation
  const sat = 1 + adj.saturation * 0.012 + adj.vibrance * 0.006;
  parts.push(`saturate(${Math.max(0, sat).toFixed(3)})`);

  // Temperature → sepia/hue-rotate approximation
  if (adj.temperature > 0) {
    parts.push(`sepia(${(adj.temperature * 0.004).toFixed(3)})`);
  } else if (adj.temperature < 0) {
    parts.push(`hue-rotate(${(adj.temperature * 0.15).toFixed(1)}deg)`);
  }

  // Tint (green/magenta)
  if (Math.abs(adj.tint) > 2) {
    parts.push(`hue-rotate(${(adj.tint * 0.1).toFixed(1)}deg)`);
  }

  // Sharpening → contrast boost approximation (real sharp needs canvas)
  if (adj.sharpening > 5) {
    const sharpContrast = 1 + adj.sharpening * 0.002;
    parts.push(`contrast(${sharpContrast.toFixed(3)})`);
  }

  // Apply LUT preset css approximation on top
  const lut = LUT_PRESETS.find((l) => l.id === adj.lut);
  if (lut && Object.keys(lut.cssVars).length > 0) {
    const lutAdj = { ...DEFAULT_ADJUSTMENTS, ...lut.cssVars };
    const lutBright = 1 + (lutAdj.exposure || 0) * 0.15;
    if (Math.abs(lutBright - 1) > 0.01) parts.push(`brightness(${lutBright.toFixed(3)})`);
  }

  return parts.join(" ");
}

// Build the ffmpeg vf filter string from adjustments
export function adjustmentsToFFmpegFilter(adj: VideoAdjustments): string {
  const filters: string[] = [];

  // LUT preset first (base look)
  const lut = LUT_PRESETS.find((l) => l.id === adj.lut);
  if (lut?.ffmpegFilter) {
    filters.push(lut.ffmpegFilter);
  }

  // Exposure: use curves
  if (Math.abs(adj.exposure) > 0.02) {
    const ev = Math.pow(2, adj.exposure);
    const cap = Math.min(1, ev).toFixed(3);
    filters.push(`curves=all='0/0 1/${cap}'`);
  }

  // Contrast via eq
  const contrastEq = 1 + adj.contrast * 0.01;
  const satEq = 1 + adj.saturation * 0.012 + adj.vibrance * 0.006;
  const brightEq = 1 + adj.blacks * 0.004;
  if (Math.abs(contrastEq - 1) > 0.01 || Math.abs(satEq - 1) > 0.01 || Math.abs(brightEq - 1) > 0.01) {
    filters.push(`eq=contrast=${Math.max(0.1, contrastEq).toFixed(3)}:saturation=${Math.max(0, satEq).toFixed(3)}:brightness=${brightEq.toFixed(3)}`);
  }

  // Highlights & Shadows via curves
  if (Math.abs(adj.highlights) > 2 || Math.abs(adj.shadows) > 2) {
    const hiY = (1 + adj.highlights * 0.004).toFixed(3);
    const shadowY = (adj.shadows * 0.003).toFixed(3);
    filters.push(`curves=all='0/${shadowY} 0.5/0.5 1/${hiY}'`);
  }

  // Temperature: colorchannelmixer
  if (Math.abs(adj.temperature) > 3) {
    const warmR = (1 + adj.temperature * 0.003).toFixed(3);
    const warmB = (1 - adj.temperature * 0.004).toFixed(3);
    filters.push(`colorchannelmixer=rr=${warmR}:bb=${Math.max(0.2, parseFloat(warmB)).toFixed(3)}`);
  }

  // Sharpening via unsharp
  if (adj.sharpening > 3) {
    const s = (adj.sharpening * 0.02).toFixed(2);
    filters.push(`unsharp=5:5:${s}:5:5:0`);
  }

  // Noise reduction via nlmeans (simplified)
  if (adj.noiseReduction > 10) {
    const nr = (adj.noiseReduction * 0.15).toFixed(1);
    filters.push(`hqdn3d=${nr}:${nr}:${nr}:${nr}`);
  }

  // Vignette
  if (Math.abs(adj.vignette) > 5) {
    const angle = adj.vignette > 0
      ? `PI/${(6 - adj.vignette * 0.04).toFixed(2)}`
      : `PI/${(3 + Math.abs(adj.vignette) * 0.05).toFixed(2)}`;
    filters.push(`vignette=${angle}`);
  }

  return filters.join(",");
}

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
};

export const formatTimeShort = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
