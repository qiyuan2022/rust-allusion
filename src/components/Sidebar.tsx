import { useState } from "react";
import { TagTreeNode, Tag } from "../api/tags";
import { TagTree } from "./TagTree";
import {
  FolderRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  AddRegular,
  FolderOpenRegular,
  ArrowCounterclockwiseRegular,
  DismissRegular,
  TagRegular,
  NavigationRegular,
} from "@fluentui/react-icons";
import { Button, Tooltip } from "@fluentui/react-components";
import { ImportProgress, scanLocationWithProgress, addLocationWithProgress } from "../api/locations";
import { ScanProgressDialog } from "./ScanProgressDialog";

interface Location {
  id: number;
  path: string;
  name: string;
  image_count: number;
}

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  locations: Location[];
  tagTree: TagTreeNode[];
  selectedLocationId?: number | null;
  selectedTagId?: number | null;
  selectedTagIds?: number[];
  onSelectLocation?: (location: Location) => void;
  onSelectTag?: (tag: Tag, isCtrlClick?: boolean) => void;
  onAddLocation?: () => void;
  onScanLocation?: (id: number) => void;
  onDeleteLocation?: (id: number) => void;
  onTagMoved?: () => void;
  onTagDeleted?: () => void;
  className?: string;
  onLocationsChange?: () => void;
}

export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  locations,
  tagTree,
  selectedLocationId,
  selectedTagId,
  selectedTagIds,
  onSelectLocation,
  onSelectTag,
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

  const handleScanLocation = async (locationId: number, locationName: string) => {
    if (isScanning) return;

    setIsScanning(true);
    setCurrentScanLocationId(locationId);
    setScanProgress(null);

    try {
      await scanLocationWithProgress(locationId, (progress) => {
        setScanProgress(progress);
      });

      onLocationsChange?.();
    } catch (error) {
      console.error("Failed to scan location:", error);
    } finally {
      setIsScanning(false);
      setCurrentScanLocationId(null);
    }
  };

  const handleAddLocation = async () => {
    if (isAddingLocation) return;

    setIsAddingLocation(true);
    setIsScanning(true);
    setScanProgress(null);

    try {
      const { location } = await addLocationWithProgress((progress) => {
        setScanProgress(progress);
      });

      if (location) {
        onLocationsChange?.();
      }
    } catch (error) {
      console.error("Failed to add location:", error);
    } finally {
      setIsAddingLocation(false);
      setIsScanning(false);
    }
  };

  const handleCancelScan = () => {
    setIsScanning(false);
    setCurrentScanLocationId(null);
    setScanProgress(null);
    setIsAddingLocation(false);
    onLocationsChange?.();
  };

  const getScanTitle = () => {
    if (isAddingLocation) {
      return "添加新位置";
    }
    const location = locations.find(l => l.id === currentScanLocationId);
    return location ? `扫描: ${location.name}` : "扫描文件夹";
  };

  // 折叠状态：只显示三个图标按钮
  if (collapsed) {
    return (
      <>
        <div className={`h-full flex flex-col bg-white dark:bg-gray-900 ${className}`}>
          <Tooltip content="展开侧边栏" relationship="label">
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center h-12 w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b dark:border-gray-700"
            >
              <NavigationRegular fontSize={24} />
            </button>
          </Tooltip>
          <Tooltip content="位置" relationship="label">
            <button
              onClick={() => {
                onToggleCollapse?.();
                setExpandedSections(prev => ({ ...prev, locations: true }));
              }}
              className="flex items-center justify-center h-12 w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b dark:border-gray-700"
            >
              <FolderRegular fontSize={24} />
            </button>
          </Tooltip>
          <Tooltip content="标签" relationship="label">
            <button
              onClick={() => {
                onToggleCollapse?.();
                setExpandedSections(prev => ({ ...prev, tags: true }));
              }}
              className="flex items-center justify-center h-12 w-full hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b dark:border-gray-700"
            >
              <TagRegular fontSize={24} />
            </button>
          </Tooltip>
        </div>

        <ScanProgressDialog
          isOpen={isScanning}
          title={getScanTitle()}
          progress={scanProgress}
          onCancel={handleCancelScan}
        />
      </>
    );
  }

  // 展开状态的内容也使用 opacity + translate 过渡，与收起状态平滑衔接
  const expandTransition = "transition-all duration-300 ease-in-out";

  return (
    <>
      <div className={`h-full flex flex-col bg-white dark:bg-gray-900 ${className}`}>
        {/* 收起侧边栏按钮 */}
        <div
          className={`flex items-center h-12 px-4 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer flex-shrink-0 ${expandTransition}`}
          onClick={onToggleCollapse}
        >
          <NavigationRegular fontSize={24} />
        </div>

        {/* 位置区块 */}
        <div className={`flex flex-col ${expandTransition}`}>
          <div
            className={`flex items-center h-12 px-4 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${expandTransition}`}
            onClick={() => toggleSection("locations")}
          >
            <div className="flex items-center gap-2 flex-1">
              <FolderRegular fontSize={24} />
              <span className={`font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap ${expandTransition}`}>位置</span>
              <span className={`text-xs text-gray-400 dark:text-gray-500 font-normal whitespace-nowrap ${expandTransition}`}>({locations.length})</span>
            </div>

            <Tooltip content="添加位置" relationship="label">
              <Button
                appearance="transparent"
                icon={<AddRegular fontSize={24} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddLocation();
                }}
                disabled={isScanning}
                size="medium"
              />
            </Tooltip>
          </div>

          <div
            className={`overflow-hidden ${expandTransition}`}
            style={{ maxHeight: expandedSections.locations ? 800 : 0, opacity: expandedSections.locations ? 1 : 0 }}
          >
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
                          <FolderOpenRegular className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate flex-1">{location.name}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs text-gray-400 dark:text-gray-500">{location.image_count}</span>

                          <Tooltip content="扫描图片" relationship="label">
                            <Button
                              appearance="transparent"
                              icon={
                                <ArrowCounterclockwiseRegular
                                  className={`w-3.5 h-3.5 ${isScanning && currentScanLocationId === location.id ? 'animate-spin' : ''}`}
                                />
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handleScanLocation(location.id, location.name);
                              }}
                              disabled={isScanning}
                              size="small"
                              className="opacity-0 group-hover:opacity-100 !min-w-[20px] !px-0"
                            />
                          </Tooltip>

                          <Tooltip content="删除位置" relationship="label">
                            <Button
                              appearance="transparent"
                              icon={<DismissRegular className="w-3.5 h-3.5" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteLocation?.(location.id);
                              }}
                              size="small"
                              className="opacity-0 group-hover:opacity-100 !min-w-[20px] !px-0"
                            />
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 标签区块 */}
        <div className={`flex-1 overflow-hidden flex flex-col ${expandTransition}`}>
          <div
            className={`flex items-center h-12 px-4 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${expandTransition}`}
            onClick={() => toggleSection("tags")}
          >
            <div className="flex items-center gap-2 flex-1">
              <TagRegular fontSize={24} />
              <span className={`flex-1 font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap ${expandTransition}`}>标签</span>
            </div>
            {expandedSections.tags ? (
              <ChevronDownRegular fontSize={24} className="text-gray-400 dark:text-gray-500" />
            ) : (
              <ChevronRightRegular fontSize={24} className="text-gray-400 dark:text-gray-500" />
            )}
          </div>

          <div
            className={`overflow-hidden flex-1 ${expandTransition}`}
            style={{ maxHeight: expandedSections.tags ? 1200 : 0, opacity: expandedSections.tags ? 1 : 0 }}
          >
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
          </div>
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
