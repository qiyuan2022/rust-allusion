import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useGalleryStore } from "../stores/gallery";
import { Image, Tag } from "../api/tags";
import {
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  tokens,
  Spinner,
  Text,
} from "@fluentui/react-components";
import { TagSelectDialog } from "./TagSelectDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { RenameDialog } from "./RenameDialog";
import { LazyThumbnail } from "./LazyThumbnail";
import {
  ImageMultipleRegular,
  CheckmarkRegular,
  InfoRegular,
  EditRegular,
  TagMultipleRegular,
  DeleteRegular,
} from "@fluentui/react-icons";

// 全局标志：用于阻止菜单关闭后的 click 穿透事件触发 clearSelection
let menuJustClosed = false;

interface GalleryProps {
  onLoadMore?: () => void;
  onRefresh?: () => void;
  availableTags?: Tag[];
}

// 根据窗口宽度计算列数（与 Tailwind 断点一致）
function getColumnCount(): number {
  const width = window.innerWidth;
  if (width >= 1280) return 5; // xl:grid-cols-5
  if (width >= 1024) return 4; // lg:grid-cols-4
  if (width >= 768) return 3;  // md:grid-cols-3
  if (width >= 640) return 3;  // sm:grid-cols-3
  return 2; // grid-cols-2
}

// 计算行高（根据列数和容器宽度）
function getRowHeight(containerWidth: number, columns: number): number {
  const gap = 8;
  const padding = 16;
  const itemWidth = (containerWidth - padding * 2 - (columns - 1) * gap) / columns;
  const itemHeight = itemWidth * 0.75; // aspect-[4/3]
  return itemHeight + gap; // 加上下间距
}

// 单张图片的右键菜单组件
function ImageContextMenu({
  imageId,
  onTag,
  onDelete,
  onRename,
  children,
  style,
  className,
}: {
  imageId: number;
  onTag: () => void;
  onDelete: () => void;
  onRename: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const store = useGalleryStore();
  const [open, setOpen] = useState(false);
  const [menuOffset, setMenuOffset] = useState({ mainAxis: 0, crossAxis: 0 });
  const selectedCount = store.selectedIds.size;

  const closeMenu = () => {
    setOpen(false);
    menuJustClosed = true;
    setTimeout(() => {
      menuJustClosed = false;
    }, 100);
  };

  const handleDetail = () => {
    closeMenu();
    store.openDetail(imageId);
  };

  const handleRename = () => {
    closeMenu();
    setTimeout(() => {
      if (selectedCount === 1) {
        onRename();
      }
    }, 0);
  };

  const handleTag = () => {
    closeMenu();
    onTag();
  };

  const handleDelete = () => {
    closeMenu();
    onDelete();
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuOffset({
      mainAxis: e.clientY - rect.bottom,
      crossAxis: e.clientX - rect.left,
    });

    if (!store.selectedIds.has(imageId)) {
      store.selectImage(imageId, false);
    }
    setOpen(true);
  };

  return (
    <Menu
      open={open}
      onOpenChange={(_e, data) => setOpen(data.open)}
      positioning={{
        position: "below",
        align: "start",
        offset: menuOffset,
      }}
    >
      <MenuTrigger disableButtonEnhancement>
        <div onContextMenu={handleContextMenu} style={style} className={className}>{children}</div>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          <MenuItem icon={<InfoRegular fontSize={16} />} onClick={handleDetail}>
            详情
          </MenuItem>
          <MenuItem
            icon={<EditRegular fontSize={16} />}
            onClick={handleRename}
            disabled={selectedCount > 1}
          >
            重命名
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={<TagMultipleRegular fontSize={16} />} onClick={handleTag}>
            打标签{selectedCount > 0 ? ` (${selectedCount}张)` : ""}
          </MenuItem>
          <MenuDivider />
          <MenuItem
            icon={<DeleteRegular fontSize={16} />}
            onClick={handleDelete}
            style={{ color: tokens.colorPaletteRedForeground1 }}
          >
            删除{selectedCount > 0 ? ` (${selectedCount}张)` : ""}
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}

export function Gallery({ onRefresh, availableTags = [] }: GalleryProps) {
  const store = useGalleryStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameImageId, setRenameImageId] = useState<number | null>(null);
  const renameImage = renameImageId ? store.images.find((img) => img.id === renameImageId) : null;

  const columns = useMemo(() => getColumnCount(), []);
  const rowHeight = useMemo(() => getRowHeight(containerWidth, columns), [containerWidth, columns]);

  const rowCount = useMemo(() => {
    return Math.ceil(store.images.length / columns);
  }, [store.images.length, columns]);

  const gridVirtualizer = useVirtualizer({
    count: store.viewMode === "grid" ? rowCount : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight || 150,
    overscan: 3,
    getItemKey: (index) => `grid-row-${index}`,
  });

  const justifiedRows = useMemo(() => {
    if (store.viewMode !== "justified" || containerWidth === 0) return [];

    const rows: {
      images: typeof store.images;
      height: number;
      totalFlex: number;
      flexRatios: number[];
      isLastRow: boolean;
    }[] = [];

    let currentRowImages: typeof store.images = [];
    let currentRowWidth = 0;
    const targetRowHeight = 120;
    const spacing = 8;
    const maxContainerWidth = containerWidth - 32;

    store.images.forEach((image) => {
      const aspectRatio = (image.width || 300) / (image.height || 200);
      const imageWidth = targetRowHeight * aspectRatio;

      if (currentRowWidth + imageWidth + (currentRowImages.length > 0 ? spacing : 0) > maxContainerWidth && currentRowImages.length > 0) {
        const rowFlexRatios = currentRowImages.map(img => (img.width || 300) / (img.height || 200));
        const rowTotalFlex = rowFlexRatios.reduce((a, b) => a + b, 0);
        const rowTotalAspectRatio = currentRowImages.reduce((sum, img) => sum + ((img.width || 300) / (img.height || 200)), 0);
        const rowAvailableWidth = maxContainerWidth - (currentRowImages.length - 1) * spacing;
        let rowHeight = rowAvailableWidth / rowTotalAspectRatio;
        rowHeight = Math.min(rowHeight, targetRowHeight * 2.5);

        rows.push({
          images: currentRowImages,
          height: rowHeight,
          totalFlex: rowTotalFlex,
          flexRatios: rowFlexRatios,
          isLastRow: false,
        });

        currentRowImages = [image];
        currentRowWidth = imageWidth;
      } else {
        currentRowImages.push(image);
        currentRowWidth += imageWidth + (currentRowImages.length > 1 ? spacing : 0);
      }
    });

    if (currentRowImages.length > 0) {
      const rowFlexRatios = currentRowImages.map(img => (img.width || 300) / (img.height || 200));
      const rowTotalFlex = rowFlexRatios.reduce((a, b) => a + b, 0);

      // 最后一行固定使用 targetRowHeight，保持与前面行视觉统一，不按容器宽度拉伸
      const rowHeight = targetRowHeight;

      rows.push({
        images: currentRowImages,
        height: rowHeight,
        totalFlex: rowTotalFlex,
        flexRatios: rowFlexRatios,
        isLastRow: true,
      });
    }

    return rows;
  }, [store.images, store.viewMode, containerWidth]);

  const ROW_GAP = 8;
  
  const justifiedVirtualizer = useVirtualizer({
    count: store.viewMode === "justified" ? justifiedRows.length : 0,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => (justifiedRows[index]?.height || 120) + ROW_GAP,
    overscan: 2,
    getItemKey: (index) => `justified-row-${index}`,
  });

  const virtualizer = store.viewMode === "grid" ? gridVirtualizer : justifiedVirtualizer;
  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateDimensions = () => {
      setContainerWidth(container.clientWidth);
      virtualizer.measure();
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, [virtualizer]);

  useEffect(() => {
    gridVirtualizer.measure();
  }, [rowHeight, gridVirtualizer]);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (store.viewMode === "grid") {
        gridVirtualizer.measure();
      } else {
        justifiedVirtualizer.measure();
      }
    });
  }, [store.viewMode, gridVirtualizer, justifiedVirtualizer]);

  const handleImageClick = useCallback((imageId: number, event?: React.MouseEvent) => {
    const isMulti = event ? (event.ctrlKey || event.metaKey || event.shiftKey) : false;
    store.selectImage(imageId, isMulti);
  }, [store]);

  const selectedCount = store.selectedIds.size;

  const handleTagConfirm = async (tagIds: number[], newTagNames: string[]) => {
    const selectedIds = Array.from(store.selectedIds);
    if (selectedIds.length === 0) return;

    await store.addTagsToImages(selectedIds, tagIds, newTagNames, () => {
      onRefresh?.();
    });
    setTagSelectorOpen(false);
  };

  const handleDeleteConfirm = async (deleteSourceFile: boolean) => {
    const selectedIds = Array.from(store.selectedIds);
    if (selectedIds.length === 0) return;

    await store.deleteImages(selectedIds, deleteSourceFile);
    setDeleteDialogOpen(false);
  };

  const handleRenameConfirm = async (newName: string) => {
    if (!renameImageId) return;
    await store.renameImage(renameImageId, newName);
    setRenameDialogOpen(false);
    setRenameImageId(null);
  };

  const renderGridRow = (virtualRow: typeof virtualItems[0]) => {
    const rowIndex = virtualRow.index;
    const startIndex = rowIndex * columns;
    const rowImages = store.images.slice(startIndex, startIndex + columns);

    return (
      <div
        key={virtualRow.key}
        data-index={rowIndex}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${virtualRow.size}px`,
          transform: `translateY(${virtualRow.start}px)`,
        }}
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 px-4"
      >
        {rowImages.map((image) => {
          const isSelected = store.selectedIds.has(image.id);
          const hasTags = image.tags && image.tags.length > 0;

          return (
            <ImageContextMenu
              key={image.id}
              imageId={image.id}
              onTag={() => setTagSelectorOpen(true)}
              onDelete={() => setDeleteDialogOpen(true)}
              onRename={() => {
                setRenameImageId(image.id);
                setRenameDialogOpen(true);
              }}
            >
              <div
                className={`
                  relative aspect-[4/3] overflow-hidden cursor-pointer
                  transition-all duration-150
                  shadow-md hover:shadow-xl
                  ${isSelected ? "ring-2 ring-primary-500 shadow-lg shadow-primary-200 dark:shadow-primary-900/30" : ""}
                `}
                onClick={(e) => {
                  e.stopPropagation();
                  handleImageClick(image.id, e);
                }}
                onDoubleClick={() => store.openDetail(image.id)}
              >
                <LazyThumbnail
                  imageId={image.id}
                  hash={image.hash}
                  imagePath={image.path}
                  fileName={image.file_name}
                  existingPath={image.thumbnail_path}
                  className="w-full h-full"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                    <CheckmarkRegular className="w-4 h-4 text-white" />
                  </div>
                )}
                {hasTags && (
                  <div className="absolute bottom-0 left-0 right-0 px-2 py-1 flex flex-wrap gap-1">
                    {image.tags!.slice(0, 3).map((tag, idx) => (
                      <span
                        key={`${image.id}-${tag.id}-${idx}`}
                        className="text-xs text-white bg-gray-900 px-1.5 py-0.5 rounded truncate"
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {image.tags!.length > 3 && (
                      <span key={`${image.id}-more`} className="text-xs text-white bg-gray-900 px-1.5 py-0.5 rounded">+{image.tags!.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </ImageContextMenu>
          );
        })}
      </div>
    );
  };

  const renderGrid = () => {
    if (containerWidth === 0) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 px-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      );
    }

    return (
      <div style={{ height: `${totalSize}px`, position: 'relative' }}>
        {virtualItems.map(renderGridRow)}
      </div>
    );
  };

  const renderJustifiedRow = (virtualRow: typeof virtualItems[0]) => {
    const rowIndex = virtualRow.index;
    const rowData = justifiedRows[rowIndex];
    if (!rowData) return null;

    const { images, height, totalFlex, flexRatios, isLastRow } = rowData;

    return (
      <div
        key={virtualRow.key}
        data-index={rowIndex}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${height}px`,
          transform: `translateY(${virtualRow.start}px)`,
          paddingTop: '4px',
          paddingBottom: '4px',
        }}
        className="flex gap-2 px-4"
      >
        {images.map((image, imgIndex) => {
          const isSelected = store.selectedIds.has(image.id);
          const flexGrow = flexRatios[imgIndex] / totalFlex;
          const hasTags = image.tags && image.tags.length > 0;

          const itemStyle = isLastRow
            ? {
                height: `${height}px`,
                flex: `0 1 ${height * flexRatios[imgIndex]}px`,
                minWidth: 0,
              }
            : {
                height: `${height}px`,
                flex: `${flexGrow} 1 0`,
                minWidth: 0,
              };

          return (
            <ImageContextMenu
              key={image.id}
              imageId={image.id}
              onTag={() => setTagSelectorOpen(true)}
              onDelete={() => setDeleteDialogOpen(true)}
              onRename={() => {
                setRenameImageId(image.id);
                setRenameDialogOpen(true);
              }}
              className={`
                relative overflow-hidden cursor-pointer
                transition-all duration-150
                shadow-md hover:shadow-xl
                ${isSelected ? "ring-2 ring-primary-500 shadow-lg shadow-primary-200 dark:shadow-primary-900/30" : ""}
              `}
              style={itemStyle}
            >
              <div
                className="w-full h-full"
                onClick={(e) => {
                  e.stopPropagation();
                  handleImageClick(image.id, e);
                }}
                onDoubleClick={() => store.openDetail(image.id)}
              >
                <LazyThumbnail
                  imageId={image.id}
                  hash={image.hash}
                  imagePath={image.path}
                  fileName={image.file_name}
                  existingPath={image.thumbnail_path}
                  className="w-full h-full"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                    <CheckmarkRegular className="w-4 h-4 text-white" />
                  </div>
                )}
                {hasTags && (
                  <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 flex flex-wrap gap-1">
                    {image.tags!.slice(0, 2).map((tag, idx) => (
                      <span
                        key={`${image.id}-${tag.id}-${idx}`}
                        className="text-[10px] text-white bg-gray-900 px-1 py-0.5 rounded truncate"
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {image.tags!.length > 2 && (
                      <span key={`${image.id}-more`} className="text-[10px] text-white bg-gray-900 px-1 py-0.5 rounded">+{image.tags!.length - 2}</span>
                    )}
                  </div>
                )}
              </div>
            </ImageContextMenu>
          );
        })}
      </div>
    );
  };

  const renderJustified = () => {
    if (containerWidth === 0 || justifiedRows.length === 0) {
      return (
        <div className="flex flex-col gap-2 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-24 bg-gray-100 dark:bg-gray-800 rounded animate-pulse flex-1" />
              ))}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{ height: `${totalSize}px`, position: 'relative' }}>
        {virtualItems.map(renderJustifiedRow)}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden h-full"
      onClick={(e) => {
        if (menuJustClosed) {
          menuJustClosed = false;
          return;
        }
        // React 17+ portal 内部的事件会冒泡到 React 树祖先
        // 阻止 Dialog/Menu 等 portal 内的点击触发 clearSelection
        const target = e.target as HTMLElement;
        if (target.closest('[role="dialog"]') || target.closest('[role="menu"]')) {
          return;
        }
        store.clearSelection();
      }}
    >
      {store.images.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <ImageMultipleRegular className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <Text size={500} weight="semibold" className="text-gray-500 dark:text-gray-300 block">
              暂无图片
            </Text>
            <Text size={300} className="mt-1 dark:text-gray-400 block">
              拖入文件夹或点击导入开始
            </Text>
          </div>
        </div>
      ) : (
        <>
          {store.viewMode === "grid" && renderGrid()}
          {store.viewMode === "justified" && renderJustified()}

          {/* 底部状态栏 */}
          <div className="flex items-center justify-center p-8">
            {store.isLoading && store.allImages.length === 0 ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner size="tiny" />
                <Text className="text-gray-400 dark:text-gray-500">正在加载图片...</Text>
              </div>
            ) : store.isLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Spinner size="tiny" />
                <Text className="text-gray-400 dark:text-gray-500">正在处理...</Text>
              </div>
            ) : store.isSearching ? (
              <Text className="text-gray-400 dark:text-gray-500">
                搜索结果: {store.images.length} 张图片
                {store.searchQuery && ` (关键词: "${store.searchQuery}")`}
              </Text>
            ) : (
              <Text className="text-gray-400 dark:text-gray-500">
                共 {store.allImages.length} 张图片
              </Text>
            )}
          </div>
        </>
      )}

      {/* 标签选择弹窗 */}
      <TagSelectDialog
        isOpen={tagSelectorOpen}
        onClose={() => setTagSelectorOpen(false)}
        onConfirm={handleTagConfirm}
        availableTags={availableTags}
        selectedTagIds={[]}
        imageCount={store.selectedIds.size}
      />

      {/* 删除确认弹窗 */}
      <DeleteConfirmDialog
        isOpen={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        imageCount={store.selectedIds.size}
      />

      {/* 重命名弹窗 */}
      <RenameDialog
        isOpen={renameDialogOpen}
        onClose={() => {
          setRenameDialogOpen(false);
          setRenameImageId(null);
        }}
        onConfirm={handleRenameConfirm}
        currentName={renameImage?.file_name || ""}
      />
    </div>
  );
}

export default Gallery;
