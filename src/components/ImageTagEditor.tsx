import { DismissRegular } from "@fluentui/react-icons";
import { useState, useEffect, useCallback } from "react";
import {
  Button,
  Input,
  Text,
} from "@fluentui/react-components";
import {
  Tag,
  getAllTags,
  getImageTags,
  addTagsToImage,
  removeTagsFromImage,
  TAG_COLORS,
  getRandomTagColor,
  createTag,
} from "../api/tags";

interface ImageTagEditorProps {
  imageId: number;
  imagePath?: string;
  className?: string;
  onTagsChanged?: () => void;
}

export function ImageTagEditor({
  imageId,
  className = "",
  onTagsChanged,
}: ImageTagEditorProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [imageTags, setImageTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(TAG_COLORS[0].value);

  const loadTags = useCallback(async () => {
    try {
      setLoading(true);
      const [all, image] = await Promise.all([
        getAllTags(),
        getImageTags(imageId),
      ]);
      setAllTags(all);
      setImageTags(image);
    } catch (error) {
      console.error("Failed to load tags:", error);
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleAddTag = async (tagId: number) => {
    try {
      await addTagsToImage(imageId, [tagId]);
      await loadTags();
      onTagsChanged?.();
    } catch (error) {
      console.error("Failed to add tag:", error);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      await removeTagsFromImage(imageId, [tagId]);
      await loadTags();
      onTagsChanged?.();
    } catch (error) {
      console.error("Failed to remove tag:", error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const newTag = await createTag({
        name: newTagName.trim(),
        color: selectedColor,
      });
      
      // 自动添加到当前图片
      await addTagsToImage(imageId, [newTag.id]);
      
      setNewTagName("");
      setIsCreating(false);
      setSelectedColor(getRandomTagColor());
      await loadTags();
      onTagsChanged?.();
    } catch (error) {
      console.error("Failed to create tag:", error);
    }
  };

  const filteredTags = allTags.filter(
    (tag) =>
      tag.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !imageTags.some((it) => it.id === tag.id)
  );

  if (loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      {/* 当前标签 */}
      <div className="mb-4">
        <Text weight="semibold" block style={{ marginBottom: "8px" }}>
          已添加标签
        </Text>
        {imageTags.length === 0 ? (
          <p className="text-sm text-gray-400">暂无标签</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {imageTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                }}
              >
                {tag.name}
                <Button
                  appearance="transparent"
                  icon={<DismissRegular fontSize={12} />}
                  onClick={() => handleRemoveTag(tag.id)}
                  size="small"
                  style={{ minWidth: "auto", padding: "2px", color: tag.color }}
                />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 搜索和添加 */}
      <div className="mb-4">
        <Text weight="semibold" block style={{ marginBottom: "8px" }}>
          添加标签
        </Text>
        
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="搜索标签..."
          className="w-full mb-2"
        />

        {searchQuery && filteredTags.length > 0 && (
          <div className="border rounded-lg max-h-40 overflow-y-auto mb-2">
            {filteredTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => handleAddTag(tag.id)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left"
              >
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span>{tag.name}</span>
              </button>
            ))}
          </div>
        )}

        {searchQuery && filteredTags.length === 0 && !isCreating && (
          <div className="text-sm text-gray-500 mb-2">
            未找到标签
            <Button
              appearance="transparent"
              onClick={() => {
                setNewTagName(searchQuery);
                setIsCreating(true);
              }}
              size="small"
            >
              创建 "{searchQuery}"
            </Button>
          </div>
        )}
      </div>

      {/* 创建新标签 */}
      {isCreating && (
        <div className="border rounded-lg p-3 bg-gray-50">
          <Text weight="semibold" block style={{ marginBottom: "8px" }}>
            创建新标签
          </Text>
          
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="标签名称"
            className="w-full mb-2"
            onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
          />

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
              创建并添加
            </Button>
            <Button
              appearance="secondary"
              onClick={() => {
                setIsCreating(false);
                setNewTagName("");
              }}
              size="small"
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* 快速添加常用标签 */}
      {!searchQuery && allTags.length > 0 && (
        <div>
          <Text weight="semibold" block style={{ marginBottom: "8px" }}>
            快速添加
          </Text>
          <div className="flex flex-wrap gap-2">
            {allTags
              .filter((tag) => !imageTags.some((it) => it.id === tag.id))
              .slice(0, 10)
              .map((tag) => (
                <Button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  size="small"
                  appearance="outline"
                  style={{
                    borderColor: tag.color,
                    color: tag.color,
                  }}
                >
                  + {tag.name}
                </Button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ImageTagEditor;
