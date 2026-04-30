import { useState, useEffect, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Spinner } from "@fluentui/react-components";
import { getOrGenerateThumbnailByHash, ThumbnailSize } from "../api/thumbnail";

interface LazyThumbnailProps {
  imageId: number;
  hash: string;
  imagePath: string;
  fileName: string;
  existingPath?: string | null;
  size?: ThumbnailSize;
  className?: string;
  imgClassName?: string;
  isScrolling?: boolean;
}

// ==================== 全局缓存 & 并发队列 ====================

const urlCache = new Map<string, string>();
const promiseCache = new Map<string, Promise<string | null>>();

// 缩略图请求全局并发限制（后端 ThumbnailService 并发是 4，前端限制到 5 避免 IPC 拥堵）
const MAX_CONCURRENT = 5;
let running = 0;
const taskQueue: Array<() => Promise<void>> = [];

function runNext() {
  if (taskQueue.length === 0 || running >= MAX_CONCURRENT) return;
  running++;
  const task = taskQueue.shift()!;
  task().finally(() => {
    running--;
    runNext();
  });
}

function enqueue(task: () => Promise<void>) {
  taskQueue.push(task);
  runNext();
}

function cacheKey(hash: string, size: ThumbnailSize): string {
  return `${hash}_${size}`;
}

async function fetchThumbnail(
  imageId: number,
  hash: string,
  imagePath: string,
  size: ThumbnailSize,
  existingPath?: string | null
): Promise<string | null> {
  const key = cacheKey(hash, size);

  if (urlCache.has(key)) {
    return urlCache.get(key)!;
  }
  if (promiseCache.has(key)) {
    return promiseCache.get(key)!;
  }

  const promise = (async () => {
    try {
      if (existingPath) {
        const url = convertFileSrc(existingPath.replace(/\\/g, "/"));
        urlCache.set(key, url);
        return url;
      }
      const thumbPath = await getOrGenerateThumbnailByHash(imageId, hash, imagePath, size);
      if (thumbPath) {
        const url = convertFileSrc(thumbPath.replace(/\\/g, "/"));
        urlCache.set(key, url);
        return url;
      }
      return null;
    } finally {
      promiseCache.delete(key);
    }
  })();

  promiseCache.set(key, promise);
  return promise;
}

// ============================================================

export function LazyThumbnail({
  imageId,
  hash,
  imagePath,
  fileName,
  existingPath,
  size = "small",
  className = "",
  imgClassName = "",
  isScrolling = false,
}: LazyThumbnailProps) {
  const key = cacheKey(hash, size);
  const [url, setUrl] = useState<string | null>(() => urlCache.get(key) || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasTriggered = useRef(false);

  // Intersection Observer：接近视口 200px 内才视为可见
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "200px", threshold: 0 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 可见且滚动停止后才真正发起请求；带全局并发队列限制
  useEffect(() => {
    // 滚动中直接跳过，等滚动停止后由 isScrolling 变化再次触发
    if (isScrolling) return;

    // 未进入视口或未触发过，不加载
    if (!isVisible || hasTriggered.current) return;
    hasTriggered.current = true;

    // 若全局缓存已有，直接展示，不走队列
    if (urlCache.has(key)) {
      setUrl(urlCache.get(key)!);
      return;
    }

    let cancelled = false;

    enqueue(async () => {
      if (cancelled) return;
      setIsLoading(true);
      try {
        const result = await fetchThumbnail(imageId, hash, imagePath, size, existingPath);
        if (!cancelled) setUrl(result);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isVisible, isScrolling, imageId, hash, imagePath, size, existingPath]);

  const placeholderChar = fileName?.[0]?.toUpperCase() || "?";

  return (
    <div ref={containerRef} className={`w-full h-full ${className}`}>
      {!isVisible ? (
        // 未进入视口：纯色占位，不发起任何请求
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800" />
      ) : isLoading ? (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
          <Spinner size="tiny" />
        </div>
      ) : !url ? (
        <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex flex-col items-center justify-center text-gray-400">
          {/* <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg font-medium text-gray-500 dark:text-gray-300 mb-1">
            {placeholderChar}
          </div> */}
          <span className="text-xs text-gray-400">正在加载</span>
        </div>
      ) : (
        <img
          src={url}
          alt={fileName}
          className={`w-full h-full object-cover ${imgClassName}`}
          loading="lazy"
        />
      )}
    </div>
  );
}

export default LazyThumbnail;
