import { useState, useRef, useCallback } from "react";
import { useGalleryStore, ViewMode, ViewSize, GalleryState } from "../stores/gallery";
import { useTagging } from "../hooks/useTagging";
import { SettingsDialog } from "./SettingsDialog";
import { TagSelectDialog } from "./TagSelectDialog";
import { Tag } from "../api/tags";
import {
  SearchRegular,
  DismissRegular,
  ImageMultipleRegular,
  GridRegular,
  TextAlignJustifyRegular,
  CheckmarkRegular,
  ArrowSortRegular,
  ChevronUpRegular,
  ChevronDownRegular,
  ArrowCounterclockwiseRegular,
  SettingsRegular,
  ZoomInRegular,
  ZoomOutRegular,
  ZoomFitRegular,
  TagMultipleRegular,
} from "@fluentui/react-icons";
import {
  Button,
  Input,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  MenuDivider,
  Tooltip,
} from "@fluentui/react-components";

interface HeaderProps {
  totalCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onRefresh?: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  viewSize: ViewSize;
  onViewSizeChange: (size: ViewSize) => void;
  sortBy: GalleryState["sortBy"];
  onSortChange: (sort: GalleryState["sortBy"]) => void;
  availableTags?: Tag[];
  onSidebarRefresh?: () => void;
}

export function Header({
  totalCount,
  searchQuery,
  onSearchChange,
  onRefresh,
  viewMode,
  onViewModeChange,
  viewSize,
  onViewSizeChange,
  sortBy,
  onSortChange,
  availableTags = [],
  onSidebarRefresh,
}: HeaderProps) {
  const store = useGalleryStore();
  const isFiltering = store.isSearching || !!store.searchQuery || store.selectedTagIds.length > 0;
  const displayTotalCount = isFiltering ? store.images.length : (store.allImages.length || totalCount);
  const selectedCount = store.selectedIds.size;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { tagSelectorOpen, initialTagIds, openTagDialog, handleTagConfirm, closeTagDialog, selectedCount: taggingSelectedCount } = useTagging(availableTags, onSidebarRefresh);
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
    <div className="h-14 bg-white dark:bg-gray-900 border-b dark:border-gray-700 flex items-center px-3 gap-3">

      {/* 搜索框 - 占据主要位置 */}
      <div className="flex-1 min-w-0">
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

      {/* 选择计数 */}
      {selectedCount > 0 ? (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-lg text-sm">
          <ImageMultipleRegular fontSize={20} />
          <span className="font-medium">{selectedCount}</span>
          <span className="text-primary-500 dark:text-primary-400">/</span>
          <span>{displayTotalCount}</span>
        </div>
      ) : (
        <span className="text-sm text-gray-500 dark:text-gray-400 h-8 inline-flex items-center px-3">{displayTotalCount} 张图片</span>
      )}

      <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />

      {/* 图标按钮组 — 右对齐 */}
      <div className="flex items-center gap-1 ml-auto">
        {/* 视图+尺寸切换 */}
        <Menu positioning={{ position: 'below', align: 'end' }}>
          <MenuTrigger disableButtonEnhancement>
            <Tooltip content="视图" relationship="label" positioning="below">
              <Button
                appearance="subtle"
                icon={
                  viewMode === "justified" ? (
                    <TextAlignJustifyRegular fontSize={20} />
                  ) : (
                    <GridRegular fontSize={20} />
                  )
                }
                size="medium"
              />
            </Tooltip>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem
                icon={<TextAlignJustifyRegular fontSize={16} />}
                onClick={() => onViewModeChange("justified")}
              >
                <div className="flex items-center justify-between w-full gap-4">
                  <span>水平</span>
                  {viewMode === "justified" && (
                    <CheckmarkRegular fontSize={16} className="flex-shrink-0" />
                  )}
                </div>
              </MenuItem>
              <MenuItem
                icon={<GridRegular fontSize={16} />}
                onClick={() => onViewModeChange("grid")}
              >
                <div className="flex items-center justify-between w-full gap-4">
                  <span>网格</span>
                  {viewMode === "grid" && (
                    <CheckmarkRegular fontSize={16} className="flex-shrink-0" />
                  )}
                </div>
              </MenuItem>
              <MenuDivider />
              {(
                [
                  { value: "small" as ViewSize, label: "小", icon: <ZoomOutRegular fontSize={16} /> },
                  { value: "medium" as ViewSize, label: "中", icon: <ZoomFitRegular fontSize={16} /> },
                  { value: "large" as ViewSize, label: "大", icon: <ZoomInRegular fontSize={16} /> },
                ] as const
              ).map((option) => (
                <MenuItem
                  key={option.value}
                  // icon={option.icon}
                  onClick={() => onViewSizeChange(option.value)}
                >
                  <div className="flex items-center justify-between w-full gap-4">
                    <span>{option.label}</span>
                    {viewSize === option.value && (
                      <CheckmarkRegular fontSize={16} className="flex-shrink-0" />
                    )}
                  </div>
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>

        {/* 排序 */}
        <Menu positioning={{ position: 'below', align: 'end' }}>
          <MenuTrigger disableButtonEnhancement>
            <Tooltip content="排序" relationship="label" positioning="below">
              <Button
                appearance="subtle"
                icon={<ArrowSortRegular fontSize={20} />}
                size="medium"
              />
            </Tooltip>
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

        {/* 打标签 */}
        {selectedCount > 0 && (
          <Tooltip content={`给 ${selectedCount} 张图片打标签`} relationship="label" positioning="below">
            <Button
              appearance="subtle"
              icon={<TagMultipleRegular fontSize={20} />}
              onClick={openTagDialog}
              size="medium"
            />
          </Tooltip>
        )}

        {/* 刷新 */}
        <Tooltip content="刷新" relationship="label" positioning="below">
          <Button
            appearance="subtle"
            icon={<ArrowCounterclockwiseRegular fontSize={20} />}
            onClick={onRefresh}
            size="medium"
          />
        </Tooltip>

        {/* 设置 */}
        <Tooltip content="设置" relationship="label" positioning="below">
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

      {/* 标签选择弹窗 */}
      <TagSelectDialog
        isOpen={tagSelectorOpen}
        onClose={closeTagDialog}
        onConfirm={handleTagConfirm}
        availableTags={availableTags}
        selectedTagIds={initialTagIds}
        imageCount={taggingSelectedCount}
      />
    </div>
  );
}

export default Header;
