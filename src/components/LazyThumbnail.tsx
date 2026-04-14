import { useState, useEffect, useCallback, useRef } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Loader2, ImageOff } from "lucide-react";
import { getOrGenerateThumbnailByHash, ThumbnailSize } from "../api/thumbnail";

interface LazyThumbnailProps {
  /** 图片ID */
  imageId: number;
  /** 图片哈希值（用于直接拼接缩略图路径） */
  hash: string;
  /** 原图路径（用于生成缩略图） */
  imagePath: string;
  /** 文件名（用于 alt 和无缩略图时的占位显示） */
  fileName: string;
  /** 已有的缩略图路径（数据库中的，优先使用） */
  existingPath?: string | null;
  /** 缩略图尺寸 */
  size?: ThumbnailSize;
  /** 容器类名 */
  className?: string;
  /** 图片类名 */
  imgClassName?: string;
}

// 【全局缓存】记录已加载的缩略图路径，避免重复请求
const thumbnailCache = new Map<string, string>();

// 【全局 Set】记录正在加载中的缩略图，避免并发重复请求
const loadingSet = new Set<string>();

/**
 * 生成缓存 key
 */
function getCacheKey(hash: string, size: ThumbnailSize): string {
  return `${hash}_${size}`;
}

/**
 * 【懒加载方案 + Hash 直接拼接】按需加载缩略图的组件
 * 
 * 特性：
 * - 优先使用数据库中的缩略图路径
 * - 使用全局缓存避免重复请求
 * - 使用全局 Set 避免并发重复请求
 * - 如果没有，根据 hash 直接拼接路径检查文件
 * - 如果文件不存在，自动异步生成
 * - 生成过程中显示加载动画
 * - 生成失败显示占位符
 */
export function LazyThumbnail({
  imageId,
  hash,
  imagePath,
  fileName,
  existingPath,
  size = "small",
  className = "",
  imgClassName = "",
}: LazyThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasRequested = useRef(false);

  const loadThumbnail = useCallback(async () => {
    const cacheKey = getCacheKey(hash, size);

    // 1. 如果已有缩略图路径（数据库中的），直接使用
    if (existingPath) {
      const convertedUrl = convertFileSrc(existingPath.replace(/\\/g, "/"));
      setUrl(convertedUrl);
      // 同时缓存
      thumbnailCache.set(cacheKey, convertedUrl);
      return;
    }

    // 2. 检查全局缓存
    if (thumbnailCache.has(cacheKey)) {
      setUrl(thumbnailCache.get(cacheKey)!);
      return;
    }

    // 3. 检查是否正在加载中（其他组件已发起请求）
    if (loadingSet.has(cacheKey)) {
      // 等待其他请求完成
      setIsLoading(true);
      const checkInterval = setInterval(() => {
        if (!loadingSet.has(cacheKey)) {
          clearInterval(checkInterval);
          if (thumbnailCache.has(cacheKey)) {
            setUrl(thumbnailCache.get(cacheKey)!);
          }
          setIsLoading(false);
        }
      }, 100);
      return;
    }

    // 4. 标记为加载中
    loadingSet.add(cacheKey);
    setIsLoading(true);
    hasRequested.current = true;

    try {
      const thumbPath = await getOrGenerateThumbnailByHash(
        imageId,
        hash,
        imagePath,
        size
      );
      
      if (thumbPath) {
        const convertedUrl = convertFileSrc(thumbPath.replace(/\\/g, "/"));
        setUrl(convertedUrl);
        // 存入全局缓存
        thumbnailCache.set(cacheKey, convertedUrl);
      }
    } catch (error) {
      console.error("Failed to load thumbnail:", error);
    } finally {
      setIsLoading(false);
      // 移除加载标记
      loadingSet.delete(cacheKey);
    }
  }, [imageId, hash, imagePath, size, existingPath]);

  useEffect(() => {
    loadThumbnail();
  }, [loadThumbnail]);

  // 获取文件名首字母作为占位符
  const placeholderChar = fileName?.[0]?.toUpperCase() || "?";

  // 加载中状态
  if (isLoading) {
    return (
      <div
        className={`bg-gray-100 flex flex-col items-center justify-center text-gray-400 ${className}`}
      >
        <Loader2 className="w-6 h-6 animate-spin mb-1" />
        <span className="text-xs">加载中...</span>
      </div>
    );
  }

  // 无缩略图状态（生成失败或仍在等待）
  if (!url) {
    return (
      <div
        className={`bg-gray-100 flex flex-col items-center justify-center text-gray-400 ${className}`}
      >
        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-medium text-gray-500 mb-1">
          {placeholderChar}
        </div>
        <span className="text-xs text-gray-400">加载异常</span>
      </div>
    );
  }

  // 正常显示缩略图
  return (
    <img
      src={url}
      alt={fileName}
      title={fileName}
      className={`object-cover ${imgClassName} ${className}`}
      loading="lazy"
    />
  );
}

export default LazyThumbnail;
