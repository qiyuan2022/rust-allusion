import { invoke } from "@tauri-apps/api/core";
import { Channel } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface Location {
  id: number;
  path: string;
  name: string;
  is_recursive: boolean;
  is_active: boolean;
  image_count: number;
}

export interface CreateLocationRequest {
  path: string;
  name: string;
  is_recursive?: boolean;
}

/// 导入阶段
export type ImportPhase = "scanning" | "importing" | "completed" | "cancelled";

/// 导入进度
export interface ImportProgress {
  /// 当前阶段
  phase: ImportPhase;
  /// 总文件数
  total: number;
  /// 已处理数
  processed: number;
  /// 成功数
  succeeded: number;
  /// 失败数
  failed: number;
  /// 跳过的文件数
  skipped: number;
  /// 当前处理的文件
  current_file: string | null;
  /// 进度百分比 (0-100)
  percentage: number;
  /// 阶段特定消息
  message: string | null;
}

/**
 * 获取所有位置
 */
export async function getAllLocations(): Promise<Location[]> {
  return await invoke<Location[]>("get_all_locations");
}

/**
 * 创建新位置
 */
export async function createLocation(
  req: CreateLocationRequest
): Promise<Location> {
  return await invoke<Location>("create_location", { req });
}

/**
 * 删除位置
 */
export async function deleteLocation(id: number): Promise<boolean> {
  return await invoke<boolean>("delete_location", { id });
}

/**
 * 选择文件夹对话框
 */
export async function selectFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择要导入的文件夹",
  });
  return selected as string | null;
}

/**
 * 扫描位置（基础版，无进度反馈）
 */
export async function scanLocation(locationId: number): Promise<{
  success: boolean;
  scanned: number;
  imported: number;
  failed: number;
  skipped: number;
}> {
  return await invoke("scan_location", { locationId });
}

/**
 * 扫描位置（带进度反馈）
 * 
 * @param locationId 位置ID
 * @param onProgress 进度回调函数
 * @returns 最终进度结果
 */
export async function scanLocationWithProgress(
  locationId: number,
  onProgress: (progress: ImportProgress) => void
): Promise<ImportProgress> {
  const channel = new Channel<ImportProgress>();
  
  channel.onmessage = (progress) => {
    onProgress(progress);
  };

  return await invoke<ImportProgress>("scan_location_with_progress", {
    locationId,
    onProgress: channel,
  });
}

/**
 * 添加新位置（包含选择对话框）- 基础版
 */
export async function addLocation(): Promise<Location | null> {
  const path = await selectFolder();
  if (!path) return null;

  // 从路径提取名称
  const name = path.split(/[/\\]/).pop() || "New Location";

  const location = await createLocation({
    path,
    name,
    is_recursive: true,
  });
  
  // 自动扫描新添加的位置
  if (location) {
    try {
      const result = await scanLocation(location.id);
      console.log("Scan result:", result);
    } catch (error) {
      console.error("Failed to scan location:", error);
    }
  }
  
  return location;
}

/**
 * 添加新位置（带进度反馈）
 * 
 * @param onProgress 进度回调函数
 * @returns 创建的位置信息和最终进度
 */
export async function addLocationWithProgress(
  onProgress: (progress: ImportProgress) => void
): Promise<{ location: Location | null; result: ImportProgress | null }> {
  const path = await selectFolder();
  if (!path) return { location: null, result: null };

  // 从路径提取名称
  const name = path.split(/[/\\]/).pop() || "New Location";

  const location = await createLocation({
    path,
    name,
    is_recursive: true,
  });
  
  // 自动扫描新添加的位置（带进度）
  if (location) {
    try {
      const result = await scanLocationWithProgress(location.id, onProgress);
      return { location, result };
    } catch (error) {
      console.error("Failed to scan location:", error);
      return { location, result: null };
    }
  }
  
  return { location, result: null };
}

/**
 * 修复缺失尺寸信息的图片
 * @returns [已修复数量, 总数]
 */
export async function fixImageDimensions(): Promise<[number, number]> {
  return await invoke<[number, number]>("fix_image_dimensions");
}
