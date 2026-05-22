import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  Button,
  Text,
} from "@fluentui/react-components";
import {
  CheckmarkRegular,
  DismissRegular,
  DesktopRegular,
} from "@fluentui/react-icons";
import { CropOverlay } from "./CropOverlay";
import {
  getPrimaryMonitorInfo,
  setWallpaper,
  type MonitorInfo,
  type CropRect,
} from "../api/wallpaper";

interface WallpaperCropDialogProps {
  open: boolean;
  imageUrl: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WallpaperCropDialog({
  open,
  imageUrl,
  imagePath,
  imageWidth,
  imageHeight,
  onClose,
  onSuccess,
}: WallpaperCropDialogProps) {
  const [monitor, setMonitor] = useState<MonitorInfo | null>(null);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取屏幕信息
  useEffect(() => {
    if (!open) return;
    setError(null);
    getPrimaryMonitorInfo()
      .then(setMonitor)
      .catch((err) => setError(String(err)));
  }, [open]);

  // 监听容器尺寸变化
  useEffect(() => {
    if (!open || !containerRef.current) return;

    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setContainerSize({ width: cr.width, height: cr.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  const handleCropChange = useCallback((crop: CropRect) => {
    setCropRect(crop);
  }, []);

  const handleConfirm = async () => {
    if (!cropRect) return;
    setLoading(true);
    setError(null);
    try {
      await setWallpaper(imagePath, cropRect);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const screenRatio = monitor
    ? monitor.width / monitor.height
    : 16 / 9;

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface className="max-w-4xl w-full">
        <DialogTitle>
          <div className="flex items-center gap-2">
            <DesktopRegular fontSize={24} />
            <span>设为桌面背景</span>
          </div>
        </DialogTitle>
        <DialogBody>
          {monitor && (
            <Text size={200} className="text-gray-500 mb-2 block">
              屏幕分辨率: {Math.round(monitor.width)} × {Math.round(monitor.height)}
              {" "}(比例 {monitor.width.toFixed(1)}:{monitor.height.toFixed(1)})
            </Text>
          )}

          {error && (
            <div className="mb-2 px-3 py-2 bg-red-50 text-red-600 text-sm rounded">
              {error}
            </div>
          )}

          {/* 图片容器 */}
          <div
            ref={containerRef}
            className="relative w-full bg-gray-900 rounded overflow-hidden"
            style={{ height: 480 }}
          >
            {imageUrl && (
              <img
                src={imageUrl}
                alt="预览"
                className="absolute w-full h-full"
                style={{ objectFit: "contain" }}
                draggable={false}
              />
            )}
            {monitor && containerSize.width > 0 && containerSize.height > 0 && (
              <CropOverlay
                imageWidth={imageWidth}
                imageHeight={imageHeight}
                screenRatio={screenRatio}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                onCropChange={handleCropChange}
              />
            )}
          </div>
        </DialogBody>
        <DialogActions>
          <Button
            appearance="secondary"
            onClick={onClose}
            icon={<DismissRegular fontSize={20} />}
            disabled={loading}
          >
            取消
          </Button>
          <Button
            appearance="primary"
            onClick={handleConfirm}
            icon={<CheckmarkRegular fontSize={20} />}
            disabled={loading || !cropRect}
          >
            {loading ? "设置中..." : "设为桌面背景"}
          </Button>
        </DialogActions>
      </DialogSurface>
    </Dialog>
  );
}
