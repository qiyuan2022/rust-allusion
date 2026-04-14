import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export type ThumbnailSize = "small" | "medium" | "large";

export interface ThumbnailStatus {
  image_id: number;
  has_small: boolean;
  has_medium: boolean;
  has_large: boolean;
  small_path: string | null;
  medium_path: string | null;
  large_path: string | null;
}

export interface ThumbnailResult {
  success: boolean;
  path: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
}

export interface GenerateAllResult {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  results: {
    size: ThumbnailSize;
    success: boolean;
    path: string | null;
    width: number | null;
    height: number | null;
  }[];
}

/**
 * 生成单张图片的指定尺寸缩略图
 * @param imageId 图片ID
 * @param sizeType 尺寸类型: 'small' | 'medium' | 'large'
 */
export async function generateThumbnail(
  imageId: number,
  sizeType: ThumbnailSize
): Promise<ThumbnailResult> {
  return await invoke<ThumbnailResult>("generate_thumbnail", {
    imageId,
    sizeType,
  });
}

/**
 * 获取指定图片和尺寸的缩略图路径
 * @param imageId 图片ID
 * @param sizeType 尺寸类型
 */
export async function getThumbnailPath(
  imageId: number,
  sizeType: ThumbnailSize
): Promise<string | null> {
  return await invoke<string | null>("get_thumbnail_path", {
    imageId,
    sizeType,
  });
}

/**
 * 【懒加载方案】获取缩略图路径，如果不存在则生成
 * 
 * 用于按需加载缩略图：
 * 1. 检查缩略图是否已存在
 * 2. 如果不存在，同步生成缩略图
 * 3. 返回缩略图路径（或 null 如果生成失败）
 * 
 * @param imageId 图片ID
 * @param sizeType 尺寸类型
 * @returns 缩略图路径，生成失败返回 null
 */
export async function getOrGenerateThumbnail(
  imageId: number,
  sizeType: ThumbnailSize
): Promise<string | null> {
  return await invoke<string | null>("get_or_generate_thumbnail", {
    imageId,
    sizeType,
  });
}

/**
 * 获取图片的缩略图状态
 * @param imageId 图片ID
 */
export async function getThumbnailStatus(
  imageId: number
): Promise<ThumbnailStatus> {
  return await invoke<ThumbnailStatus>("get_thumbnail_status", {
    imageId,
  });
}

/**
 * 为单张图片生成所有尺寸的缩略图
 * @param imageId 图片ID
 */
export async function generateAllThumbnails(
  imageId: number
): Promise<GenerateAllResult> {
  return await invoke<GenerateAllResult>("generate_all_thumbnails", {
    imageId,
  });
}

/**
 * 【Hash 直接拼接方案】获取缩略图，不存在则生成
 * 
 * @param imageId 图片ID
 * @param hash 图片哈希值
 * @param imagePath 原图路径
 * @param sizeType 尺寸类型
 * @param thumbnailDir 可选，自定义缩略图目录
 * @returns 缩略图路径，生成失败返回 null
 */
export async function getOrGenerateThumbnailByHash(
  imageId: number,
  hash: string,
  imagePath: string,
  sizeType: ThumbnailSize,
  thumbnailDir?: string
): Promise<string | null> {
  return await invoke<string | null>("get_or_generate_thumbnail_by_hash", {
    imageId,
    hash,
    imagePath,
    sizeType,
    thumbnailDir,
  });
}

/**
 * 获取缩略图URL（使用 Tauri 的 convertFileSrc）
 * @param path 缩略图路径
 */
export function getThumbnailUrl(path: string): string {
  // 使用 Tauri 的 convertFileSrc 将本地路径转换为可访问的 URL
  // 将 Windows 反斜杠转换为正斜杠
  return convertFileSrc(path.replace(/\\/g, '/'));
}

/**
 * 缩略图尺寸配置
 */
export const THUMBNAIL_SIZES: { [key in ThumbnailSize]: { label: string; size: number } } = {
  small: { label: "小图", size: 200 },
  medium: { label: "中图", size: 500 },
  large: { label: "大图", size: 1000 },
};
