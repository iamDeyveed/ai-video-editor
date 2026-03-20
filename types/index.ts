export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface TrimRange {
  start: number;
  end: number;
}

export interface CaptionStyle {
  fontSize: number;
  color: string;
  background: boolean;
  position: 'bottom' | 'top' | 'middle';
  x: number;
  y: number;
  textAlign: 'left' | 'center' | 'right';
  preset: 'default' | 'social' | 'highlighted' | 'glow-script' | 'snap';
  fontFamily: 'outfit' | 'poppins' | 'montserrat' | 'bebas-neue' | 'system' | 'parisienne';
  maxLines: 1 | 2 | 3;
  lineHeight: number;
  letterSpacing: number;
}

export interface ExportProgress {
  stage: 'idle' | 'trimming' | 'grading' | 'captions' | 'encoding' | 'done' | 'error';
  percent: number;
  message: string;
}

export interface VideoState {
  file: File | null;
  url: string | null;
  duration: number;
  width: number;
  height: number;
}

// NEW: Photoshop-grade adjustments
export interface VideoAdjustments {
  // Tone
  exposure: number;       // -2 to +2 (EV stops)
  contrast: number;       // -100 to +100
  highlights: number;     // -100 to +100
  shadows: number;        // -100 to +100
  whites: number;         // -100 to +100
  blacks: number;         // -100 to +100
  // Presence
  clarity: number;        // -100 to +100 (midtone contrast)
  vibrance: number;       // -100 to +100
  saturation: number;     // -100 to +100
  // Detail
  sharpening: number;     // 0 to 150
  noiseReduction: number; // 0 to 100
  // Color
  temperature: number;    // -100 to +100 (cool to warm)
  tint: number;           // -100 to +100 (green to magenta)
  // Vignette
  vignette: number;       // -100 to +100
  // LUT preset
  lut: string;            // preset id or 'none'
}

export interface LutPreset {
  id: string;
  name: string;
  category: string;
  thumbnail: string; // css gradient
  ffmpegFilter: string;
  cssVars: Partial<VideoAdjustments>; // approximation for live preview
}
