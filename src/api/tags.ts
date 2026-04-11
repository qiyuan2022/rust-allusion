import { invoke } from "@tauri-apps/api/core";

export interface Tag {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  created_at: number;
  updated_at: number;
}

export interface TagTreeNode extends Tag {
  children: TagTreeNode[];
  image_count: number;
}

export interface CreateTagRequest {
  name: string;
  parent_id?: number | null;
  color?: string;
}

export interface UpdateTagRequest {
  name?: string;
  parent_id?: number | null;
  color?: string;
}

/**
 * 创建标签
 */
export async function createTag(req: CreateTagRequest): Promise<Tag> {
  return await invoke<Tag>("create_tag", { req });
}

/**
 * 获取所有标签
 */
export async function getAllTags(): Promise<Tag[]> {
  return await invoke<Tag[]>("get_all_tags");
}

/**
 * 获取标签树
 */
export async function getTagTree(): Promise<TagTreeNode[]> {
  return await invoke<TagTreeNode[]>("get_tag_tree");
}

/**
 * 更新标签
 */
export async function updateTag(id: number, req: UpdateTagRequest): Promise<Tag | null> {
  return await invoke<Tag | null>("update_tag", { id, req });
}

/**
 * 删除标签
 */
export async function deleteTag(id: number): Promise<boolean> {
  return await invoke<boolean>("delete_tag", { id });
}

/**
 * 移动标签
 */
export async function moveTag(id: number, newParentId?: number | null): Promise<Tag | null> {
  return await invoke<Tag | null>("move_tag", { id, newParentId });
}

/**
 * 添加单个标签到图片
 */
export async function addTagToImage(imageId: number, tagId: number): Promise<void> {
  return await invoke<void>("add_tag_to_image", { imageId, tagId });
}

/**
 * 从图片移除单个标签
 */
export async function removeTagFromImage(imageId: number, tagId: number): Promise<boolean> {
  return await invoke<boolean>("remove_tag_from_image", { imageId, tagId });
}

/**
 * 批量添加标签到图片
 */
export async function addTagsToImage(imageId: number, tagIds: number[]): Promise<number> {
  return await invoke<number>("add_tags_to_image", { imageId, tagIds });
}

/**
 * 批量从图片移除标签
 */
export async function removeTagsFromImage(imageId: number, tagIds: number[]): Promise<number> {
  return await invoke<number>("remove_tags_from_image", { imageId, tagIds });
}

/**
 * 获取图片的标签
 */
export async function getImageTags(imageId: number): Promise<Tag[]> {
  return await invoke<Tag[]>("get_image_tags", { imageId });
}

/**
 * 获取标签下的图片列表
 */
export async function getTaggedImages(
  tagId: number,
  offset: number = 0,
  limit: number = 50
): Promise<Image[]> {
  return await invoke<Image[]>("get_tagged_images", { tagId, offset, limit });
}

/**
 * 根据多个标签获取图片
 * @param matchMode "any" = OR, "all" = AND
 */
export async function getImagesByTags(
  tagIds: number[],
  matchMode: "any" | "all" = "any",
  offset: number = 0,
  limit: number = 50
): Promise<Image[]> {
  return await invoke<Image[]>("get_images_by_tags", {
    tagIds,
    matchMode,
    offset,
    limit,
  });
}

// Image 类型定义（简化版，如果需要完整定义可以导入）
export interface Image {
  id: number;
  path: string;
  hash: string;
  file_name: string;
  file_size: number;
  file_modified_at: number;
  width?: number;
  height?: number;
  format?: string;
  color_space?: string | null;
  created_at: number;
  updated_at: number;
  tags?: Tag[]; // 可选的标签列表
  thumbnail_path?: string | null; // small 缩略图路径
}

/**
 * 获取带缩略图的图片列表
 */
export async function listImagesWithThumbnail(
  offset: number = 0,
  limit: number = 50
): Promise<Image[]> {
  return await invoke<Image[]>("list_images_with_thumbnail", { offset, limit });
}

/**
 * 获取所有图片（带标签，用于虚拟滚动）
 */
export async function getAllImages(
  sortBy: string = "modified_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<Image[]> {
  return await invoke<Image[]>("get_all_images", { sortBy, sortOrder });
}

/**
 * 分批获取图片元数据（用于大量图片）
 * @param offset 起始位置
 * @param limit 获取数量
 * @param sortBy 排序字段
 * @param sortOrder 排序方向
 */
export async function getImagesBatch(
  offset: number = 0,
  limit: number = 500,
  sortBy: string = "modified_at",
  sortOrder: "asc" | "desc" = "desc"
): Promise<Image[]> {
  return await invoke<Image[]>("list_images_with_thumbnail", { offset, limit, sortBy, sortOrder });
}

/**
 * 预设标签颜色
 */
export const TAG_COLORS = [
  { name: "蓝色", value: "#3b82f6" },
  { name: "绿色", value: "#10b981" },
  { name: "红色", value: "#ef4444" },
  { name: "黄色", value: "#f59e0b" },
  { name: "紫色", value: "#8b5cf6" },
  { name: "粉色", value: "#ec4899" },
  { name: "青色", value: "#06b6d4" },
  { name: "橙色", value: "#f97316" },
  { name: "灰色", value: "#6b7280" },
];

/**
 * 获取随机标签颜色
 */
export function getRandomTagColor(): string {
  const randomIndex = Math.floor(Math.random() * TAG_COLORS.length);
  return TAG_COLORS[randomIndex].value;
}
