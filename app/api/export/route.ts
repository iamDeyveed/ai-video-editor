import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { Readable } from "stream";
import { NextRequest, NextResponse } from "next/server";
import { getPreparedExport, registerPreparedExport } from "@/lib/export-download-store";
import { prepareVideoExport, type ServerExportPayload } from "@/lib/server-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const payloadText = formData.get("payload");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No video file provided for export" }, { status: 400 });
    }

    if (typeof payloadText !== "string") {
      return NextResponse.json({ error: "Missing export payload" }, { status: 400 });
    }

    const payload = JSON.parse(payloadText) as ServerExportPayload;
    const prepared = await prepareVideoExport(file, payload);
    const token = registerPreparedExport(prepared);

    return NextResponse.json({
      downloadUrl: `/api/export?token=${encodeURIComponent(token)}`,
      fileName: prepared.fileName,
      contentType: prepared.contentType,
    });
  } catch (error) {
    console.error("Server export failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Server export failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing export token" }, { status: 400 });
  }

  const prepared = getPreparedExport(token);
  if (!prepared) {
    return NextResponse.json({ error: "Export download is no longer available" }, { status: 404 });
  }

  try {
    const stats = await fs.stat(prepared.outputPath);
    const stream = createReadStream(prepared.outputPath);

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": prepared.contentType,
        "Content-Disposition": `attachment; filename="${prepared.fileName}"`,
        "Content-Length": `${stats.size}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Export download failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export download failed" },
      { status: 500 }
    );
  }
}
