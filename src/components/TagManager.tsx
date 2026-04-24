import { useState, useEffect, useCallback } from "react";
import {
  Tag,
  TagTreeNode,
  getTagTree,
  createTag,
  updateTag,
  deleteTag,
  TAG_COLORS,
  getRandomTagColor,
} from "../api/tags";
import { TagTree } from "./TagTree";
import { Button, Input, Dropdown, Option, Text } from "@fluentui/react-components";

interface TagManagerProps {
  className?: string;
  onTagSelect?: (tag: Tag) => void;
  selectedTagId?: number | null;
}

export function TagManager({
  className = "",
  onTagSelect,
  selectedTagId,
}: TagManagerProps) {
  const [tagTree, setTagTree] = useState<TagTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(getRandomTagColor());
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const loadTagTree = useCallback(async () => {
    try {
      setLoading(true);
      const tree = await getTagTree();
      setTagTree(tree);
    } catch (error) {
      console.error("Failed to load tag tree:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTagTree();
  }, [loadTagTree]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      await createTag({
        name: newTagName.trim(),
        parent_id: selectedParentId ? parseInt(selectedParentId) : null,
        color: selectedColor,
      });
      
      setNewTagName("");
      setIsCreating(false);
      setSelectedParentId("");
      setSelectedColor(getRandomTagColor());
      await loadTagTree();
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTag.name.trim()) return;

    try {
      await updateTag(editingTag.id, {
        name: editingTag.name,
        color: editingTag.color,
      });
      
      setEditingTag(null);
      await loadTagTree();
    } catch (error) {
      console.error("Failed to update tag:", error);
    }
  };

  const flattenTags = (nodes: TagTreeNode[]): Tag[] => {
    const result: Tag[] = [];
    const traverse = (nodes: TagTreeNode[]) => {
      nodes.forEach((node) => {
        result.push(node);
        if (node.children.length > 0) {
          traverse(node.children);
        }
      });
    };
    traverse(nodes);
    return result;
  };

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-40 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const allTags = flattenTags(tagTree);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between p-3 border-b">
        <Text weight="semibold">标签管理</Text>
        <Button appearance="primary" size="small" onClick={() => setIsCreating(true)}>
          + 新建标签
        </Button>
      </div>

      {/* 创建标签表单 */}
      {isCreating && (
        <div className="p-3 border-b bg-gray-50">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="标签名称"
            className="w-full mb-2"
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
          />

          <Dropdown
            value={selectedParentId}
            onOptionSelect={(_e, data) => setSelectedParentId(data.optionValue as string)}
            className="w-full mb-2"
            placeholder="选择父标签（可选）"
          >
            <Option value="">无父标签（顶级标签）</Option>
            {allTags.map((tag) => (
              <Option key={tag.id} value={String(tag.id)}>
                {tag.name}
              </Option>
            ))}
          </Dropdown>

          <div className="flex flex-wrap gap-2 mb-3">
            {TAG_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => setSelectedColor(color.value)}
                className={`w-6 h-6 rounded-full border-2 ${
                  selectedColor === color.value
                    ? "border-gray-800"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              appearance="primary"
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              size="small"
            >
              创建
            </Button>
            <Button
              appearance="secondary"
              onClick={() => {
                setIsCreating(false);
                setNewTagName("");
                setSelectedParentId("");
              }}
              size="small"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 编辑标签表单 */}
      {editingTag && (
        <div className="p-3 border-b bg-primary-50">
          <Text weight="semibold" block style={{ marginBottom: "8px" }}>
            编辑标签
          </Text>
          
          <Input
            value={editingTag.name}
            onChange={(e) =>
              setEditingTag({ ...editingTag, name: e.target.value })
            }
            placeholder="标签名称"
            className="w-full mb-2"
          />

          <div className="flex flex-wrap gap-2 mb-3">
            {TAG_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() =>
                  setEditingTag({ ...editingTag, color: color.value })
                }
                className={`w-6 h-6 rounded-full border-2 ${
                  editingTag.color === color.value
                    ? "border-gray-800"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              appearance="primary"
              onClick={handleUpdateTag}
              disabled={!editingTag.name.trim()}
              size="small"
            >
              保存
            </Button>
            <Button
              appearance="secondary"
              onClick={() => setEditingTag(null)}
              size="small"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 标签树 */}
      <div className="flex-1 overflow-y-auto">
        <TagTree
          nodes={tagTree}
          selectedTagId={selectedTagId}
          onSelectTag={(tag) => {
            onTagSelect?.(tag);
            setEditingTag(tag);
          }}
          onTagMoved={loadTagTree}
          onTagDeleted={loadTagTree}
          draggable={true}
        />
      </div>

      {/* 统计信息 */}
      <div className="p-3 border-t text-xs text-gray-500">
        共 {allTags.length} 个标签
      </div>
    </div>
  );
}

export default TagManager;
