import { Caption, CaptionStyle } from "@/types";

type WordTimestamp = {
  start: number;
  end: number;
  word: string;
};

type SegmentTimestamp = {
  id?: string | number;
  start: number;
  end: number;
  text: string;
};

export const CAPTION_FONT_OPTIONS: { id: CaptionStyle["fontFamily"]; label: string }[] = [
  { id: "outfit", label: "Outfit" },
  { id: "poppins", label: "Poppins" },
  { id: "montserrat", label: "Montserrat" },
  { id: "bebas-neue", label: "Bebas Neue" },
  { id: "parisienne", label: "Parisienne" },
  { id: "system", label: "System Sans" },
];

const FONT_STACKS: Record<CaptionStyle["fontFamily"], string> = {
  outfit: "\"Outfit\", \"Inter\", \"Segoe UI\", sans-serif",
  poppins: "\"Poppins\", \"Avenir Next\", \"Segoe UI\", sans-serif",
  montserrat: "\"Montserrat\", \"Arial\", sans-serif",
  "bebas-neue": "\"Bebas Neue\", Impact, sans-serif",
  parisienne: "\"Parisienne\", \"Brush Script MT\", cursive",
  system: "\"SF Pro Display\", -apple-system, BlinkMacSystemFont, \"Segoe UI\", system-ui, sans-serif",
};

export function getCaptionFontStack(fontFamily: CaptionStyle["fontFamily"]) {
  return FONT_STACKS[fontFamily];
}

export function getCaptionAccentFontStack() {
  return FONT_STACKS.parisienne;
}

export function isGlowScriptPreset(preset: CaptionStyle["preset"]) {
  return preset === "glow-script";
}

export function isSnapCaptionPreset(preset: CaptionStyle["preset"]) {
  return preset === "snap";
}

export function splitCaptionForGlowScript(text: string) {
  const words = cleanCaptionText(text).split(" ").filter(Boolean);
  return words.map((word, index) => ({
    text: word,
    accent: index % 2 === 1,
  }));
}

export function splitGlowCaptionIntoLines(text: string) {
  const parts = splitCaptionForGlowScript(text);
  if (parts.length <= 2) return [parts];

  const midpoint = Math.ceil(parts.length / 2);
  return [parts.slice(0, midpoint), parts.slice(midpoint)];
}

export function splitCaptionIntoLines(text: string, maxLines: number) {
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => cleanCaptionText(line))
    .filter(Boolean);

  if (rawLines.length === 0) return [];
  if (rawLines.length >= maxLines) return rawLines.slice(0, maxLines);

  const remainingCapacity = maxLines - rawLines.length;
  const expandedLines: string[] = [];

  rawLines.forEach((line) => {
    const words = line.split(" ").filter(Boolean);
    if (words.length <= 2 || remainingCapacity <= 0) {
      expandedLines.push(line);
      return;
    }

    const lineCount = Math.min(Math.ceil(words.length / 2), maxLines);
    const wordsPerLine = Math.ceil(words.length / lineCount);
    for (let index = 0; index < words.length; index += wordsPerLine) {
      expandedLines.push(words.slice(index, index + wordsPerLine).join(" "));
      if (expandedLines.length >= maxLines) return;
    }
  });

  return expandedLines.filter(Boolean).slice(0, maxLines);
}

export function getCaptionFontExportName(fontFamily: CaptionStyle["fontFamily"]) {
  return CAPTION_FONT_OPTIONS.find((font) => font.id === fontFamily)?.label ?? "Sans";
}

function cleanCaptionText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function chunkWordsIntoCaptions(words: WordTimestamp[], maxWords = 2): Caption[] {
  const captions: Caption[] = [];
  const usableWords = words
    .map((word) => ({
      ...word,
      word: cleanCaptionText(word.word),
    }))
    .filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end));

  for (let index = 0; index < usableWords.length;) {
    const chunk = usableWords.slice(index, index + maxWords);
    if (chunk.length === 0) continue;

    let chunkLength = chunk.length;
    while (chunkLength > 1) {
      const candidate = chunk[chunkLength - 1];
      const previous = chunk[chunkLength - 2];
      const endsSentence = /[.,!?]$/.test(previous.word);
      const isTooLong = candidate.end - chunk[0].start > 1.2;
      if (!endsSentence && !isTooLong) break;
      chunkLength -= 1;
    }

    const finalChunk = chunk.slice(0, chunkLength);

    captions.push({
      id: `w-${index}`,
      start: finalChunk[0].start,
      end: finalChunk[finalChunk.length - 1].end,
      text: finalChunk.map((word) => word.word).join(" "),
    });

    index += finalChunk.length;
  }

  return captions;
}

export function chunkSegmentsIntoCaptions(segments: SegmentTimestamp[], maxWords = 2): Caption[] {
  const captions: Caption[] = [];

  for (const segment of segments) {
    const words = cleanCaptionText(segment.text).split(" ").filter(Boolean);
    if (words.length === 0) continue;

    const duration = Math.max(segment.end - segment.start, 0.1);
    const chunkedWords: string[][] = [];
    for (let index = 0; index < words.length;) {
      const nextSlice = words.slice(index, index + maxWords);
      let chunkLength = nextSlice.length;
      while (chunkLength > 1) {
        const candidate = nextSlice[chunkLength - 1];
        const previous = nextSlice[chunkLength - 2];
        if (!/[.,!?]$/.test(previous) && candidate.length <= 10) break;
        chunkLength -= 1;
      }
      const finalWords = nextSlice.slice(0, chunkLength);
      chunkedWords.push(finalWords);
      index += finalWords.length;
    }

    const chunkCount = chunkedWords.length;

    for (let index = 0; index < chunkCount; index += 1) {
      const chunkWords = chunkedWords[index];
      const chunkStart = segment.start + (duration * index) / chunkCount;
      const chunkEnd = segment.start + (duration * (index + 1)) / chunkCount;

      captions.push({
        id: `${segment.id ?? segment.start}-${index}`,
        start: chunkStart,
        end: chunkEnd,
        text: chunkWords.join(" "),
      });
    }
  }

  return captions;
}
