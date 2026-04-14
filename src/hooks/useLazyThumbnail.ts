import { useState, useEffect, useCallback } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getOrGenerateThumbnail, ThumbnailSize } from "../api/thumbnail";

interface UseLazyThumbnailOptions {
  imageId: number;
  size?: ThumbnailSize;
  existingPath?: string | null;
}

interface UseLazyThumbnailResult {
  /** 缩略图 URL（可用于 img 标签的 src） */
  url: string | null;
  /** 是否正在生成缩略图 */
  isLoading: boolean;
  /** 是否生成失败 */
  isError: boolean;
  /** 手动重新尝试生成 */
  retry: () => void;
}

/**
 * 【懒加载方案】按需加载缩略图的 Hook
 * 
 * 使用示例：
 * ```tsx
 * function ImageItem({ image }) {
 *   const { url, isLoading } = useLazyThumbnail({
 *     imageId: image.id,
 *     existingPath: image.thumbnail_path,
 *   });
 *   
 *   if (isLoading) return <div className="placeholder">加载中...</div>;
 *   if (!url) return <div className="placeholder">无缩略图</div>;
 *   return <img src={url} alt="" />;
 * }
 * ```
 */
export function useLazyThumbnail({
  imageId,
  size = "small",
  existingPath,
}: UseLazyThumbnailOptions): UseLazyThumbnailResult {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const loadThumbnail = useCallback(async () => {
    // 如果已有缩略图路径，直接使用
    if (existingPath) {
      setUrl(convertFileSrc(existingPath.replace(/\\/g, "/")));
      setIsLoading(false);
      setIsError(false);
      return;
    }

    // 没有缩略图，需要生成
    setIsLoading(true);
    setIsError(false);

    try {
      const path = await getOrGenerateThumbnail(imageId, size);
      if (path) {
        setUrl(convertFileSrc(path.replace(/\\/g, "/")));
      } else {
        // 生成失败
        setUrl(null);
        setIsError(true);
      }
    } catch (error) {
      console.error("Failed to load thumbnail:", error);
      setUrl(null);
      setIsError(true);
    } finally {
      setIsLoading(false);
    }
  }, [imageId, size, existingPath]);

  useEffect(() => {
    loadThumbnail();
  }, [loadThumbnail, retryCount]);

  const retry = useCallback(() => {
    setRetryCount((c) => c + 1);
  }, []);

  return {
    url,
    isLoading,
    isError,
    retry,
  };
}

export default useLazyThumbnail;
