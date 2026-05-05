import { useState } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Checkbox,
  Text,
} from "@fluentui/react-components";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteSourceFile: boolean) => void;
  imageCount: number;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  imageCount,
}: DeleteConfirmDialogProps) {
  const [deleteSourceFile, setDeleteSourceFile] = useState(false);

  return (
    <Dialog open={isOpen} onOpenChange={(_e, data) => data.open === false && data.type !== "backdropClick" && onClose()}>
      <DialogSurface>
        <DialogTitle style={{ fontSize: "16px" }}>确认删除</DialogTitle>
        <DialogContent>
          <Text block style={{ marginBottom: "16px" }}>
            确定要删除选中的 <strong>{imageCount}</strong> 张图片吗？
          </Text>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "12px",
              backgroundColor: "#fef2f2",
              borderRadius: "8px",
              cursor: "pointer",
            }}
            onClick={() => setDeleteSourceFile(!deleteSourceFile)}
          >
            <Checkbox
              checked={deleteSourceFile}
              onChange={(_e, data) => setDeleteSourceFile(data.checked === true)}
            />
            <div>
              <Text weight="semibold" style={{ color: "#b91c1c", fontSize: "14px" }}>
                同时删除源文件
              </Text>
              <Text style={{ color: "#dc2626", fontSize: "12px", display: "block", marginTop: "4px" }}>
                勾选后将永久删除硬盘上的原始文件，此操作不可恢复
              </Text>
            </div>
          </div>
        </DialogContent>
        <DialogActions style={{ marginTop: "12px" }}>
          <Button appearance="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            appearance="primary"
            style={{ backgroundColor: "#dc2626" }}
            onClick={() => onConfirm(deleteSourceFile)}
          >
            删除
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}

export default DeleteConfirmDialog;
