import { useEffect, useCallback, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// 将 invoke 暴露到全局，方便在控制台调试
(window as any).tauriInvoke = invoke;

import { Layout } from "./components/Layout";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { Gallery } from "./components/Gallery";
import { ImageViewer } from "./components/ImageViewer";
import { ImageDetail } from "./pages/ImageDetail";
import { useGalleryStore } from "./stores/gallery";
import { Image, Tag, TagTreeNode, getAllTags, getTagTree, getAllImages, getImagesBatch } from "./api/tags";
import { searchImages, getSearchIndexStatus, rebuildSearchIndex } from "./api/search";
import { 
  Location, 
  getAllLocations, 
  deleteLocation as deleteLocationApi,
} from "./api/locations";

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
  const BATCH_SIZE = 500; // 每批加载500张
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
      
      // 如果少于1000张，一次性加载
      if (totalCount <= 1000) {
        const allImages = await getAllImages(store.sortBy, store.sortOrder);
        store.setAllImages(allImages);
        setLoadProgress({ loaded: allImages.length, total: totalCount });
      } else {
        // 分批加载（用于1万张以上）
        const allImages: Array<Image> = [];
        let offset = 0;
        
        // 先加载第一批（500张），让用户快速看到内容
        const firstBatch = await getImagesBatch(0, BATCH_SIZE, store.sortBy, store.sortOrder);
        allImages.push(...firstBatch);
        store.setAllImages([...allImages]); // 先显示第一批
        setLoadProgress({ loaded: firstBatch.length, total: totalCount });
        
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
      }
    } catch (error) {
      console.error("Failed to load all images:", error);
    } finally {
      store.setLoading(false);
      setIsLoading(false);
    }
  }, [store.sortBy, store.sortOrder]);

  // 【虚拟滚动】直接传递所有图片元数据给 Gallery
  // Gallery 内部通过 visibleRange 控制实际渲染数量
  useEffect(() => {
    if (store.allImages.length === 0) return;
    
    // 如果处于搜索模式，不要覆盖（搜索结果已由 handleSearch 设置）
    if (store.isSearching || store.searchQuery || store.selectedTagIds.length > 0) {
      return;
    }
    
    store.setImages(store.allImages);
  }, [store.allImages, store.isSearching, store.searchQuery, store.selectedTagIds]);

  // 【虚拟滚动】已废弃，由 Gallery 内部滚动处理
  // 保留此函数以兼容组件接口，但不再执行分页逻辑
  const loadMoreImages = useCallback(() => {
    // 虚拟滚动模式下无需手动加载更多
    // Gallery 组件会根据滚动位置自动渲染可见区域
  }, []);

  // 刷新图片（排序变化时）
  const loadImages = useCallback(async () => {
    // 清空现有数据，重新加载
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

  // 排序变化时重新加载
  useEffect(() => {
    // 跳过初始渲染（当allImages为空时）
    if (store.allImages.length === 0 && !store.isLoading) return;
    
    // 清空数据并重新加载
    loadImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.sortBy, store.sortOrder]);

  // 标签选择变化时触发搜索
  useEffect(() => {
    // 跳过初始渲染
    if (store.allImages.length === 0) return;
    
    // 如果有选中的标签，执行搜索
    if (store.selectedTagIds.length > 0) {
      handleSearch(store.searchQuery);
    } else {
      // 取消当前未完成的搜索（通过 token）
      activeSearchToken.current += 1;
      
      // 清空标签选择时，也清空搜索状态
      store.clearSearch();

      // 恢复为全部已加载的图片（以满足用户期望看到全部计数）
      const restored = store.allImages.slice();
      store.setImages(restored);
      // 重置页码到第一页
      store.setCurrentPage(0);

      
      // 清空本地快照
      prevVisibleImages.current = null;
      prevCurrentPage.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.selectedTagIds]);

  // 搜索处理
  const handleSearch = useCallback(
    async (query: string) => {
      // 生成本次搜索的 token，用于识别并丢弃被取消/过时的搜索结果
      activeSearchToken.current += 1;
      const token = activeSearchToken.current;

      // 保存当前可见图片和页码，以便取消搜索时恢复
      prevVisibleImages.current = store.images.slice();
      prevCurrentPage.current = store.currentPage;

      store.setSearchQuery(query);
      
      if (!query && store.selectedTagIds.length === 0) {
        // 清空搜索，显示所有图片
        store.clearSearch();
        store.setImages(store.allImages);
        return;
      }

      // 如果图片还未加载完成，提示用户
      if (store.allImages.length === 0) {
        
        return;
      }

      try {
        store.setLoading(true);
        console.log("Searching with query:", query, "tag_ids:", store.selectedTagIds);
        const results = await searchImages({
          text: query,
          tag_ids: store.selectedTagIds || [],
          exclude_tag_ids: [],
          limit: 1000, // 搜索最多返回1000条
          offset: 0,
        });
        // 如果 token 已被更新，说明本次搜索已被取消或有更新的搜索，忽略当前结果
        if (token !== activeSearchToken.current) {
          return;
        }

        // 存储搜索结果ID
        store.setSearchResults(results);
        
        // 从allImages中过滤出搜索结果
        const resultIds = new Set(results.hits.map((h: { image_id: number }) => String(h.image_id)));
        
        
        const filtered = store.allImages.filter((img) => {
          const match = resultIds.has(String(img.id));
          if (match) {
          
          }
          return match;
        });
        
        
        
        // 如果搜索有结果但过滤后为0，说明索引和数据库不同步
        if (results.hits.length > 0 && filtered.length === 0) {
          console.warn("Search index out of sync with database. Consider rebuilding index.");
          setShowRebuildIndexPrompt(true);
        }
        
        // 显示过滤后的图片（虚拟滚动会处理渲染）
        store.setImages(filtered);
        store.setCurrentPage(0);
        // 使用全局 getState 读取最新状态，确保获取到已更新的值
        
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
      // 重新执行搜索
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
      // 重新加载图片列表，因为删除位置会删除相关图片
      await loadImages();
      // 关闭弹窗
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
      sortBy={store.sortBy}
      onSortChange={store.setSortBy}
    />
  );

  // 侧边栏组件
  const SidebarComponent = (
    <Sidebar
      locations={locations}
      tagTree={tagTree}
      selectedLocationId={selectedLocationId}
      selectedTagId={
        store.selectedTagIds.length === 1 ? store.selectedTagIds[0] : null
      }
      selectedTagIds={store.selectedTagIds}
      onSelectLocation={(location) => {
        setSelectedLocationId(location.id);
        // TODO: 根据位置筛选图片
      }}
      onSelectTag={(tag, isCtrlClick) => {
        
        if (isCtrlClick) {
          // Ctrl+点击：多选模式
          store.toggleTagSelection(tag.id);
          
        } else {
          // 普通点击：单选模式
          if (store.selectedTagIds.length === 1 && store.selectedTagIds[0] === tag.id) {
            // 再次点击已选中的标签：取消选择
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
        availableTags={availableTags}
      />
      <ImageViewer />
    </>
  );

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 dark:border-gray-700 border-t-primary-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">加载中...</p>
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
      />
      
      {/* 删除位置确认弹窗 */}
      {deleteLocationDialog.isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[400px]">
            {/* 标题 */}
            <div className="px-4 py-3 border-b dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">确认删除位置</h3>
            </div>

            {/* 内容 */}
            <div className="p-4">
              <p className="text-gray-600 dark:text-gray-300">
                确定要删除位置 <span className="font-medium text-gray-900 dark:text-gray-100">"{deleteLocationDialog.locationName}"</span> 吗？
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                删除位置将同时删除该位置下的所有图片记录（标签关联会保留）。
              </p>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setDeleteLocationDialog({ isOpen: false, locationId: null, locationName: "" })}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteLocation}
                className="px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600 rounded-lg transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 搜索索引重建提示 */}
      {showRebuildIndexPrompt && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[420px]">
            {/* 标题 */}
            <div className="px-4 py-3 border-b dark:border-gray-700">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">搜索索引需要重建</h3>
            </div>

            {/* 内容 */}
            <div className="p-4">
              <p className="text-gray-600 dark:text-gray-300">
                检测到搜索索引与数据库不同步，可能导致搜索结果无法显示。
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                建议重建搜索索引以修复此问题。重建过程可能需要一些时间，取决于图片数量。
              </p>
            </div>

            {/* 底部按钮 */}
            <div className="px-4 py-3 border-t dark:border-gray-700 flex justify-end gap-2">
              <button
                onClick={() => setShowRebuildIndexPrompt(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                disabled={isRebuildingIndex}
              >
                稍后再说
              </button>
              <button
                onClick={handleRebuildIndex}
                disabled={isRebuildingIndex}
                className="px-4 py-2 text-sm bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isRebuildingIndex && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {isRebuildingIndex ? "重建中..." : "重建索引"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function App() {
  const store = useGalleryStore();

  return (
    <div style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      {/* 主应用界面（始终挂载，保持状态） */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: store.isDetailOpen ? "translateX(-20px)" : "translateX(0)",
          opacity: store.isDetailOpen ? 0.5 : 1,
          transition: "transform 0.3s ease, opacity 0.3s ease",
          pointerEvents: store.isDetailOpen ? "none" : "auto",
        }}
      >
        <MainApp />
      </div>

      {/* 详情页（从右侧滑入的覆盖层） */}
      <div
        className="bg-white dark:bg-gray-900"
        style={{
          position: "absolute",
          top: 0,
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
