import { useState } from "react";
import { TagTreeNode, Tag } from "../api/tags";
import { TagTree } from "./TagTree";
import { Folder, ChevronDown, ChevronRight, Plus, FolderOpen, RefreshCw, X, Tag as TagIcon } from "lucide-react";

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
  onScanLocation,
  onDeleteLocation,
  onTagMoved,
  onTagDeleted,
  className = "",
}: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState({
    locations: true,
    tags: true,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <div className={`h-full flex flex-col bg-white ${className}`}>
      {/* Locations Section */}
      <div className="border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => toggleSection("locations")}
            className="flex items-center gap-2 flex-1 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="font-medium text-gray-700 flex items-center gap-2">
              <Folder className="w-4 h-4" />
              位置
              <span className="text-xs text-gray-400 font-normal">({locations.length})</span>
            </span>
            {expandedSections.locations ? (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-400" />
            )}
          </button>
          
          {/* 添加位置按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddLocation?.();
            }}
            className="ml-2 p-1.5 text-gray-400 hover:text-primary-500 hover:bg-primary-50 rounded transition-colors"
            title="添加位置"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {expandedSections.locations && (
          <div className="px-2 pb-2">
            {locations.length === 0 ? (
              <p className="px-4 py-2 text-sm text-gray-400">暂无位置</p>
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
                          ? "bg-primary-50 text-primary-700"
                          : "hover:bg-gray-100 text-gray-600"
                        }
                      `}
                      onClick={() => onSelectLocation?.(location)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FolderOpen className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate flex-1">{location.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">{location.image_count}</span>
                        
                        {/* 扫描按钮 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onScanLocation?.(location.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-primary-500"
                          title="扫描图片"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
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
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors border-b"
        >
          <span className="font-medium text-gray-700 flex items-center gap-2">
            <TagIcon className="w-4 h-4" />
            标签
          </span>
          {expandedSections.tags ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
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
  );
}

export default Sidebar;
