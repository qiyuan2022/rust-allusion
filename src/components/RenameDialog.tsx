import { useState, useEffect } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Input,
  Text,
} from "@fluentui/react-components";

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}

export function RenameDialog({
  isOpen,
  onClose,
  onConfirm,
  currentName,
}: RenameDialogProps) {
  const [newName, setNewName] = useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
    }
  }, [isOpen, currentName]);

  const handleConfirm = () => {
    if (newName.trim() && newName.trim() !== currentName) {
      onConfirm(newName.trim());
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(_e, data) => data.open === false && onClose()}>
      <DialogSurface style={{ maxWidth: "400px", width: "100%" }}>
        <DialogTitle style={{ fontSize: "16px" }}>重命名</DialogTitle>
        <DialogContent>
          <Text className="text-sm text-gray-500 mb-3" block>
            将文件重命名为：
          </Text>
          <Input
            value={newName}
            onChange={(_e, data) => setNewName(data.value)}
            onKeyDown={handleKeyDown}
            placeholder="请输入新文件名"
            className="w-full"
          />
        </DialogContent>
        <DialogActions style={{ marginTop: "12px" }}>
          <Button appearance="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            appearance="primary"
            onClick={handleConfirm}
            disabled={!newName.trim() || newName.trim() === currentName}
          >
            确认
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}

export default RenameDialog;
