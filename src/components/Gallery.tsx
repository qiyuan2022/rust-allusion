import { useRef, useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGalleryStore } from "../stores/gallery";
import { Image, Tag } from "../api/tags";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { TagSelectDialog } from "./TagSelectDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { Images, ImageOff, Check } from "lucide-react";

// 获取图片显示 URL（只使用缩略图，不回退到原图，用于排查缩略图生成问题）
function getImageDisplayUrl(image: Image): string | null {
  // 只使用 small 缩略图，不回退到原图
  if (image.thumbnail_path) {
    return convertFileSrc(image.thumbnail_path.replace(/\\/g, '/'));
  }
  // 没有缩略图，返回 null
  return null;
}

interface GalleryProps {
  onLoadMore?: () => void;
  onRefresh?: () => void;
  availableTags?: Tag[];
}

// 右键菜单位置
interface ContextMenuPos {
  x: number;
  y: number;
}

export function Gallery({ onLoadMore, onRefresh, availableTags = [] }: GalleryProps) {
  const store = useGalleryStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuPos | null>(null);
  const [contextImageId, setContextImageId] = useState<number | null>(null);

  // 标签选择弹窗
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);

  // 删除确认弹窗
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // 监听容器宽度变化
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    // 使用 requestAnimationFrame 确保在布局完成后获取宽度
    requestAnimationFrame(updateWidth);
    
    window.addEventListener('resize', updateWidth);
    
    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateWidth);
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateWidth);
      observer.disconnect();
    };
  }, []);

  // 无限滚动触发
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: "200px",
  });

  // 记录上一次 isSearching 状态，用于检测搜索开始/结束的切换
  const prevIsSearching = useRef<boolean>(false);

  useEffect(() => {
    // 如果有更多图片（基于 allImages），触发加载更多
    const hasMoreImages = store.allImages.length > store.images.length;
    if (inView && hasMoreImages && !store.isLoading) {
      onLoadMore?.();
    }
  }, [inView, store.hasMore, store.isLoading, onLoadMore]);

  // 在搜索开始时保存滚动位置；搜索结束时尝试恢复
  useEffect(() => {
    const isSearching = store.isSearching || (store.searchQuery && store.searchQuery.length > 0);
    // 搜索开始：保存 scrollTop
    if (!prevIsSearching.current && isSearching) {
      const pos = containerRef.current ? containerRef.current.scrollTop : 0;
      store.setSavedScrollTop(pos);
    }

    // 搜索结束：恢复 scrollTop（如果有保存）
    if (prevIsSearching.current && !isSearching) {
      const saved = store.savedScrollTop;
      if (saved !== null && containerRef.current) {
        // 延迟一帧等待内容渲染
        requestAnimationFrame(() => {
          containerRef.current!.scrollTop = saved;
          // 清空保存的值
          store.setSavedScrollTop(null);
        });
      }
    }

    prevIsSearching.current = isSearching;
  }, [store.isSearching, store.searchQuery, store.savedScrollTop, store]);

  // 处理图片点击
  const handleImageClick = (imageId: number, event?: React.MouseEvent) => {
    const isMulti = event ? (event.ctrlKey || event.metaKey || event.shiftKey) : false;
    store.selectImage(imageId, isMulti);
  };

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, imageId: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    // 如果右键的图片未被选中，则选中它
    if (!store.selectedIds.has(imageId)) {
      store.selectImage(imageId, false);
    }
    
    setContextMenu({ x: e.clientX, y: e.clientY });
    setContextImageId(imageId);
  };

  // 获取当前选中的图片数量
  const selectedCount = store.selectedIds.size;
  const hasSelection = selectedCount > 0;

  // 生成右键菜单项
  const getContextMenuItems = (): MenuItem[] => {
    const singleImage = store.images.find(img => img.id === contextImageId);
    
    return [
      {
        id: "detail",
        label: "详情",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
        onClick: () => {
          if (contextImageId) {
            store.openDetail(contextImageId);
          }
        },
      },
      {
        id: "rename",
        label: "重命名",
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        ),
        disabled: selectedCount > 1,
        onClick: () => {
          // 先关闭菜单
          setContextMenu(null);
          // 使用 setTimeout 确保菜单关闭后再显示 prompt
          setTimeout(() => {
            if (contextImageId && selectedCount === 1) {
              const newName = prompt("请输入新文件名:", singleImage?.file_name);
              if (newName && newName !== singleImage?.file_name) {
                store.renameImage(contextImageId, newName);
              }
            }
          }, 0);
        },
      },
      { id: "divider1", label: "", divider: true },
      {
        id: "tag",
        label: `打标签${hasSelection ? ` (${selectedCount}张)` : ""}`,
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
        ),
        onClick: () => {
          setTagSelectorOpen(true);
        },
      },
      { id: "divider2", label: "", divider: true },
      {
        id: "delete",
        label: `删除${hasSelection ? ` (${selectedCount}张)` : ""}`,
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ),
        danger: true,
        onClick: () => {
          setDeleteDialogOpen(true);
        },
      },
    ];
  };

  // 处理标签选择确认
  const handleTagConfirm = async (tagIds: number[], newTagNames: string[]) => {
    const selectedIds = Array.from(store.selectedIds);
    if (selectedIds.length === 0) return;

    await store.addTagsToImages(selectedIds, tagIds, newTagNames, () => {
      // 打标签成功后刷新图片列表
      onRefresh?.();
    });
    setTagSelectorOpen(false);
  };

  // 处理删除确认
  const handleDeleteConfirm = async (deleteSourceFile: boolean) => {
    const selectedIds = Array.from(store.selectedIds);
    if (selectedIds.length === 0) return;

    await store.deleteImages(selectedIds, deleteSourceFile);
    setDeleteDialogOpen(false);
  };

  // 获取当前选中图片的标签
  const getSelectedImageTags = (): number[] => {
    // 简化处理：返回空数组，实际应该从 store 获取选中图片的已有标签
    return [];
  };

  // 渲染网格布局
  const renderGrid = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
      {store.images.map((image) => {
        const isSelected = store.selectedIds.has(image.id);
        const hasTags = image.tags && image.tags.length > 0;
        const thumbnailUrl = getImageDisplayUrl(image);
        return (
          <div
            key={image.id}
            className={`
              relative aspect-[4/3] overflow-hidden cursor-pointer
              transition-all duration-150
              shadow-md hover:shadow-xl
              ${isSelected ? "ring-2 ring-primary-500 shadow-lg shadow-primary-200" : ""}
            `}
            onClick={(e) => {
              e.stopPropagation();
              handleImageClick(image.id, e);
            }}
            onDoubleClick={() => store.openDetail(image.id)}
            onContextMenu={(e) => handleContextMenu(e, image.id)}
          >
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={image.file_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center text-red-400">
                <ImageOff className="w-8 h-8 mb-1" />
                <span className="text-xs">无缩略图</span>
              </div>
            )}
            {isSelected && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            {/* 标签显示 - 单个标签黑底白字，位于底部 */}
            {hasTags && (
              <div className="absolute bottom-0 left-0 right-0 px-2 py-1 flex flex-wrap gap-1">
                {image.tags!.slice(0, 3).map((tag) => (
                  <span
                    key={tag.id}
                    className="text-xs text-white bg-gray-900 px-1.5 py-0.5 rounded truncate"
                    title={tag.name}
                  >
                    {tag.name}
                  </span>
                ))}
                {image.tags!.length > 3 && (
                  <span className="text-xs text-white bg-gray-900 px-1.5 py-0.5 rounded">+{image.tags!.length - 3}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // 渲染水平瀑布流
  const renderJustified = () => {
    // 如果容器宽度还未测量，显示占位内容避免闪烁
    if (containerWidth === 0) {
      return (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-24 bg-gray-100 rounded animate-pulse flex-1" />
              ))}
            </div>
          ))}
        </div>
      );
    }

    const rows: typeof store.images[] = [];
    let currentRow: typeof store.images = [];
    let currentRowWidth = 0;
    const targetRowHeight = 120;
    const spacing = 8;
    const maxContainerWidth = containerWidth - 32;

    store.images.forEach((image) => {
      const aspectRatio = (image.width || 300) / (image.height || 200);
      const imageWidth = targetRowHeight * aspectRatio;

      if (currentRowWidth + imageWidth + (currentRow.length > 0 ? spacing : 0) > maxContainerWidth && currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [image];
        currentRowWidth = imageWidth;
      } else {
        currentRow.push(image);
        currentRowWidth += imageWidth + (currentRow.length > 1 ? spacing : 0);
      }
    });

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }

    return (
      <div className="flex flex-col gap-2">
        {rows.map((row, rowIndex) => {
          const flexRatios = row.map(img => (img.width || 300) / (img.height || 200));
          const totalFlex = flexRatios.reduce((a, b) => a + b, 0);

          const totalAspectRatio = row.reduce((sum, img) => {
            return sum + ((img.width || 300) / (img.height || 200));
          }, 0);
          
          const availableWidth = maxContainerWidth - (row.length - 1) * spacing;
          let finalRowHeight = availableWidth / totalAspectRatio;
          const maxHeight = targetRowHeight * 2.5;
          finalRowHeight = Math.min(finalRowHeight, maxHeight);

          return (
            <div key={rowIndex} className="flex gap-2 w-full">
              {row.map((image) => {
                const isSelected = store.selectedIds.has(image.id);
                const flexRatio = (image.width || 300) / (image.height || 200);
                const flexGrow = flexRatio / totalFlex;
                const hasTags = image.tags && image.tags.length > 0;
                const thumbnailUrlJustified = getImageDisplayUrl(image);

                return (
                  <div
                    key={image.id}
                    className={`
                      relative overflow-hidden cursor-pointer
                      transition-all duration-150
                      shadow-md hover:shadow-xl
                      ${isSelected ? "ring-2 ring-primary-500 shadow-lg shadow-primary-200" : ""}
                    `}
                    style={{ 
                      height: `${finalRowHeight}px`,
                      flex: `${flexGrow} 1 0`,
                      minWidth: 0
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick(image.id, e);
                    }}
                    onDoubleClick={() => store.openDetail(image.id)}
                    onContextMenu={(e) => handleContextMenu(e, image.id)}
                  >
                    {thumbnailUrlJustified ? (
                      <img
                        src={thumbnailUrlJustified}
                        alt={image.file_name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center text-red-400">
                        <ImageOff className="w-6 h-6 mb-1" />
                        <span className="text-[10px]">无缩略图</span>
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                    {/* 标签显示 - 单个标签黑底白字，位于底部 */}
                    {hasTags && (
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 flex flex-wrap gap-1">
                        {image.tags!.slice(0, 2).map((tag) => (
                          <span
                            key={tag.id}
                            className="text-[10px] text-white bg-gray-900 px-1 py-0.5 rounded truncate"
                            title={tag.name}
                          >
                            {tag.name}
                          </span>
                        ))}
                        {image.tags!.length > 2 && (
                          <span className="text-[10px] text-white bg-gray-900 px-1 py-0.5 rounded">+{image.tags!.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto p-4"
      onClick={() => store.clearSelection()}
    >
      {store.images.length === 0 ? (
        <div className="h-full flex items-center justify-center text-gray-400">
          <div className="text-center">
            <Images className="w-16 h-16 mx-auto mb-4 text-gray-300" strokeWidth={1.5} />
            <p className="text-lg font-medium text-gray-500">暂无图片</p>
            <p className="text-sm mt-1">拖入文件夹或点击导入开始</p>
          </div>
        </div>
      ) : (
        <>
          {store.viewMode === "grid" && renderGrid()}
          {store.viewMode === "justified" && renderJustified()}
          
          <div ref={loadMoreRef} className="flex items-center justify-center p-8">
            {store.isLoading && store.allImages.length === 0 ? (
              // 首次加载
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                <span>正在加载图片...</span>
              </div>
            ) : store.isLoading ? (
              // 后台加载中
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin" />
                <span>正在加载更多数据...</span>
              </div>
            ) : store.isSearching ? (
              // 搜索模式
              <span className="text-gray-400">
                搜索结果: {store.images.length} 张图片
                {store.searchQuery && ` (关键词: "${store.searchQuery}")`}
              </span>
            ) : store.allImages.length > store.images.length ? (
              <span className="text-gray-400">
                滚动加载更多 ({store.images.length}/{store.allImages.length})
              </span>
            ) : (
              <span className="text-gray-400">
                已加载全部 {store.allImages.length} 张图片
              </span>
            )}
          </div>
        </>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div onClick={(e) => e.stopPropagation()}>
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={getContextMenuItems()}
            onClose={() => setContextMenu(null)}
          />
        </div>
      )}

      {/* 标签选择弹窗 */}
      <TagSelectDialog
        isOpen={tagSelectorOpen}
        onClose={() => setTagSelectorOpen(false)}
        onConfirm={handleTagConfirm}
        availableTags={availableTags}
        selectedTagIds={getSelectedImageTags()}
        imageCount={store.selectedIds.size}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        imageCount={store.selectedIds.size}
      />
    </div>
  );
}

export default Gallery;
