import { invoke } from "@tauri-apps/api/core";

export interface SearchQueryRequest {
  text?: string;
  tag_ids?: number[];
  exclude_tag_ids?: number[];
  date_from?: number;
  date_to?: number;
  min_width?: number;
  min_height?: number;
  formats?: string[];
  sort_by?: SortBy;
  limit?: number;
  offset?: number;
}

export type SortBy = "relevance" | "created_at" | "modified_at" | "file_name" | "file_size";

export interface SearchResultItem {
  image_id: number;
  score: number;
  highlights: string[];
}

export interface SearchResponse {
  total: number;
  hits: SearchResultItem[];
  has_more: boolean;
}

export interface IndexStatus {
  indexed_count: number;
  total_images: number;
  is_up_to_date: boolean;
}

export interface SearchCondition {
  type: "text" | "tag" | "exclude_tag" | "date_range" | "size_range" | "format";
  value: unknown;
}

export interface AdvancedSearchRequest {
  conditions: SearchCondition[];
  match_mode?: "all" | "any";
  sort_by?: SortBy;
  limit?: number;
  offset?: number;
}

/**
 * 搜索图片
 */
export async function searchImages(query: SearchQueryRequest): Promise<SearchResponse> {
  return await invoke<SearchResponse>("search_images", { query });
}

/**
 * 获取搜索索引状态
 */
export async function getSearchIndexStatus(): Promise<IndexStatus> {
  return await invoke<IndexStatus>("get_search_index_status");
}

/**
 * 重建搜索索引
 */
export async function rebuildSearchIndex(): Promise<number> {
  return await invoke<number>("rebuild_search_index");
}

/**
 * 简单的文本搜索
 */
export async function searchByText(
  text: string,
  options: {
    limit?: number;
    offset?: number;
    sort_by?: SortBy;
  } = {}
): Promise<SearchResponse> {
  return searchImages({
    text,
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
    sort_by: options.sort_by ?? "relevance",
  });
}

/**
 * 按标签搜索
 */
export async function searchByTags(
  tagIds: number[],
  options: {
    matchMode?: "any" | "all";
    limit?: number;
    offset?: number;
  } = {}
): Promise<SearchResponse> {
  return searchImages({
    tag_ids: tagIds,
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
  });
}

/**
 * 组合搜索
 */
export async function searchWithFilters(
  filters: {
    text?: string;
    tags?: number[];
    excludeTags?: number[];
    dateFrom?: Date;
    dateTo?: Date;
    minWidth?: number;
    minHeight?: number;
    formats?: string[];
  },
  options: {
    limit?: number;
    offset?: number;
    sortBy?: SortBy;
  } = {}
): Promise<SearchResponse> {
  return searchImages({
    text: filters.text,
    tag_ids: filters.tags,
    exclude_tag_ids: filters.excludeTags,
    date_from: filters.dateFrom?.getTime(),
    date_to: filters.dateTo?.getTime(),
    min_width: filters.minWidth,
    min_height: filters.minHeight,
    formats: filters.formats,
    limit: options.limit ?? 50,
    offset: options.offset ?? 0,
    sort_by: options.sortBy ?? "relevance",
  });
}

/**
 * 格式化搜索结果为图片 ID 列表
 */
export function extractImageIds(response: SearchResponse): number[] {
  return response.hits.map((hit) => hit.image_id);
}

/**
 * 检查是否需要重建索引
 */
export async function needsReindex(): Promise<boolean> {
  const status = await getSearchIndexStatus();
  return !status.is_up_to_date;
}
