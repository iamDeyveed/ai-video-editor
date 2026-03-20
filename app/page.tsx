"use client";

import { useCallback, useState } from "react";
import VideoUpload from "@/components/editor/VideoUpload";
import Editor from "@/components/editor/Editor";

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleVideoLoaded = useCallback((file: File, url: string) => {
    setVideoFile(file);
    setVideoUrl(url);
  }, []);

  const handleReset = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
  }, [videoUrl]);

  if (videoFile && videoUrl) {
    return <Editor videoFile={videoFile} videoUrl={videoUrl} onReset={handleReset} />;
  }

  return <VideoUpload onVideoLoaded={handleVideoLoaded} />;
}
