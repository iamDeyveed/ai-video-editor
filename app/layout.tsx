import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClipAI — Professional Video Editor",
  description: "Browser-based professional video editor with Photoshop-grade color grading, AI captions, and export",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <body style={{ overflow: "hidden" }}>{children}</body>
    </html>
  );
}
