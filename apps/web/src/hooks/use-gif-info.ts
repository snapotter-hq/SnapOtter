import { useEffect, useRef, useState } from "react";
import { formatHeaders } from "@/lib/api";
import { useFileStore } from "@/stores/file-store";

export interface GifInfo {
  width: number;
  height: number;
  pages: number;
  delay: number[];
  loop: number;
  fileSize: number;
  duration: number;
}

export function useGifInfo() {
  const { files, selectedIndex } = useFileStore();
  const [info, setInfo] = useState<GifInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, GifInfo>>(new Map());

  useEffect(() => {
    const file = files[selectedIndex];
    if (!file) {
      setInfo(null);
      return;
    }

    const cacheKey = `${file.name}-${file.size}-${file.lastModified}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setInfo(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    fetch("/api/v1/tools/gif-tools/info", {
      method: "POST",
      headers: formatHeaders(),
      body: formData,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch GIF info");
        return res.json();
      })
      .then((data: GifInfo) => {
        if (cancelled) return;
        cacheRef.current.set(cacheKey, data);
        setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [files, selectedIndex]);

  return { info, loading };
}
