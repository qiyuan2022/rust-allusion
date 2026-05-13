import { useEffect, useCallback, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// 将 invoke 暴露到全局，方便在控制台调试
(window as any).tauriInvoke = invoke;

import { Layout } from "./components/Layout";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Gallery } from "./components/Gallery";
import { TitleBar } from "./components/TitleBar";
import { ImageViewer } from "./components/ImageViewer";
import { ImageDetail } from "./pages/ImageDetail";
import { useGalleryStore } from "./stores/gallery";
import { Image, Tag, TagTreeNode, getAllTags, getTagTree, getAllImages, getImagesBatch, getImagesByTags } from "./api/tags";
import { searchImages, getSearchIndexStatus, rebuildSearchIndex } from "./api/search";
import { 
  Location, 
  getAllLocations, 
  deleteLocation as deleteLocationApi,
} from "./api/locations";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Text,
  Spinner,
} from "@fluentui/react-components";

// 重新导出Location类型
export type { Location } from "./api/locations";

function MainApp() {
  const store = useGalleryStore();
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagTree, setTagTree] = useState<TagTreeNode[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [imageCount, setImageCount] = useState(0);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // 删除位置确认弹窗状态
  const [deleteLocationDialog, setDeleteLocationDialog] = useState<{
    isOpen: boolean;
    locationId: number | null;
    locationName: string;
  }>({ isOpen: false, locationId: null, locationName: "" });

  // 搜索索引重建提示
  const [showRebuildIndexPrompt, setShowRebuildIndexPrompt] = useState(false);
  const [isRebuildingIndex, setIsRebuildingIndex] = useState(false);

  // 分批加载图片元数据
  const BATCH_SIZE = 500;
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });

  // 本地搜索 token，用于丢弃被取消或过时的搜索结果
  const activeSearchToken = useRef(0);
  // 在发起搜索前保存当前可见图片（用于取消搜索后恢复原始视图）
  const prevVisibleImages = useRef<Image[] | null>(null);
  const prevCurrentPage = useRef<number | null>(null);

  const loadAllImages = useCallback(async () => {
    try {
      store.setLoading(true);
      
      // 先获取总数
      const totalCount = await invoke<number>("count_images");
      setImageCount(totalCount);
      setLoadProgress({ loaded: 0, total: totalCount });
      
      // 分批加载策略：无论总量多少，先加载第一批让 UI 尽早可用
      const allImages: Array<Image> = [];
      let offset = 0;
      
      // 先加载第一批（500张），让用户快速看到内容
      const firstBatch = await getImagesBatch(0, BATCH_SIZE, store.sortBy, store.sortOrder);
      allImages.push(...firstBatch);
      store.setAllImages([...allImages]);
      setLoadProgress({ loaded: firstBatch.length, total: totalCount });
      
      // 第一批到达后立即解除全屏 loading，让侧边栏/头部正常显示
      // Gallery 内部会继续展示加载状态
      setIsLoading(false);
      
      // 后台继续加载剩余数据
      offset = BATCH_SIZE;
      while (offset < totalCount) {
        const batch = await getImagesBatch(offset, BATCH_SIZE, store.sortBy, store.sortOrder);
        if (batch.length === 0) break;
        allImages.push(...batch);
        store.setAllImages([...allImages]);
        setLoadProgress({ loaded: allImages.length, total: totalCount });
        offset += BATCH_SIZE;
      }
    } catch (error) {
      console.error("Failed to load all images:", error);
    } finally {
      store.setLoading(false);
      setIsLoading(false);
    }
  }, [store.sortBy, store.sortOrder]);

  // 【虚拟滚动】直接传递所有图片元数据给 Gallery
  useEffect(() => {
    if (store.allImages.length === 0) return;
    
    // 如果处于搜索模式，不要覆盖
    if (store.isSearching || store.searchQuery || store.selectedTagIds.length > 0) {
      return;
    }
    
    store.setImages(store.allImages);
  }, [store.allImages, store.isSearching, store.searchQuery, store.selectedTagIds]);

  // 【虚拟滚动】已废弃，由 Gallery 内部滚动处理
  const loadMoreImages = useCallback(() => {
    // 虚拟滚动模式下无需手动加载更多
  }, []);

  // 刷新图片（排序变化时）
  const loadImages = useCallback(async () => {
    store.setAllImages([]);
    store.setImages([]);
    store.setCurrentPage(0);
    setLoadProgress({ loaded: 0, total: 0 });
    await loadAllImages();
  }, [loadAllImages]);

  // 加载标签和位置
  const loadSidebarData = useCallback(async () => {
    try {
      const [tags, tree, locs] = await Promise.all([
        getAllTags(),
        getTagTree(),
        getAllLocations(),
      ]);
      setAvailableTags(tags);
      setTagTree(tree);
      setLocations(locs);
    } catch (error) {
      console.error("Failed to load sidebar data:", error);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    loadAllImages();
    loadSidebarData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听后台启动扫描完成事件，自动刷新数据
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      const unlisten = await listen("startup-scan-completed", (event) => {
        const payload = event.payload as {
          newFiles: number;
          deletedFiles: number;
          failedImports: number;
        };
        console.log(
          `后台同步完成：新增 ${payload.newFiles} 张，移除 ${payload.deletedFiles} 张`
        );
        // 刷新图片列表和侧边栏数据
        loadAllImages();
        loadSidebarData();
      });
      unlistenFn = unlisten;
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 排序变化时重新加载
  useEffect(() => {
    if (store.allImages.length === 0 && !store.isLoading) return;
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sortBy, store.sortOrder]);

  // 标签选择变化时触发搜索
  useEffect(() => {
    if (store.allImages.length === 0) return;
    
    if (store.selectedTagIds.length > 0) {
      handleSearch(store.searchQuery);
    } else {
      activeSearchToken.current += 1;
      
      store.clearSearch();

      const restored = store.allImages.slice();
      store.setImages(restored);
      store.setCurrentPage(0);

      prevVisibleImages.current = null;
      prevCurrentPage.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selectedTagIds]);

  // 搜索处理
  const handleSearch = useCallback(
    async (query: string) => {
      activeSearchToken.current += 1;
      const token = activeSearchToken.current;

      prevVisibleImages.current = store.images.slice();
      prevCurrentPage.current = store.currentPage;

      store.setSearchQuery(query);
      
      if (!query && store.selectedTagIds.length === 0) {
        store.clearSearch();
        store.setImages(store.allImages);
        return;
      }

      if (store.allImages.length === 0) {
        return;
      }

      // 纯标签筛选（无文本搜索词）时直接查数据库，避免搜索索引不同步
      if (!query && store.selectedTagIds.length > 0) {
        try {
          store.setLoading(true);
          const results = await getImagesByTags(store.selectedTagIds, "any", 0, 10000);
          const resultIds = new Set(results.map((img) => img.id));
          const filtered = store.allImages.filter((img) => resultIds.has(img.id));

          store.setSearchResults({
            total: filtered.length,
            hits: filtered.map((img) => ({ image_id: img.id, score: 1, highlights: [] })),
            has_more: false,
          });
          store.setImages(filtered);
          store.setCurrentPage(0);
        } catch (error) {
          console.error("Tag filter failed:", error);
        } finally {
          store.setLoading(false);
        }
        return;
      }

      try {
        store.setLoading(true);
        console.log("Searching with query:", query, "tag_ids:", store.selectedTagIds);
        const results = await searchImages({
          text: query,
          tag_ids: store.selectedTagIds || [],
          exclude_tag_ids: [],
          limit: 1000,
          offset: 0,
        });
        if (token !== activeSearchToken.current) {
          return;
        }

        store.setSearchResults(results);
        
        const resultIds = new Set(results.hits.map((h: { image_id: number }) => String(h.image_id)));
        
        const filtered = store.allImages.filter((img) => resultIds.has(String(img.id)));
        
        if (results.hits.length > 0 && filtered.length === 0) {
          console.warn("Search index out of sync with database. Consider rebuilding index.");
          setShowRebuildIndexPrompt(true);
        }
        
        store.setImages(filtered);
        store.setCurrentPage(0);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        store.setLoading(false);
      }
    },
    [store]
  );

  // 重建搜索索引
  const handleRebuildIndex = useCallback(async () => {
    try {
      setIsRebuildingIndex(true);
      const indexed = await rebuildSearchIndex();
      console.log(`Rebuilt search index: ${indexed} images indexed`);
      setShowRebuildIndexPrompt(false);
      if (store.searchQuery) {
        handleSearch(store.searchQuery);
      }
    } catch (error) {
      console.error("Failed to rebuild index:", error);
      alert("重建索引失败: " + error);
    } finally {
      setIsRebuildingIndex(false);
    }
  }, [store.searchQuery, handleSearch]);

  // 打开删除位置确认弹窗
  const handleDeleteLocation = useCallback((id: number) => {
    const location = locations.find((loc) => loc.id === id);
    if (location) {
      setDeleteLocationDialog({
        isOpen: true,
        locationId: id,
        locationName: location.name,
      });
    }
  }, [locations]);
  
  // 确认删除位置
  const confirmDeleteLocation = useCallback(async () => {
    if (!deleteLocationDialog.locationId) return;
    
    try {
      await deleteLocationApi(deleteLocationDialog.locationId);
      setLocations((prev) => prev.filter((loc) => loc.id !== deleteLocationDialog.locationId));
      await loadImages();
      setDeleteLocationDialog({ isOpen: false, locationId: null, locationName: "" });
    } catch (error) {
      console.error("Failed to delete location:", error);
      alert("删除失败: " + error);
    }
  }, [deleteLocationDialog.locationId, loadImages]);

  // 头部组件
  const HeaderComponent = (
    <Header
      totalCount={imageCount}
      searchQuery={store.searchQuery}
      onSearchChange={handleSearch}
      onRefresh={() => {
        store.setCurrentPage(0);
        loadImages();
        loadSidebarData();
      }}
      viewMode={store.viewMode}
      onViewModeChange={store.setViewMode}
      viewSize={store.viewSize}
      onViewSizeChange={store.setViewSize}
      sortBy={store.sortBy}
      onSortChange={store.setSortBy}
      availableTags={availableTags}
      onSidebarRefresh={loadSidebarData}
    />
  );

  // 侧边栏组件
  const SidebarComponent = (
    <Sidebar
      collapsed={isSidebarCollapsed}
      onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      locations={locations}
      tagTree={tagTree}
      selectedLocationId={selectedLocationId}
      selectedTagId={
        store.selectedTagIds.length === 1 ? store.selectedTagIds[0] : null
      }
      selectedTagIds={store.selectedTagIds}
      onSelectLocation={(location) => {
        setSelectedLocationId(location.id);
      }}
      onSelectTag={(tag, isCtrlClick) => {
        if (isCtrlClick) {
          store.toggleTagSelection(tag.id);
        } else {
          if (store.selectedTagIds.length === 1 && store.selectedTagIds[0] === tag.id) {
            store.setSelectedTagIds([]);
          } else {
            store.setSelectedTagIds([tag.id]);
          }
        }
      }}
      onDeleteLocation={handleDeleteLocation}
      onTagMoved={loadSidebarData}
      onTagDeleted={loadSidebarData}
      onLocationsChange={() => {
        loadSidebarData();
        loadImages();
      }}
    />
  );

  // 主内容
  const MainContent = (
    <>
      <Gallery
        onLoadMore={loadMoreImages}
        onRefresh={loadImages}
        onSidebarRefresh={loadSidebarData}
        availableTags={availableTags}
      />
      <ImageViewer />
    </>
  );

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="small" />
          <Text className="text-gray-500 dark:text-gray-400 text-sm">加载中...</Text>
        </div>
      </div>
    );
  }

  return (
    <>
      <Layout
        header={HeaderComponent}
        sidebar={SidebarComponent}
        mainContent={MainContent}
        sidebarCollapsed={isSidebarCollapsed}
      />
      
      {/* 删除位置确认弹窗 */}
      <Dialog
        open={deleteLocationDialog.isOpen}
        onOpenChange={(_e, data) => {
          if (!data.open) {
            setDeleteLocationDialog({ isOpen: false, locationId: null, locationName: "" });
          }
        }}
      >
        <DialogSurface style={{ maxWidth: "400px", width: "100%" }}>
          <DialogTitle>确认删除位置</DialogTitle>
          <DialogContent>
            <Text>
              确定要删除位置 <span className="font-medium">"{deleteLocationDialog.locationName}"</span> 吗？
            </Text>
            <Text size={200} className="text-gray-500 dark:text-gray-400 mt-2" block>
              删除位置将同时删除该位置下的所有图片记录（标签关联会保留）。
            </Text>
          </DialogContent>
          <DialogActions style={{ marginTop: "12px" }}>
            <Button
              appearance="secondary"
              onClick={() => setDeleteLocationDialog({ isOpen: false, locationId: null, locationName: "" })}
            >
              取消
            </Button>
            <Button
              appearance="primary"
              onClick={confirmDeleteLocation}
              className="!bg-red-500 hover:!bg-red-600 !text-white"
            >
              删除
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>

      {/* 搜索索引重建提示 */}
      <Dialog
        open={showRebuildIndexPrompt}
        onOpenChange={(_e, data) => {
          if (!data.open) setShowRebuildIndexPrompt(false);
        }}
      >
        <DialogSurface style={{ maxWidth: "420px", width: "100%" }}>
          <DialogTitle style={{ fontSize: "16px" }}>搜索索引需要重建</DialogTitle>
          <DialogContent>
            <Text>
              检测到搜索索引与数据库不同步，可能导致搜索结果无法显示。
            </Text>
            <Text size={200} className="text-gray-500 dark:text-gray-400 mt-2" block>
              建议重建搜索索引以修复此问题。重建过程可能需要一些时间，取决于图片数量。
            </Text>
          </DialogContent>
          <DialogActions style={{ marginTop: "12px" }}>
            <Button
              appearance="secondary"
              onClick={() => setShowRebuildIndexPrompt(false)}
              disabled={isRebuildingIndex}
            >
              稍后再说
            </Button>
            <Button
              appearance="primary"
              onClick={handleRebuildIndex}
              disabled={isRebuildingIndex}
            >
              {isRebuildingIndex ? "重建中..." : "重建索引"}
            </Button>
          </DialogActions>
        </DialogSurface>
      </Dialog>
    </>
  );
}

function App() {
  const store = useGalleryStore();

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      {/* 标题栏 - 始终固定在顶部，不受详情页 transform 影响 */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 200 }}>
        <TitleBar />
      </div>

      {/* 主应用界面内容区（不含标题栏） */}
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 0,
          right: 0,
          bottom: 0,
          transform: store.isDetailOpen ? "translateX(-20px)" : "translateX(0)",
          opacity: store.isDetailOpen ? 0.5 : 1,
          transition: "transform 0.3s ease, opacity 0.3s ease",
        }}
      >
        <MainApp />
      </div>

      {/* 详情页（从右侧滑入的覆盖层，避开标题栏） */}
      <div
        className="bg-white dark:bg-gray-900"
        style={{
          position: "absolute",
          top: 32,
          right: 0,
          bottom: 0,
          width: "100%",
          transform: store.isDetailOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          zIndex: 100,
        }}
      >
        {store.detailImageId && (
          <ImageDetail imageId={store.detailImageId} onClose={store.closeDetail} />
        )}
      </div>
    </div>
  );
}

export default App;
