import { useState, useEffect, useCallback } from "react";
import { X, FolderSearch, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { ImportProgress, ImportPhase } from "../api/locations";

interface ScanProgressDialogProps {
  isOpen: boolean;
  title?: string;
  progress: ImportProgress | null;
  onCancel: () => void;
}

export function ScanProgressDialog({
  isOpen,
  title = "扫描文件夹",
  progress,
  onCancel,
}: ScanProgressDialogProps) {
  const [displayProgress, setDisplayProgress] = useState<ImportProgress | null>(null);

  // 平滑更新进度显示
  useEffect(() => {
    if (progress) {
      setDisplayProgress(progress);
    }
  }, [progress]);

  const getPhaseIcon = (phase: ImportPhase) => {
    switch (phase) {
      case "scanning":
        return <FolderSearch className="w-5 h-5 text-blue-500" />;
      case "importing":
        return <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />;
      case "completed":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "cancelled":
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      default:
        return null;
    }
  };

  const getPhaseText = (phase: ImportPhase) => {
    switch (phase) {
      case "scanning":
        return "正在扫描文件夹...";
      case "importing":
        return "正在导入图片...";
      case "completed":
        return "导入完成";
      case "cancelled":
        return "已取消";
      default:
        return "";
    }
  };

  const formatFileName = (path: string | null) => {
    if (!path) return null;
    // 只显示文件名，不显示完整路径
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  if (!isOpen || !displayProgress) return null;

  const { phase, total, processed, succeeded, failed, skipped, percentage, current_file, message } = displayProgress;
  const isCompleted = phase === "completed" || phase === "cancelled";
  const isScanning = phase === "scanning";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {getPhaseIcon(phase)}
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          </div>
          {!isCompleted && (
            <button
              onClick={onCancel}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              title="取消"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Phase text */}
          <div className="text-sm text-gray-600">
            {getPhaseText(phase)}
            {message && (
              <span className="block mt-1 text-gray-500">{message}</span>
            )}
          </div>

          {/* Progress bar */}
          {!isScanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {processed} / {total}
                </span>
                <span className="font-medium text-gray-900">{percentage}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    phase === "completed"
                      ? "bg-green-500"
                      : phase === "cancelled"
                      ? "bg-orange-500"
                      : "bg-primary-500"
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Current file */}
          {current_file && !isCompleted && (
            <div className="text-sm text-gray-500 truncate">
              <span className="text-gray-400">当前文件：</span>
              {formatFileName(current_file)}
            </div>
          )}

          {/* Stats */}
          {!isScanning && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-lg font-semibold text-green-600">{succeeded}</div>
                <div className="text-xs text-green-600/70">成功</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-semibold text-gray-600">{skipped}</div>
                <div className="text-xs text-gray-500">跳过</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-lg font-semibold text-red-600">{failed}</div>
                <div className="text-xs text-red-600/70">失败</div>
              </div>
            </div>
          )}

          {/* Scanning indicator */}
          {isScanning && (
            <div className="flex items-center justify-center py-4">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>已发现 {processed} 个文件</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {isCompleted && (
          <div className="px-6 py-4 bg-gray-50 border-t">
            <button
              onClick={onCancel}
              className="w-full py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
            >
              确定
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScanProgressDialog;
