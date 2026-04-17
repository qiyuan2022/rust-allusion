import { useState, useRef, useCallback } from "react";
import { useGalleryStore, ViewMode, GalleryState } from "../stores/gallery";
import { fixImageDimensions } from "../api/locations";
import { SettingsDialog } from "./SettingsDialog";
import { Search, X, Images, LayoutGrid, AlignJustify, ArrowUpDown, ChevronUp, ChevronDown, RefreshCw, Settings } from "lucide-react";

interface HeaderProps {
  totalCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sortBy: GalleryState["sortBy"];
  onSortChange: (sort: GalleryState["sortBy"]) => void;
}

export function Header({
  totalCount,
  searchQuery,
  onSearchChange,
  onRefresh,
  viewMode,
  onViewModeChange,
  sortBy,
  onSortChange,
}: HeaderProps) {
  const store = useGalleryStore();
  // 计算显示的总数：搜索/筛选时显示当前 images 长度，否则显示 allImages 的总数
  const isFiltering = store.isSearching || !!store.searchQuery || store.selectedTagIds.length > 0;
  const displayTotalCount = isFiltering ? store.images.length : (store.allImages.length || totalCount);
  const selectedCount = store.selectedIds.size;
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 防抖搜索
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    
    // 清除之前的定时器
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    // 300ms 延迟后执行搜索
    searchTimeoutRef.current = setTimeout(() => {
      onSearchChange(value);
    }, 300);
  }, [onSearchChange]);

  // 立即搜索（回车时）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
      onSearchChange(inputValue);
    }
  }, [inputValue, onSearchChange]);

  // 清空搜索
  const handleClearSearch = useCallback(() => {
    setInputValue('');
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    onSearchChange('');
  }, [onSearchChange]);

  return (
    <div className="h-14 bg-white dark:bg-gray-900 border-b dark:border-gray-700 flex items-center px-4 gap-4">

      {/* 搜索框 - 占据主要位置 */}
      <div className="flex-1 max-w-2xl">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索图片..."
            className="w-full pl-10 pr-10 py-1.5 bg-gray-100 dark:bg-gray-800 border-0 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white dark:focus:bg-gray-700 transition-all"
          />
          {inputValue && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 右侧工具栏 */}
      <div className="flex items-center gap-1">
        {/* 选择计数 */}
        {selectedCount > 0 ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm">
            <Images className="w-4 h-4" />
            <span className="font-medium">{selectedCount}</span>
            <span className="text-primary-500 dark:text-primary-400">/</span>
            <span>{displayTotalCount}</span>
          </div>
        ) : (
          <span className="text-sm text-gray-500 dark:text-gray-400 px-3">{displayTotalCount} 张图片</span>
        )}

        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1" />

        {/* 视图切换 */}
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <ViewModeButton
            mode="justified"
            currentMode={viewMode}
            onClick={() => onViewModeChange("justified")}
            icon={
              <AlignJustify className="w-4 h-4" />
            }
            label="水平"
          />

          <ViewModeButton
            mode="grid"
            currentMode={viewMode}
            onClick={() => onViewModeChange("grid")}
            icon={
              <LayoutGrid className="w-4 h-4" />
            }
            label="网格"
          />
        </div>

        {/* 排序 */}
        <div className="relative">
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className="flex items-center gap-1 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-sm transition-colors"
          >
            <ArrowUpDown className="w-4 h-4" />
            <span>排序</span>
          </button>

          {showSortMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowSortMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-lg shadow-lg z-50 py-1">
                {(
                  [
                    { value: "modified_at", label: "修改时间" },
                    { value: "created_at", label: "创建时间" },
                    { value: "file_name", label: "文件名" },
                    { value: "file_size", label: "文件大小" },
                  ] as const
                ).map((option) => {
                  const isSelected = sortBy === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => {
                        if (isSelected) {
                          // 已选中则切换方向
                          store.toggleSortOrder();
                        } else {
                          // 未选中则切换字段
                          onSortChange(option.value);
                        }
                        setShowSortMenu(false);
                      }}
                      className={`w-full px-4 py-2 flex items-center justify-between text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        isSelected ? "text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20" : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      <span>{option.label}</span>
                      {isSelected && (
                        store.sortOrder === "asc" ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 刷新 */}
        <button
          onClick={onRefresh}
          className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="刷新"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* 修复图片尺寸 - 已隐藏 */}
        {/* <button
          onClick={async () => {
            try {
              const [fixed, total] = await fixImageDimensions();
              alert(`修复完成！已修复 ${fixed}/${total} 张图片的尺寸信息`);
              onRefresh?.();
            } catch (error) {
              alert("修复失败: " + error);
            }
          }}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
          title="修复图片尺寸"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button> */}

        {/* 设置 */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* 设置弹窗 - 固定定位覆盖层，不影响主页面渲染 */}
      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}

function ViewModeButton({
  mode,
  currentMode,
  onClick,
  icon,
  label,
}: {
  mode: ViewMode;
  currentMode: ViewMode;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  const isActive = mode === currentMode;
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all
        ${isActive
          ? "bg-white text-primary-600 shadow-sm"
          : "text-gray-500 hover:text-gray-700"
        }
      `}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default Header;
