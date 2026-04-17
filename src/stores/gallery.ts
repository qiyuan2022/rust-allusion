import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Image, Tag } from "../api/tags";
import { SearchResponse } from "../api/search";

export type ViewMode = "grid" | "masonry" | "justified";

export interface GalleryState {
  // 图片数据
  images: Image[];
  allImages: Image[]; // 存储所有图片元数据
  filteredImages: Image[]; // 搜索/筛选后的图片
  totalCount: number;
  hasMore: boolean;
  isLoading: boolean;
  isSearching: boolean; // 是否处于搜索模式
  
  // 视图状态
  viewMode: ViewMode;
  selectedIds: Set<number>;
  currentPage: number;
  pageSize: number;
  
  // 搜索/筛选状态
  searchQuery: string;
  selectedTagIds: number[];
  sortBy: "created_at" | "modified_at" | "file_name" | "file_size";
  sortOrder: "asc" | "desc";
  searchResultIds: number[]; // 搜索结果图片ID列表
  searchVersion: number; // 搜索版本号，用于防止异步竞态条件
  
  // 预览状态
  previewImageId: number | null;
  isPreviewOpen: boolean;
  // 保存用于恢复视图的滚动位置（像素）
  savedScrollTop: number | null;
  
  // 详情页状态
  detailImageId: number | null;
  isDetailOpen: boolean;

  // 主题状态
  isDarkMode: boolean;
  
  // 动作
  setImages: (images: Image[]) => void;
  setAllImages: (images: Image[]) => void;
  appendImages: (images: Image[]) => void;
  updateImageTags: (imageId: number, tags: Tag[]) => void;
  setSearchResults: (results: SearchResponse) => void;
  clearSearch: () => void;
  setLoading: (loading: boolean) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTagIds: (ids: number[]) => void;
  toggleTagSelection: (id: number) => void;
  setSortBy: (sort: GalleryState["sortBy"]) => void;
  setSortOrder: (order: "asc" | "desc") => void;
  toggleSortOrder: () => void;
  selectImage: (id: number, multi?: boolean) => void;
  deselectImage: (id: number) => void;
  selectAll: () => void;
  deselectAll: () => void;
  clearSelection: () => void;
  openPreview: (imageId: number) => void;
  closePreview: () => void;
  nextPreview: () => void;
  prevPreview: () => void;
  openDetail: (imageId: number) => void;
  closeDetail: () => void;
  setCurrentPage: (page: number) => void;
  incrementPage: () => void;
  reset: () => void;
  setSavedScrollTop: (pos: number | null) => void;
  setDarkMode: (dark: boolean) => void;
  // 右键菜单操作
  renameImage: (imageId: number, newName: string) => Promise<void>;
  addTagsToImages: (imageIds: number[], tagIds: number[], newTagNames?: string[], onSuccess?: () => void) => Promise<void>;
  deleteImages: (imageIds: number[], deleteSourceFile: boolean) => Promise<void>;
  createTag: (name: string, color?: string, parentId?: number | null) => Promise<number | null>;
}

const initialState = {
  images: [],
  allImages: [], // 存储所有图片元数据
  filteredImages: [], // 搜索/筛选后的图片
  totalCount: 0,
  hasMore: false,
  isLoading: false,
  isSearching: false,
  viewMode: "justified" as ViewMode,
  selectedIds: new Set<number>(),
  currentPage: 0,
  pageSize: 50,
  searchQuery: "",
  selectedTagIds: [],
  sortBy: "modified_at" as const,
  sortOrder: "desc" as const,
  searchResultIds: [] as number[],
  searchVersion: 0,
  previewImageId: null,
  isPreviewOpen: false,
  detailImageId: null,
  isDetailOpen: false,
  savedScrollTop: null as number | null,
  isDarkMode: false,
};

export const useGalleryStore = create<GalleryState>((set, get) => ({
  ...initialState,

  setImages: (images) => set({ images }),

  setAllImages: (images) => set({ allImages: images, totalCount: images.length }),

  appendImages: (images) =>
    set((state) => ({
      images: [...state.images, ...images],
    })),

  updateImageTags: (imageId, tags) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, tags } : img
      ),
    })),

  setSearchResults: (results) =>
    set({
      searchResultIds: results.hits.map((h) => h.image_id),
      totalCount: results.total,
      hasMore: results.has_more,
      isSearching: true,
    }),

  applySearchFilter: () =>
    set((state) => {
      if (!state.isSearching || state.searchResultIds.length === 0) {
        return { filteredImages: state.allImages };
      }
      // 根据搜索结果ID过滤图片
      const idSet = new Set(state.searchResultIds);
      const filtered = state.allImages.filter((img) => idSet.has(img.id));
      return { filteredImages: filtered };
    }),

  clearSearch: () =>
    set({
      searchQuery: "",
      searchResultIds: [],
      isSearching: false,
      filteredImages: [],
      currentPage: 0,
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setSearchQuery: (query) => set((state) => ({ searchQuery: query, currentPage: 0, searchVersion: state.searchVersion + 1 })),

  setSelectedTagIds: (ids) => set((state) => ({ selectedTagIds: ids, currentPage: 0, searchVersion: state.searchVersion + 1 })),

  toggleTagSelection: (id) =>
    set((state) => {
      const newIds = state.selectedTagIds.includes(id)
        ? state.selectedTagIds.filter((i) => i !== id)
        : [...state.selectedTagIds, id];
      return { selectedTagIds: newIds, currentPage: 0, searchVersion: state.searchVersion + 1 };
    }),

  setSortBy: (sort) => set({ sortBy: sort, currentPage: 0 }),
  
  setSortOrder: (order) => set({ sortOrder: order, currentPage: 0 }),
  
  toggleSortOrder: () =>
    set((state) => ({
      sortOrder: state.sortOrder === "asc" ? "desc" : "asc",
      currentPage: 0,
    })),

  selectImage: (id, multi = false) =>
    set((state) => {
      if (multi) {
        const newIds = new Set(state.selectedIds);
        if (newIds.has(id)) {
          newIds.delete(id);
        } else {
          newIds.add(id);
        }
        return { selectedIds: newIds };
      } else {
        return { selectedIds: new Set([id]) };
      }
    }),

  deselectImage: (id) =>
    set((state) => {
      const newIds = new Set(state.selectedIds);
      newIds.delete(id);
      return { selectedIds: newIds };
    }),

  selectAll: () =>
    set((state) => ({
      selectedIds: new Set(state.images.map((img) => img.id)),
    })),

  deselectAll: () => set({ selectedIds: new Set() }),

  clearSelection: () => set({ selectedIds: new Set() }),

  openPreview: (imageId) =>
    set({
      previewImageId: imageId,
      isPreviewOpen: true,
    }),

  closePreview: () =>
    set({
      isPreviewOpen: false,
      previewImageId: null,
    }),

  nextPreview: () =>
    set((state) => {
      if (state.previewImageId === null) return {};
      const currentIndex = state.images.findIndex(
        (img) => img.id === state.previewImageId
      );
      if (currentIndex >= 0 && currentIndex < state.images.length - 1) {
        return { previewImageId: state.images[currentIndex + 1].id };
      }
      return {};
    }),

  prevPreview: () =>
    set((state) => {
      if (state.previewImageId === null) return {};
      const currentIndex = state.images.findIndex(
        (img) => img.id === state.previewImageId
      );
      if (currentIndex > 0) {
        return { previewImageId: state.images[currentIndex - 1].id };
      }
      return {};
    }),

  setCurrentPage: (page) => set({ currentPage: page }),

  incrementPage: () =>
    set((state) => ({ currentPage: state.currentPage + 1 })),

  reset: () => set(initialState),

  setSavedScrollTop: (pos: number | null) => set({ savedScrollTop: pos }),

  // 打开详情页面（作为覆盖层，保持列表状态）
  openDetail: (imageId) =>
    set({
      detailImageId: imageId,
      isDetailOpen: true,
    }),

  // 关闭详情页面
  closeDetail: () =>
    set({
      detailImageId: null,
      isDetailOpen: false,
    }),

  // 设置暗黑模式
  setDarkMode: (dark) => {
    set({ isDarkMode: dark });
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  },

  // 重命名图片
  renameImage: async (imageId, newName) => {
    try {
      await invoke("rename_image", { imageId, newName });
      // 更新本地状态
      set((state) => ({
        images: state.images.map((img) =>
          img.id === imageId ? { ...img, file_name: newName } : img
        ),
      }));
    } catch (error) {
      console.error("Failed to rename image:", error);
      alert("重命名失败: " + error);
    }
  },

  // 创建新标签
  createTag: async (name: string, color?: string, parentId?: number | null) => {
    try {
      const tag = await invoke<{ id: number }>("create_tag", { 
        req: { name, color: color || "#3b82f6", parent_id: parentId || null } 
      });
      return tag.id;
    } catch (error) {
      console.error("Failed to create tag:", error);
      alert("创建标签失败: " + error);
      return null;
    }
  },

  // 给图片打标签（支持清除所有标签）
  addTagsToImages: async (imageIds, tagIds, newTagNames = [], onSuccess) => {
    try {
      // 如果没有任何标签，则清除所有标签
      if (tagIds.length === 0 && newTagNames.length === 0) {
        await invoke("clear_tags_from_images", { imageIds });
        // 更新本地状态 - 清除选中图片的标签
        set((state) => ({
          images: state.images.map((img) =>
            imageIds.includes(img.id) ? { ...img, tags: [] } : img
          ),
        }));
        onSuccess?.();
        return;
      }
      
      // 先创建新标签
      const newTags: Tag[] = [];
      for (const name of newTagNames) {
        const id = await get().createTag(name);
        if (id !== null) {
          newTags.push({ 
            id, 
            name, 
            color: "#3b82f6",
            parent_id: null,
            created_at: Date.now(),
            updated_at: Date.now()
          });
        }
      }
      
      // 合并已有标签和新标签的 ID
      const allTagIds = [...tagIds, ...newTags.map((t) => t.id)];
      
      if (allTagIds.length > 0) {
        await invoke("add_tags_to_images", { imageIds, tagIds: allTagIds });
        
        // 更新本地状态 - 为选中图片添加标签
        set((state) => ({
          images: state.images.map((img) => {
            if (!imageIds.includes(img.id)) return img;
            
            // 获取现有标签
            const existingTags = img.tags || [];
            
            // 添加新创建的标签
            const updatedTags = [...existingTags, ...newTags];
            
            return { ...img, tags: updatedTags };
          }),
        }));
      }
      
      onSuccess?.();
    } catch (error) {
      console.error("Failed to add tags:", error);
      alert("添加标签失败: " + error);
    }
  },

  // 删除图片
  deleteImages: async (imageIds, deleteSourceFile) => {
    try {
      await invoke("delete_images", { imageIds, deleteSourceFile });
      // 从本地状态中移除（包括 images 和 allImages）
      set((state) => {
        const newImages = state.images.filter((img) => !imageIds.includes(img.id));
        const newAllImages = state.allImages.filter((img) => !imageIds.includes(img.id));
        
        // 重新计算当前页，确保不超出范围
        const maxPage = Math.max(0, Math.ceil(newAllImages.length / state.pageSize) - 1);
        const newCurrentPage = Math.min(state.currentPage, maxPage);
        
        return {
          images: newImages,
          allImages: newAllImages,
          selectedIds: new Set(),
          totalCount: state.totalCount - imageIds.length,
          currentPage: newCurrentPage,
          hasMore: newImages.length < newAllImages.length,
        };
      });
    } catch (error) {
      console.error("Failed to delete images:", error);
      alert("删除失败: " + error);
    }
  },
}));
