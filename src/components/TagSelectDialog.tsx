import { useState, useEffect } from "react";
import { Tag } from "../api/tags";
import { TagInput } from "./TagInput";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  Button,
  Text,
} from "@fluentui/react-components";

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
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newTagNames, setNewTagNames] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(initialSelectedIds);
      setNewTagNames([]);
    }
  }, [isOpen]);

  const handleTagChange = (ids: number[], names: string[]) => {
    setSelectedIds(ids);
    setNewTagNames(names);
  };

  const handleConfirm = () => {
    onConfirm(selectedIds, newTagNames);
  };

  const totalTags = selectedIds.length + newTagNames.length;

  return (
    <Dialog open={isOpen} onOpenChange={(_e, data) => data.open === false && data.type !== "backdropClick" && onClose()}>
      <DialogSurface style={{ maxWidth: "450px", width: "100%", overflow: "visible" }}>
        <DialogTitle style={{ fontSize: "16px" }}>给 {imageCount} 张图片打标签</DialogTitle>
        <br />
        <DialogContent style={{ overflow: "visible" }}>
          <TagInput
            key={`${isOpen}-${initialSelectedIds.join(",")}`}
            availableTags={availableTags}
            selectedTagIds={selectedIds}
            onChange={handleTagChange}
            placeholder="输入标签名，回车添加..."
          />
          <Text className="text-xs text-gray-500 mt-2" block>
            提示：标签为空时，将清除所有标签
          </Text>
        </DialogContent>
        <div className="flex items-center justify-between mt-3">
          <Text className="text-sm text-gray-500">
            {totalTags > 0 ? `已选 ${totalTags} 个标签` : "将清除所有标签"}
          </Text>
          <div className="flex gap-2">
            <Button appearance="secondary" onClick={onClose}>
              取消
            </Button>
            <Button appearance="primary" onClick={handleConfirm}>
              确认
            </Button>
          </div>
        </div>
      </DialogSurface>
    </Dialog>
  );
}

export default TagSelectDialog;
