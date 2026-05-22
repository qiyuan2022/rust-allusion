import { useState, useEffect, useRef, useCallback } from "react";
import type { CropRect } from "../api/wallpaper";

interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CropOverlayProps {
  imageWidth: number;
  imageHeight: number;
  screenRatio: number;
  containerWidth: number;
  containerHeight: number;
  onCropChange?: (crop: CropRect) => void;
}

type DragMode =
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se"
  | null;

interface DragStart {
  mouseX: number;
  mouseY: number;
  crop: DisplayRect;
}

const MIN_CROP_SIZE = 50;

export function CropOverlay({
  imageWidth,
  imageHeight,
  screenRatio,
  containerWidth,
  containerHeight,
  onCropChange,
}: CropOverlayProps) {
  // 图片在容器中的 object-contain 显示区域
  const [imgDisplay, setImgDisplay] = useState({ x: 0, y: 0, width: 0, height: 0 });
  // 选区在容器显示坐标系中的位置
  const [crop, setCrop] = useState<DisplayRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStartRef = useRef<DragStart | null>(null);

  // 计算图片 object-contain 后的显示区域
  useEffect(() => {
    if (containerWidth <= 0 || containerHeight <= 0) return;

    const imgRatio = imageWidth / imageHeight;
    const containerRatio = containerWidth / containerHeight;

    let dw: number, dh: number, dx: number, dy: number;
    if (imgRatio > containerRatio) {
      dw = containerWidth;
      dh = containerWidth / imgRatio;
      dx = 0;
      dy = (containerHeight - dh) / 2;
    } else {
      dw = containerHeight * imgRatio;
      dh = containerHeight;
      dx = (containerWidth - dw) / 2;
      dy = 0;
    }

    setImgDisplay({ x: dx, y: dy, width: dw, height: dh });

    // 初始化选区：按屏幕比例，默认居中，占显示区域的 80%
    let cropW: number, cropH: number;
    if (dw / dh > screenRatio) {
      cropH = dh * 0.8;
      cropW = cropH * screenRatio;
    } else {
      cropW = dw * 0.8;
      cropH = cropW / screenRatio;
    }

    const newCrop = {
      x: dx + (dw - cropW) / 2,
      y: dy + (dh - cropH) / 2,
      width: cropW,
      height: cropH,
    };
    setCrop(newCrop);
  }, [containerWidth, containerHeight, imageWidth, imageHeight, screenRatio]);

  // 将显示坐标转换为原图像素坐标并通知父组件
  const notifyCropChange = useCallback(
    (displayCrop: DisplayRect) => {
      if (!onCropChange || imgDisplay.width === 0 || imgDisplay.height === 0) return;

      const scaleX = imageWidth / imgDisplay.width;
      const scaleY = imageHeight / imgDisplay.height;

      const cropRect: CropRect = {
        x: Math.round((displayCrop.x - imgDisplay.x) * scaleX),
        y: Math.round((displayCrop.y - imgDisplay.y) * scaleY),
        width: Math.round(displayCrop.width * scaleX),
        height: Math.round(displayCrop.height * scaleY),
      };

      // 边界修正
      cropRect.x = Math.max(0, Math.min(imageWidth - 1, cropRect.x));
      cropRect.y = Math.max(0, Math.min(imageHeight - 1, cropRect.y));
      cropRect.width = Math.min(cropRect.width, imageWidth - cropRect.x);
      cropRect.height = Math.min(cropRect.height, imageHeight - cropRect.y);

      onCropChange(cropRect);
    },
    [onCropChange, imgDisplay, imageWidth, imageHeight]
  );

  // 拖拽开始
  const handleMouseDown = (e: React.MouseEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    if (!mode) return;
    setDragMode(mode);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      crop: { ...crop },
    };
  };

  // 全局拖拽处理
  useEffect(() => {
    if (!dragMode) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const start = dragStartRef.current;
      const dx = e.clientX - start.mouseX;
      const dy = e.clientY - start.mouseY;

      if (dragMode === "move") {
        // 移动选区
        const newX = Math.max(
          imgDisplay.x,
          Math.min(imgDisplay.x + imgDisplay.width - start.crop.width, start.crop.x + dx)
        );
        const newY = Math.max(
          imgDisplay.y,
          Math.min(imgDisplay.y + imgDisplay.height - start.crop.height, start.crop.y + dy)
        );
        const newCrop = { ...start.crop, x: newX, y: newY };
        setCrop(newCrop);
        notifyCropChange(newCrop);
      } else {
        // 四角缩放
        let newCrop = { ...start.crop };

        switch (dragMode) {
          case "resize-se": {
            // 右下角：右下移动
            const maxW = imgDisplay.x + imgDisplay.width - start.crop.x;
            const maxH = imgDisplay.y + imgDisplay.height - start.crop.y;
            const newW = Math.min(maxW, Math.max(MIN_CROP_SIZE, start.crop.width + dx));
            const newH = newW / screenRatio;
            if (newH <= maxH && newH >= MIN_CROP_SIZE) {
              newCrop.width = newW;
              newCrop.height = newH;
            }
            break;
          }
          case "resize-nw": {
            // 左上角：左上移动，右下固定
            const maxW = start.crop.x + start.crop.width - imgDisplay.x;
            const maxH = start.crop.y + start.crop.height - imgDisplay.y;
            const delta = Math.max(dx, dy); // 保持比例，取较大变化量
            const newW = Math.min(maxW, Math.max(MIN_CROP_SIZE, start.crop.width - delta));
            const newH = newW / screenRatio;
            if (newH <= maxH && newH >= MIN_CROP_SIZE) {
              const dw = start.crop.width - newW;
              const dh = start.crop.height - newH;
              newCrop.x = start.crop.x + dw;
              newCrop.y = start.crop.y + dh;
              newCrop.width = newW;
              newCrop.height = newH;
            }
            break;
          }
          case "resize-ne": {
            // 右上角：右上移动，左下固定
            const maxW = imgDisplay.x + imgDisplay.width - start.crop.x;
            const maxH = start.crop.y + start.crop.height - imgDisplay.y;
            const newW = Math.min(maxW, Math.max(MIN_CROP_SIZE, start.crop.width + dx));
            const newH = newW / screenRatio;
            if (newH <= maxH && newH >= MIN_CROP_SIZE) {
              const dh = start.crop.height - newH;
              newCrop.y = start.crop.y + dh;
              newCrop.width = newW;
              newCrop.height = newH;
            }
            break;
          }
          case "resize-sw": {
            // 左下角：左下移动，右上固定
            const maxW = start.crop.x + start.crop.width - imgDisplay.x;
            const maxH = imgDisplay.y + imgDisplay.height - start.crop.y;
            const delta = Math.max(-dx, dy);
            const newW = Math.min(maxW, Math.max(MIN_CROP_SIZE, start.crop.width - delta));
            const newH = newW / screenRatio;
            if (newH <= maxH && newH >= MIN_CROP_SIZE) {
              const dw = start.crop.width - newW;
              newCrop.x = start.crop.x + dw;
              newCrop.width = newW;
              newCrop.height = newH;
            }
            break;
          }
        }

        setCrop(newCrop);
        notifyCropChange(newCrop);
      }
    };

    const handleMouseUp = () => {
      setDragMode(null);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragMode, imgDisplay, screenRatio, notifyCropChange]);

  if (imgDisplay.width === 0 || imgDisplay.height === 0) return null;

  // 遮罩区域计算
  const topH = Math.max(0, crop.y - imgDisplay.y);
  const bottomH = Math.max(0, imgDisplay.y + imgDisplay.height - (crop.y + crop.height));
  const leftW = Math.max(0, crop.x - imgDisplay.x);
  const rightW = Math.max(0, imgDisplay.x + imgDisplay.width - (crop.x + crop.width));

  return (
    <div
      className="absolute inset-0"
      style={{ cursor: dragMode === "move" ? "move" : undefined }}
    >
      {/* 上遮罩 */}
      {topH > 0 && (
        <div
          className="absolute bg-black/50"
          style={{
            left: imgDisplay.x,
            top: imgDisplay.y,
            width: imgDisplay.width,
            height: topH,
          }}
        />
      )}
      {/* 下遮罩 */}
      {bottomH > 0 && (
        <div
          className="absolute bg-black/50"
          style={{
            left: imgDisplay.x,
            top: crop.y + crop.height,
            width: imgDisplay.width,
            height: bottomH,
          }}
        />
      )}
      {/* 左遮罩 */}
      {leftW > 0 && (
        <div
          className="absolute bg-black/50"
          style={{
            left: imgDisplay.x,
            top: crop.y,
            width: leftW,
            height: crop.height,
          }}
        />
      )}
      {/* 右遮罩 */}
      {rightW > 0 && (
        <div
          className="absolute bg-black/50"
          style={{
            left: crop.x + crop.width,
            top: crop.y,
            width: rightW,
            height: crop.height,
          }}
        />
      )}

      {/* 选区框 */}
      <div
        className="absolute border-2 border-white/90 shadow-lg"
        style={{
          left: crop.x,
          top: crop.y,
          width: crop.width,
          height: crop.height,
          cursor: dragMode === "move" ? "move" : "grab",
        }}
        onMouseDown={(e) => handleMouseDown(e, "move")}
      >
        {/* 中心提示 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white/80 text-xs bg-black/40 px-2 py-1 rounded">
            拖拽移动 · 拖拽四角缩放
          </span>
        </div>

        {/* 四角手柄 */}
        {/* 左上 */}
        <div
          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white rounded-full border border-gray-400 shadow"
          style={{ cursor: "nw-resize" }}
          onMouseDown={(e) => handleMouseDown(e, "resize-nw")}
        />
        {/* 右上 */}
        <div
          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white rounded-full border border-gray-400 shadow"
          style={{ cursor: "ne-resize" }}
          onMouseDown={(e) => handleMouseDown(e, "resize-ne")}
        />
        {/* 左下 */}
        <div
          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white rounded-full border border-gray-400 shadow"
          style={{ cursor: "sw-resize" }}
          onMouseDown={(e) => handleMouseDown(e, "resize-sw")}
        />
        {/* 右下 */}
        <div
          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white rounded-full border border-gray-400 shadow"
          style={{ cursor: "se-resize" }}
          onMouseDown={(e) => handleMouseDown(e, "resize-se")}
        />
      </div>
    </div>
  );
}
