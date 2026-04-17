import { useState } from "react";
import { TagTreeNode, Tag } from "../api/tags";
import { TagTree } from "./TagTree";
import { Folder, ChevronDown, ChevronRight, Plus, FolderOpen, RefreshCw, X, Tag as TagIcon } from "lucide-react";
import { ImportProgress, scanLocationWithProgress, addLocationWithProgress } from "../api/locations";
import { ScanProgressDialog } from "./ScanProgressDialog";

interface Location {
  id: number;
  path: string;
  name: string;
  image_count: number;
}

interface SidebarProps {
  locations: Location[];
  tagTree: TagTreeNode[];
  selectedLocationId?: number | null;
  selectedTagId?: number | null;
  selectedTagIds?: number[];  // 多选标签ID列表
  onSelectLocation?: (location: Location) => void;
  onSelectTag?: (tag: Tag, isCtrlClick?: boolean) => void;
  onAddLocation?: () => void;
  onScanLocation?: (id: number) => void;
  onDeleteLocation?: (id: number) => void;
  onTagMoved?: () => void;
  onTagDeleted?: () => void;
  className?: string;
  onLocationsChange?: () => void; // 位置列表变化时刷新
}

export function Sidebar({
  locations,
  tagTree,
  selectedLocationId,
  selectedTagId,
  selectedTagIds,
  onSelectLocation,
  onSelectTag,
  onAddLocation,
  onDeleteLocation,
  onTagMoved,
  onTagDeleted,
  className = "",
  onLocationsChange,
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    locations: true,
    tags: true,
  });

  // 扫描进度相关状态
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ImportProgress | null>(null);
  const [currentScanLocationId, setCurrentScanLocationId] = useState<number | null>(null);
  const [isAddingLocation, setIsAddingLocation] = useState(false);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // 处理扫描位置（带进度）
  const handleScanLocation = async (locationId: number, locationName: string) => {
    if (isScanning) return;

    setIsScanning(true);
    setCurrentScanLocationId(locationId);
    setScanProgress(null);

    try {
      await scanLocationWithProgress(locationId, (progress) => {
        setScanProgress(progress);
      });

      // 扫描完成后刷新数据
      onLocationsChange?.();
    } catch (error) {
      console.error("Failed to scan location:", error);
    } finally {
      setIsScanning(false);
      setCurrentScanLocationId(null);
    }
  };

  // 处理添加位置（带进度）
  const handleAddLocation = async () => {
    if (isAddingLocation) return;

    setIsAddingLocation(true);
    setIsScanning(true);
    setScanProgress(null);

    try {
      const { location, result } = await addLocationWithProgress((progress) => {
        setScanProgress(progress);
      });

      if (location) {
        // 刷新位置列表
        onLocationsChange?.();
      }
    } catch (error) {
      console.error("Failed to add location:", error);
    } finally {
      setIsAddingLocation(false);
      setIsScanning(false);
    }
  };

  // 取消扫描
  const handleCancelScan = () => {
    // 关闭对话框，实际取消由前端断开连接实现
    // 由于 Tauri Channel 不支持显式取消，我们通过关闭对话框来表示
    setIsScanning(false);
    setCurrentScanLocationId(null);
    setScanProgress(null);
    setIsAddingLocation(false);
    
    // 刷新数据
    onLocationsChange?.();
  };

  // 获取当前扫描的标题
  const getScanTitle = () => {
    if (isAddingLocation) {
      return "添加新位置";
    }
    const location = locations.find(l => l.id === currentScanLocationId);
    return location ? `扫描: ${location.name}` : "扫描文件夹";
  };

  return (
    <>
      <div className={`h-full flex flex-col bg-white dark:bg-gray-900 ${className}`}>
        {/* Locations Section */}
        <div className="border-b dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => toggleSection("locations")}
              className="flex items-center gap-2 flex-1 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left rounded px-2 py-1 -ml-2"
            >
              <span className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
                <Folder className="w-4 h-4" />
                位置
                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({locations.length})</span>
              </span>
              {expandedSections.locations ? (
                <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              )}
            </button>
            
            {/* 添加位置按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddLocation();
              }}
              disabled={isScanning}
              className="ml-2 p-1.5 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="添加位置"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {expandedSections.locations && (
            <div className="px-2 pb-2">
              {locations.length === 0 ? (
                <p className="px-4 py-2 text-sm text-gray-400 dark:text-gray-500">暂无位置</p>
              ) : (
                <div className="space-y-1">
                  {locations.map((location) => (
                    <div
                      key={location.id}
                      className="group"
                    >
                      <div
                        className={`
                          flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm
                          transition-colors
                          ${selectedLocationId === location.id
                            ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300"
                            : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                          }
                        `}
                        onClick={() => onSelectLocation?.(location)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FolderOpen className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate flex-1">{location.name}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs text-gray-400 dark:text-gray-500">{location.image_count}</span>
                          
                          {/* 扫描按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScanLocation(location.id, location.name);
                            }}
                            disabled={isScanning}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="扫描图片"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isScanning && currentScanLocationId === location.id ? 'animate-spin' : ''}`} />
                          </button>
                          
                          {/* 删除按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteLocation?.(location.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500"
                            title="删除位置"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tags Section */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <button
            onClick={() => toggleSection("tags")}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b dark:border-gray-700"
          >
            <span className="font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <TagIcon className="w-4 h-4" />
              标签
            </span>
            {expandedSections.tags ? (
              <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            )}
          </button>

          {expandedSections.tags && (
            <div className="flex-1 overflow-y-auto px-2 py-2">
              <TagTree
                nodes={tagTree}
                selectedTagId={selectedTagId}
                selectedTagIds={selectedTagIds}
                onSelectTag={onSelectTag}
                onTagMoved={onTagMoved}
                onTagDeleted={onTagDeleted}
                draggable={true}
              />
            </div>
          )}
        </div>
      </div>

      {/* 扫描进度对话框 */}
      <ScanProgressDialog
        isOpen={isScanning}
        title={getScanTitle()}
        progress={scanProgress}
        onCancel={handleCancelScan}
      />
    </>
  );
}

export default Sidebar;
