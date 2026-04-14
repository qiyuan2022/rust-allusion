import { invoke } from "@tauri-apps/api/core";

/**
 * 获取单个设置项
 * @param key 设置键
 */
export async function getSetting(key: string): Promise<string | null> {
  return await invoke<string | null>("get_setting", { key });
}

/**
 * 设置单个设置项
 * @param key 设置键
 * @param value 设置值
 */
export async function setSetting(key: string, value: string): Promise<void> {
  return await invoke("set_setting", { key, value });
}

/**
 * 获取当前生效的缩略图目录（绝对路径）
 */
export async function getThumbnailDir(): Promise<string> {
  return await invoke<string>("get_thumbnail_dir");
}

/**
 * 设置缩略图存储目录并自动迁移已有文件
 * @param dir 新目录的绝对路径
 * @returns 迁移统计
 */
export async function setThumbnailDir(dir: string): Promise<{
  moved: number;
  failed: number;
  old_dir: string;
  new_dir: string;
}> {
  return await invoke("set_thumbnail_dir", { dir });
}
