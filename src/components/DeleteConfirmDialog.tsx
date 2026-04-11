import { useState } from "react";

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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-lg shadow-xl w-[400px]">
        {/* 标题 */}
        <div className="px-4 py-3 border-b">
          <h3 className="text-lg font-medium text-gray-900">确认删除</h3>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <p className="text-gray-600 mb-4">
            确定要删除选中的 <span className="font-medium text-gray-900">{imageCount}</span> 张图片吗？
          </p>

          {/* 选项 */}
          <label className="flex items-start gap-3 p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors">
            <input
              type="checkbox"
              checked={deleteSourceFile}
              onChange={(e) => setDeleteSourceFile(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
            />
            <div>
              <p className="text-sm font-medium text-red-700">同时删除源文件</p>
              <p className="text-xs text-red-600 mt-1">
                勾选后将永久删除硬盘上的原始文件，此操作不可恢复
              </p>
            </div>
          </label>
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(deleteSourceFile)}
            className="px-4 py-2 text-sm bg-red-500 text-white hover:bg-red-600 rounded-lg transition-colors"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteConfirmDialog;
