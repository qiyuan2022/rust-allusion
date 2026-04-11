import { invoke } from "@tauri-apps/api/core";
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
 * 扫描位置（导入图片）
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
 * 添加新位置（包含选择对话框）
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
 * 修复缺失尺寸信息的图片
 * @returns [已修复数量, 总数]
 */
export async function fixImageDimensions(): Promise<[number, number]> {
  return await invoke<[number, number]>("fix_image_dimensions");
}
