import { Disc3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchImageAsDataUrl,
  isTauri,
} from "../lib/bridge";

interface SongCoverProps {
  src?: string;
  title: string;
  size?: "small" | "medium" | "large";
}

const nativeCoverCache = new Map<string, Promise<string>>();
const nativeCoverData = new Map<string, string>();
const nativeCoverQueue: Array<() => void> = [];
let nativeCoverRequestLimit = 6;
let nativeCoverCacheLimit = 160;
let activeNativeCoverRequests = 0;

export function setCoverPerformanceMode(highPerformance: boolean) {
  nativeCoverRequestLimit = highPerformance ? 14 : 6;
  nativeCoverCacheLimit = highPerformance ? 320 : 160;
  trimNativeCoverCache();
  drainNativeCoverQueue();
}

export function SongCover({ src, title, size = "medium" }: SongCoverProps) {
  const variants = useMemo(() => coverVariants(src), [src]);
  const preferNative = useMemo(() => shouldPreferNative(src), [src]);
  const [attempt, setAttempt] = useState(0);
  const [nativeSrc, setNativeSrc] = useState("");
  const [nativeFailed, setNativeFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAttempt(0);
    setNativeSrc("");
    setNativeFailed(false);
    if (!src || !preferNative || !isTauri()) {
      return () => {
        cancelled = true;
      };
    }
    void loadNativeCover(src)
      .then((dataUrl) => {
        if (!cancelled) setNativeSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setNativeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [preferNative, src]);

  const loadNativeFallback = async () => {
    if (!src || nativeFailed || !isTauri()) return;
    try {
      setNativeSrc(await loadNativeCover(src));
    } catch {
      setNativeFailed(true);
    }
  };

  if (!src || (!nativeSrc && attempt >= variants.length)) {
    return (
      <div className={`song-cover placeholder ${size}`} aria-label={title}>
        <Disc3 size={size === "large" ? 32 : 18} />
      </div>
    );
  }
  if (preferNative && !nativeSrc && !nativeFailed) {
    return (
      <div
        className={`song-cover placeholder loading ${size}`}
        aria-label={title}
        aria-busy="true"
      >
        <Disc3 size={size === "large" ? 32 : 18} />
      </div>
    );
  }
  return (
    <img
      className={`song-cover ${size}`}
      src={nativeSrc || variants[attempt]}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (nativeSrc) {
          setNativeSrc("");
          setNativeFailed(true);
        } else if (attempt + 1 < variants.length) {
          setAttempt((value) => value + 1);
        } else {
          void loadNativeFallback();
        }
      }}
    />
  );
}

function shouldPreferNative(src?: string): boolean {
  if (!src) return false;
  try {
    const parsed = new URL(src);
    return (
      parsed.hostname === "y.qq.com" ||
      /^p\d+\.music\.126\.net$/i.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

function coverReferer(src: string): string | undefined {
  if (src.includes("music.126.net")) return "https://music.163.com/";
  if (src.includes("qq.com") || src.includes("gtimg.cn")) {
    return "https://y.qq.com/";
  }
  return undefined;
}

function loadNativeCover(src: string): Promise<string> {
  const cached = nativeCoverData.get(src);
  if (cached) return Promise.resolve(cached);
  const pending = nativeCoverCache.get(src);
  if (pending) return pending;

  const request = new Promise<string>((resolve, reject) => {
    const run = async () => {
      try {
        const dataUrl = await fetchImageAsDataUrl(src, coverReferer(src));
        rememberNativeCover(src, dataUrl);
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      } finally {
        nativeCoverCache.delete(src);
        activeNativeCoverRequests -= 1;
        drainNativeCoverQueue();
      }
    };
    if (activeNativeCoverRequests < nativeCoverRequestLimit) {
      activeNativeCoverRequests += 1;
      void run();
    } else {
      nativeCoverQueue.push(() => {
        activeNativeCoverRequests += 1;
        void run();
      });
    }
  });
  nativeCoverCache.set(src, request);
  request.catch(() => nativeCoverCache.delete(src));
  return request;
}

function rememberNativeCover(src: string, dataUrl: string) {
  nativeCoverData.delete(src);
  nativeCoverData.set(src, dataUrl);
  trimNativeCoverCache();
}

function trimNativeCoverCache() {
  while (nativeCoverData.size > nativeCoverCacheLimit) {
    const oldest = nativeCoverData.keys().next().value;
    if (oldest === undefined) break;
    nativeCoverData.delete(oldest);
  }
}

function drainNativeCoverQueue() {
  while (
    activeNativeCoverRequests < nativeCoverRequestLimit &&
    nativeCoverQueue.length
  ) {
    nativeCoverQueue.shift()?.();
  }
}

function coverVariants(src?: string): string[] {
  if (!src) return [];
  const variants = [src];
  try {
    const parsed = new URL(src);
    if (parsed.hostname === "y.gtimg.cn") {
      variants.push(
        `https://y.qq.com${parsed.pathname}${parsed.search}`,
      );
    } else if (
      parsed.hostname === "y.qq.com" &&
      parsed.pathname.startsWith("/music/photo_new/")
    ) {
      variants.push(
        `https://y.gtimg.cn${parsed.pathname}${parsed.search}`,
      );
    } else if (/^p\d+\.music\.126\.net$/i.test(parsed.hostname)) {
      const withoutQuery = `${parsed.origin}${parsed.pathname}`;
      variants.push(withoutQuery);
      variants.push(
        `https://p1.music.126.net${parsed.pathname}`,
      );
    }
    if (parsed.search) {
      variants.push(`${parsed.origin}${parsed.pathname}`);
    }
  } catch {
    // Keep the original URL when it is a local asset path.
  }
  return [...new Set(variants)];
}
