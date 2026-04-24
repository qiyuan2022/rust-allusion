import { useState, useEffect } from "react";
import {
  DismissRegular,
  SearchRegular,
  ArrowClockwiseRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
} from "@fluentui/react-icons";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  ProgressBar,
  Text,
} from "@fluentui/react-components";
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
        return <SearchRegular className="w-5 h-5 text-blue-500" />;
      case "importing":
        return <ArrowClockwiseRegular className="w-5 h-5 text-primary-500 animate-spin" />;
      case "completed":
        return <CheckmarkCircleRegular className="w-5 h-5 text-green-500" />;
      case "cancelled":
        return <ErrorCircleRegular className="w-5 h-5 text-orange-500" />;
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
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
  };

  if (!isOpen || !displayProgress) return null;

  const { phase, total, processed, succeeded, failed, skipped, percentage, current_file, message } = displayProgress;
  const isCompleted = phase === "completed" || phase === "cancelled";
  const isScanning = phase === "scanning";

  return (
    <Dialog open={isOpen} onOpenChange={(_e, data) => data.open === false && onCancel()}>
      <DialogSurface style={{ maxWidth: "420px", width: "100%" }}>
        <DialogTitle
          style={{ fontSize: "16px" }}
          action={
            !isCompleted ? (
              <Button
                appearance="subtle"
                icon={<DismissRegular fontSize={20} />}
                onClick={onCancel}
              />
            ) : undefined
          }
        >
          <div className="flex items-center gap-3">
            {getPhaseIcon(phase)}
            <span>{title}</span>
          </div>
        </DialogTitle>

        <DialogContent>
          <div className="space-y-4">
            {/* Phase text */}
            <Text block>
              {getPhaseText(phase)}
              {message && (
                <span className="block mt-1 text-gray-500">{message}</span>
              )}
            </Text>

            {/* Progress bar */}
            {!isScanning && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {processed} / {total}
                  </span>
                  <span className="font-medium text-gray-900">{percentage}%</span>
                </div>
                <ProgressBar value={percentage / 100} />
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
                  <ArrowClockwiseRegular className="w-5 h-5 animate-spin" />
                  <span>已发现 {processed} 个文件</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>

        {/* Footer */}
        {isCompleted && (
          <DialogActions style={{ marginTop: "12px" }}>
            <Button appearance="primary" onClick={onCancel} className="w-full">
              确定
            </Button>
          </DialogActions>
        )}
      </DialogSurface>
    </Dialog>
  );
}

export default ScanProgressDialog;
