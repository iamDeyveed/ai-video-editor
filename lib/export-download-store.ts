import { promises as fs } from "fs";
import crypto from "crypto";
import type { PreparedServerExport } from "@/lib/server-export";

type ExportDownloadRecord = PreparedServerExport & {
  createdAt: number;
};

const DOWNLOAD_TTL_MS = 1000 * 60 * 30;
const downloadStore = new Map<string, ExportDownloadRecord>();

export function registerPreparedExport(prepared: PreparedServerExport) {
  pruneExpiredDownloads();

  const token = crypto.randomUUID();
  downloadStore.set(token, {
    ...prepared,
    createdAt: Date.now(),
  });

  return token;
}

export function getPreparedExport(token: string) {
  pruneExpiredDownloads();

  const record = downloadStore.get(token);
  if (!record) return null;

  return record;
}

function pruneExpiredDownloads() {
  const now = Date.now();

  downloadStore.forEach((record, token) => {
    if (now - record.createdAt > DOWNLOAD_TTL_MS) {
      downloadStore.delete(token);
      void fs.rm(record.tempDir, { recursive: true, force: true });
    }
  });
}
