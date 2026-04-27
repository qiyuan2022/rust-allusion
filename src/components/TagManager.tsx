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
import { Button, Input, Dropdown, Option, Text, Tooltip } from "@fluentui/react-components";

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
  const [parentTagId, setParentTagId] = useState<string>("");
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const tree = await getTagTree();
      setTagTree(tree);
      // 收集所有标签用于父标签选择
      const tags: Tag[] = [];
      const collectTags = (nodes: TagTreeNode[]) => {
        nodes.forEach((node) => {
          tags.push({
            id: node.id,
            name: node.name,
            color: node.color,
            parent_id: node.parent_id,
            created_at: 0,
            updated_at: 0,
          });
          collectTags(node.children);
        });
      };
      collectTags(tree);
      setAllTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTag({
        name: newTagName.trim(),
        color: selectedColor,
        parent_id: parentTagId ? Number(parentTagId) : undefined,
      });
      setNewTagName("");
      setIsCreating(false);
      setSelectedColor(getRandomTagColor());
      setParentTagId("");
      loadTags();
    } catch (error) {
      console.error("Failed to create tag:", error);
      alert("创建标签失败: " + error);
    }
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !newTagName.trim()) return;
    try {
      await updateTag(editingTag.id, {
        name: newTagName.trim(),
        color: selectedColor,
        parent_id: parentTagId ? Number(parentTagId) : undefined,
      });
      setEditingTag(null);
      setNewTagName("");
      setSelectedColor(getRandomTagColor());
      setParentTagId("");
      loadTags();
    } catch (error) {
      console.error("Failed to update tag:", error);
      alert("更新标签失败: " + error);
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!confirm("确定要删除这个标签吗？")) return;
    try {
      await deleteTag(tagId);
      loadTags();
    } catch (error) {
      console.error("Failed to delete tag:", error);
      alert("删除标签失败: " + error);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingTag(tag);
    setNewTagName(tag.name);
    setSelectedColor(tag.color);
    setParentTagId(tag.parent_id ? String(tag.parent_id) : "");
    setIsCreating(true);
  };

  const cancelEdit = () => {
    setEditingTag(null);
    setNewTagName("");
    setSelectedColor(getRandomTagColor());
    setParentTagId("");
    setIsCreating(false);
  };

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <Text>加载中...</Text>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <Text weight="semibold" size={500}>
          标签管理
        </Text>
        <Button
          appearance="primary"
          onClick={() => setIsCreating(true)}
          disabled={isCreating}
          size="small"
        >
          新建标签
        </Button>
      </div>

      {isCreating && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <Text weight="semibold" className="block mb-3">
            {editingTag ? "编辑标签" : "新建标签"}
          </Text>

          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="标签名称"
            className="w-full mb-3"
          />

          <Dropdown
            value={parentTagId}
            onOptionSelect={(_, data) => setParentTagId(data.optionValue as string)}
            placeholder="选择父标签（可选）"
            className="w-full mb-3"
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
              <Tooltip key={color.value} content={color.name} relationship="label">
                <button
                  onClick={() => setSelectedColor(color.value)}
                  className={`w-6 h-6 rounded-full border-2 ${
                    selectedColor === color.value
                      ? "border-gray-800"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                />
              </Tooltip>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              appearance="primary"
              onClick={editingTag ? handleUpdateTag : handleCreateTag}
              disabled={!newTagName.trim()}
              size="small"
            >
              {editingTag ? "更新" : "创建"}
            </Button>
            <Button
              appearance="secondary"
              onClick={cancelEdit}
              size="small"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 标签树 */}
      <TagTree
        nodes={tagTree}
        selectedTagId={selectedTagId}
        onSelectTag={(tag) => onTagSelect?.(tag)}
        onTagMoved={loadTags}
        onTagDeleted={loadTags}
        draggable={true}
      />
    </div>
  );
}

export default TagManager;
