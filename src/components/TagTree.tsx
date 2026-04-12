import { useState, useCallback } from "react";
import { TagTreeNode, Tag, moveTag, deleteTag } from "../api/tags";
import { ChevronRight, X } from "lucide-react";

interface TagTreeProps {
  nodes: TagTreeNode[];
  selectedTagId?: number | null;
  selectedTagIds?: number[];  // 多选标签ID列表
  onSelectTag?: (tag: Tag, isCtrlClick?: boolean) => void;
  onTagMoved?: () => void;
  onTagDeleted?: () => void;
  draggable?: boolean;
  className?: string;
}

interface TagTreeItemProps {
  node: TagTreeNode;
  level: number;
  selectedTagId?: number | null;
  selectedTagIds?: number[];
  onSelectTag?: (tag: Tag, isCtrlClick?: boolean) => void;
  onTagMoved?: () => void;
  onTagDeleted?: () => void;
  draggable?: boolean;
  expandedTags: Set<number>;
  onToggleExpand: (tagId: number) => void;
  dragState: {
    draggedId: number | null;
    dropTargetId: number | null;
  };
  setDragState: React.Dispatch<
    React.SetStateAction<{
      draggedId: number | null;
      dropTargetId: number | null;
    }>
  >;
}

function TagTreeItem({
  node,
  level,
  selectedTagId,
  selectedTagIds,
  onSelectTag,
  onTagMoved,
  onTagDeleted,
  draggable,
  expandedTags,
  onToggleExpand,
  dragState,
  setDragState,
}: TagTreeItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedTags.has(node.id);
  // 支持单选和多选两种模式
  const isSelected = selectedTagIds 
    ? selectedTagIds.includes(node.id)
    : selectedTagId === node.id;
  const isDropTarget = dragState.dropTargetId === node.id;
  const isDragging = dragState.draggedId === node.id;

  const handleDragStart = (e: React.DragEvent) => {
    if (!draggable) return;
    e.dataTransfer.setData("tagId", node.id.toString());
    setDragState((prev) => ({ ...prev, draggedId: node.id }));
  };

  const handleDragEnd = () => {
    setDragState({ draggedId: null, dropTargetId: null });
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!draggable) return;
    e.preventDefault();
    if (dragState.draggedId !== node.id) {
      setDragState((prev) => ({ ...prev, dropTargetId: node.id }));
    }
  };

  const handleDragLeave = () => {
    setDragState((prev) => ({ ...prev, dropTargetId: null }));
  };

  const handleDrop = async (e: React.DragEvent) => {
    if (!draggable) return;
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData("tagId"));
    
    if (draggedId !== node.id) {
      try {
        await moveTag(draggedId, node.id);
        onTagMoved?.();
      } catch (error) {
        console.error("Failed to move tag:", error);
      }
    }
    setDragState({ draggedId: null, dropTargetId: null });
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`确定要删除标签 "${node.name}" 吗？`)) {
      try {
        await deleteTag(node.id);
        onTagDeleted?.();
      } catch (error) {
        console.error("Failed to delete tag:", error);
      }
    }
  };

  return (
    <div>
      <div
        className={`
          flex items-center justify-between py-2 px-3 rounded-lg cursor-pointer
          transition-colors duration-150
          ${isSelected ? "bg-primary-100" : "hover:bg-gray-100"}
          ${isDropTarget ? "bg-primary-50 border-2 border-primary-300" : ""}
          ${isDragging ? "opacity-50" : ""}
        `}
        style={{ paddingLeft: `${level * 16 + 12}px` }}
        onClick={(e) => onSelectTag?.(node, e.ctrlKey || e.metaKey)}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200"
            >
              <ChevronRight
                className={`w-3 h-3 transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            </button>
          ) : (
            <span className="w-5" />
          )}
          
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: node.color }}
          />
          
          <span className="font-medium truncate">{node.name}</span>
          
          <span className="text-xs text-gray-500 flex-shrink-0">
            ({node.image_count})
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDelete}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="删除标签"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TagTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedTagId={selectedTagId}
              selectedTagIds={selectedTagIds}
              onSelectTag={onSelectTag}
              onTagMoved={onTagMoved}
              onTagDeleted={onTagDeleted}
              draggable={draggable}
              expandedTags={expandedTags}
              onToggleExpand={onToggleExpand}
              dragState={dragState}
              setDragState={setDragState}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TagTree({
  nodes,
  selectedTagId,
  selectedTagIds,
  onSelectTag,
  onTagMoved,
  onTagDeleted,
  draggable = true,
  className = "",
}: TagTreeProps) {
  const [expandedTags, setExpandedTags] = useState<Set<number>>(new Set());
  const [dragState, setDragState] = useState<{
    draggedId: number | null;
    dropTargetId: number | null;
  }>({ draggedId: null, dropTargetId: null });

  // 过滤标签树，只保留有文件关联的标签
  const filterTagTree = useCallback((nodes: TagTreeNode[]): TagTreeNode[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: filterTagTree(node.children),
      }))
      .filter((node) => node.image_count > 0 || node.children.length > 0);
  }, []);

  const filteredNodes = filterTagTree(nodes);

  const handleToggleExpand = useCallback((tagId: number) => {
    setExpandedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set<number>();
    const collectIds = (nodes: TagTreeNode[]) => {
      nodes.forEach((node) => {
        allIds.add(node.id);
        if (node.children.length > 0) {
          collectIds(node.children);
        }
      });
    };
    collectIds(filteredNodes);
    setExpandedTags(allIds);
  }, [filteredNodes]);

  const collapseAll = useCallback(() => {
    setExpandedTags(new Set());
  }, []);

  if (filteredNodes.length === 0) {
    return (
      <div className={`p-4 text-center text-gray-500 ${className}`}>
        暂无标签
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex justify-end gap-2 mb-2 px-2">
        <button
          onClick={expandAll}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          展开全部
        </button>
        <button
          onClick={collapseAll}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          收起全部
        </button>
      </div>
      
      <div className="space-y-1">
        {filteredNodes.map((node) => (
          <TagTreeItem
            key={node.id}
            node={node}
            level={0}
            selectedTagId={selectedTagId}
            selectedTagIds={selectedTagIds}
            onSelectTag={onSelectTag}
            onTagMoved={onTagMoved}
            onTagDeleted={onTagDeleted}
            draggable={draggable}
            expandedTags={expandedTags}
            onToggleExpand={handleToggleExpand}
            dragState={dragState}
            setDragState={setDragState}
          />
        ))}
      </div>
    </div>
  );
}

export default TagTree;
