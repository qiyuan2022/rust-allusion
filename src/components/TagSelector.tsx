import { useState, useEffect, KeyboardEvent } from "react";
import { Tag } from "../api/tags";
import { Plus, X, Check } from "lucide-react";

interface TagSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tagIds: number[], newTagNames: string[]) => void;
  availableTags: Tag[];
  selectedTagIds: number[];
  imageCount: number;
}

export function TagSelector({
  isOpen,
  onClose,
  onConfirm,
  availableTags,
  selectedTagIds,
  imageCount,
}: TagSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>(selectedTagIds);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTagNames, setNewTagNames] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(selectedTagIds);
      setSearchQuery("");
      setNewTagNames([]);
    }
  }, [selectedTagIds, isOpen]);

  if (!isOpen) return null;

  // 过滤现有标签
  const filteredTags = availableTags.filter((tag) =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // 检查搜索词是否是新标签
  const searchTerm = searchQuery.trim();
  const isNewTag =
    searchTerm &&
    !availableTags.some(
      (tag) => tag.name.toLowerCase() === searchTerm.toLowerCase()
    ) &&
    !newTagNames.includes(searchTerm);

  const toggleTag = (tagId: number) => {
    setSelectedIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const addNewTag = (name: string) => {
    if (name && !newTagNames.includes(name)) {
      setNewTagNames((prev) => [...prev, name]);
      setSearchQuery("");
    }
  };

  const removeNewTag = (name: string) => {
    setNewTagNames((prev) => prev.filter((n) => n !== name));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && isNewTag) {
      e.preventDefault();
      addNewTag(searchTerm);
    }
  };

  const handleConfirm = () => {
    onConfirm(selectedIds, newTagNames);
  };

  const totalSelected = selectedIds.length + newTagNames.length;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-lg shadow-xl w-[450px] max-h-[80vh] flex flex-col">
        {/* 标题 */}
        <div className="px-4 py-3 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            给 {imageCount} 张图片打标签
          </h3>
        </div>

        {/* 搜索 */}
        <div className="px-4 py-2 border-b">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索标签，或输入新标签名按回车创建..."
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoFocus
          />
        </div>

        {/* 新标签提示 */}
        {isNewTag && (
          <div className="px-4 py-2 bg-blue-50 border-b">
            <button
              onClick={() => addNewTag(searchTerm)}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              创建新标签 "{searchTerm}"
            </button>
          </div>
        )}

        {/* 已选的新标签 */}
        {newTagNames.length > 0 && (
          <div className="px-4 py-2 border-b bg-gray-50">
            <p className="text-xs text-gray-500 mb-2">新标签（将自动创建）:</p>
            <div className="flex flex-wrap gap-2">
              {newTagNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs"
                >
                  {name}
                  <button
                    onClick={() => removeNewTag(name)}
                    className="hover:text-green-900"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 标签列表 */}
        <div className="flex-1 overflow-auto p-4">
          {filteredTags.length === 0 && !isNewTag ? (
            <div className="text-center text-gray-400 py-8">
              <p>暂无匹配标签</p>
              {searchTerm && (
                <p className="text-sm mt-1">按回车创建 "{searchTerm}"</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {filteredTags.map((tag) => {
                const isSelected = selectedIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className={`
                      px-3 py-1.5 rounded-full text-sm transition-colors
                      ${isSelected
                        ? "bg-primary-500 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }
                    `}
                  >
                    <span className="flex items-center gap-1">
                      {isSelected && (
                        <Check className="w-3 h-3" />
                      )}
                      {tag.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t flex justify-between items-center">
          <span className="text-sm text-gray-500">
            已选 {totalSelected} 个标签
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={totalSelected === 0}
              className="px-4 py-2 text-sm bg-primary-500 text-white hover:bg-primary-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TagSelector;
