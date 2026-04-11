import { useState, useEffect } from "react";
import { Tag } from "../api/tags";
import { TagInput } from "./TagInput";

interface TagSelectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (tagIds: number[], newTagNames: string[]) => void;
  availableTags: Tag[];
  selectedTagIds: number[];
  imageCount: number;
}

export function TagSelectDialog({
  isOpen,
  onClose,
  onConfirm,
  availableTags,
  selectedTagIds: initialSelectedIds,
  imageCount,
}: TagSelectDialogProps) {
  // 使用本地状态来管理标签选择
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newTagNames, setNewTagNames] = useState<string[]>([]);

  // 当弹窗打开时，重置状态
  useEffect(() => {
    if (isOpen) {
      setSelectedIds([]);
      setNewTagNames([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTagChange = (ids: number[], names: string[]) => {
    setSelectedIds(ids);
    setNewTagNames(names);
  };

  const handleConfirm = () => {
    onConfirm(selectedIds, newTagNames);
  };

  const totalTags = selectedIds.length + newTagNames.length;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-lg shadow-xl w-[450px]">
        {/* 标题 */}
        <div className="px-4 py-3 border-b">
          <h3 className="text-lg font-medium text-gray-900">
            给 {imageCount} 张图片打标签
          </h3>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <TagInput
            availableTags={availableTags}
            selectedTagIds={selectedIds}
            onChange={handleTagChange}
            placeholder="输入标签名，回车添加..."
          />
          
          {/* 提示文字 */}
          <p className="text-xs text-gray-500 mt-2">
            提示：输入标签名后按回车添加，点击标签可删除。若标签不存在将自动创建。
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t flex justify-between items-center">
          <span className="text-sm text-gray-500">
            {totalTags > 0 ? `已选 ${totalTags} 个标签` : "将清除所有标签"}
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
              className="px-4 py-2 text-sm bg-primary-500 text-white hover:bg-primary-600 rounded-lg transition-colors"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TagSelectDialog;
