import { useState, useRef, useCallback } from "react";
import { useGalleryStore, ViewMode, GalleryState } from "../stores/gallery";
import { SettingsDialog } from "./SettingsDialog";
import {
  SearchRegular,
  DismissRegular,
  ImageMultipleRegular,
  GridRegular,
  TextAlignJustifyRegular,
  ArrowSortRegular,
  ChevronUpRegular,
  ChevronDownRegular,
  ArrowCounterclockwiseRegular,
  SettingsRegular,
} from "@fluentui/react-icons";
import {
  Button,
  Input,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Tooltip,
} from "@fluentui/react-components";

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
  const isFiltering = store.isSearching || !!store.searchQuery || store.selectedTagIds.length > 0;
  const displayTotalCount = isFiltering ? store.images.length : (store.allImages.length || totalCount);
  const selectedCount = store.selectedIds.size;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 防抖搜索
  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
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
        <Input
          value={inputValue}
          onChange={(_e, data) => handleInputChange(data.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索图片..."
          contentBefore={<SearchRegular fontSize={20} className="text-gray-400 dark:text-gray-500" />}
          contentAfter={inputValue ? (
            <Button
              appearance="transparent"
              icon={<DismissRegular fontSize={20} />}
              onClick={handleClearSearch}
              size="medium"
            />
          ) : undefined}
          className="w-full"
        />
      </div>

      {/* 右侧工具栏 */}
      <div className="flex items-center gap-1">
        {/* 选择计数 */}
        {selectedCount > 0 ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm">
            <ImageMultipleRegular fontSize={20} />
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
          <Button
            appearance={viewMode === "justified" ? "primary" : "subtle"}
            icon={<TextAlignJustifyRegular fontSize={20} />}
            onClick={() => onViewModeChange("justified")}
            size="medium"
            className={viewMode === "justified" ? "shadow-sm" : ""}
          >
            水平
          </Button>
          <Button
            appearance={viewMode === "grid" ? "primary" : "subtle"}
            icon={<GridRegular fontSize={20} />}
            onClick={() => onViewModeChange("grid")}
            size="medium"
            className={viewMode === "grid" ? "shadow-sm" : ""}
          >
            网格
          </Button>
        </div>

        {/* 排序 */}
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button
              appearance="subtle"
              icon={<ArrowSortRegular fontSize={20} />}
              size="medium"
            >
              排序
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
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
                  <MenuItem
                    key={option.value}
                    onClick={() => {
                      if (isSelected) {
                        store.toggleSortOrder();
                      } else {
                        onSortChange(option.value);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{option.label}</span>
                      {isSelected && (
                        store.sortOrder === "asc" ? (
                          <ChevronUpRegular fontSize={20} className="flex-shrink-0" />
                        ) : (
                          <ChevronDownRegular fontSize={20} className="flex-shrink-0" />
                        )
                      )}
                    </div>
                  </MenuItem>
                );
              })}
            </MenuList>
          </MenuPopover>
        </Menu>

        {/* 刷新 */}
        <Tooltip content="刷新" relationship="label">
          <Button
            appearance="subtle"
            icon={<ArrowCounterclockwiseRegular fontSize={20} />}
            onClick={onRefresh}
            size="medium"
          />
        </Tooltip>

        {/* 设置 */}
        <Tooltip content="设置" relationship="label">
          <Button
            appearance="subtle"
            icon={<SettingsRegular fontSize={20} />}
            onClick={() => setIsSettingsOpen(true)}
            size="medium"
          />
        </Tooltip>
      </div>

      {/* 设置弹窗 */}
      <SettingsDialog 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </div>
  );
}

export default Header;
