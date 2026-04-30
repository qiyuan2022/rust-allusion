import { useState, useCallback } from "react";
import { useGalleryStore } from "../stores/gallery";
import { Tag } from "../api/tags";

/**
 * 公共打标签逻辑：管理 TagSelectDialog 的打开/关闭、
 * 收集选中图片的已有标签、确认后批量写入。
 */
export function useTagging(availableTags: Tag[], onSidebarRefresh?: () => void) {
  const store = useGalleryStore();
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [initialTagIds, setInitialTagIds] = useState<number[]>([]);

  /** 收集当前选中图片的标签 ID 并打开弹窗 */
  const openTagDialog = useCallback(() => {
    const selectedImageIds = Array.from(store.selectedIds);
    if (selectedImageIds.length === 0) return;

    const allTagIds = new Set<number>();
    for (const id of selectedImageIds) {
      const image = store.images.find((img) => img.id === id);
      if (image?.tags) {
        for (const tag of image.tags) {
          allTagIds.add(tag.id);
        }
      }
    }

    setInitialTagIds(Array.from(allTagIds));
    setTagSelectorOpen(true);
  }, [store.selectedIds, store.images]);

  /** 确认打标签 */
  const handleTagConfirm = useCallback(
    async (tagIds: number[], newTagNames: string[]) => {
      const selectedIds = Array.from(store.selectedIds);
      if (selectedIds.length === 0) return;

      await store.addTagsToImages(selectedIds, tagIds, newTagNames, availableTags);
      onSidebarRefresh?.();
      setTagSelectorOpen(false);
    },
    [store, availableTags, onSidebarRefresh],
  );

  /** 关闭弹窗 */
  const closeTagDialog = useCallback(() => {
    setTagSelectorOpen(false);
  }, []);

  return {
    tagSelectorOpen,
    initialTagIds,
    openTagDialog,
    handleTagConfirm,
    closeTagDialog,
    /** 当前选中图片数量（用于 TagSelectDialog 的 imageCount） */
    selectedCount: store.selectedIds.size,
  };
}