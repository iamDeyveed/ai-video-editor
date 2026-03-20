import { NextRequest, NextResponse } from "next/server";
import { chunkSegmentsIntoCaptions, chunkWordsIntoCaptions } from "@/lib/captions";

type TranscriptWord = {
  start: number;
  end: number;
  word: string;
};

type TranscriptSegment = {
  id?: string | number;
  start: number;
  end: number;
  text: string;
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const inputFile = formData.get("file") as File | null ?? formData.get("audio") as File | null;

    if (!inputFile) {
      return NextResponse.json({ error: "No media file provided" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OpenAI API key not configured. Add OPENAI_API_KEY to .env.local" },
        { status: 500 }
      );
    }

    const whisperForm = new FormData();
    whisperForm.append("file", inputFile, inputFile.name || "media-input");
    whisperForm.append("model", "whisper-1");
    whisperForm.append("response_format", "verbose_json");
    whisperForm.append("timestamp_granularities[]", "segment");
    whisperForm.append("timestamp_granularities[]", "word");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!response.ok) {
      const rawError = await response.text();
      let detail = rawError.trim();

      try {
        const parsed = JSON.parse(rawError);
        detail = parsed?.error?.message || parsed?.message || detail;
      } catch {
        // Keep raw text when it's not JSON.
      }

      return NextResponse.json(
        { error: `Whisper API error (${response.status}): ${detail || "No details returned from OpenAI"}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    const captionWordsPerChunk = 3;
    const captions = Array.isArray(result.words) && result.words.length > 0
      ? chunkWordsIntoCaptions(result.words as TranscriptWord[], captionWordsPerChunk)
      : chunkSegmentsIntoCaptions((result.segments || []) as TranscriptSegment[], captionWordsPerChunk);

    return NextResponse.json({ captions, fullText: result.text });
  } catch (err) {
    console.error("Caption error:", err);
    return NextResponse.json({ error: "Failed to generate captions" }, { status: 500 });
  }
}
