import { invoke } from "@tauri-apps/api/core";

export interface MonitorInfo {
  width: number;
  height: number;
  scaleFactor: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 获取主显示器信息（逻辑像素）
 */
export async function getPrimaryMonitorInfo(): Promise<MonitorInfo> {
  return await invoke<MonitorInfo>("get_primary_monitor_info");
}

/**
 * 设置桌面壁纸
 * @param imagePath 原图路径
 * @param crop 裁剪区域（原图像素坐标）
 */
export async function setWallpaper(
  imagePath: string,
  crop: CropRect
): Promise<void> {
  await invoke("set_wallpaper", {
    imagePath,
    cropX: Math.round(crop.x),
    cropY: Math.round(crop.y),
    cropWidth: Math.round(crop.width),
    cropHeight: Math.round(crop.height),
  });
}
