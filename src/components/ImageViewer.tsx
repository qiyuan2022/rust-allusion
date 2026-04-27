import { useEffect, useCallback, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useGalleryStore } from "../stores/gallery";
import { Button, Text, Divider, Tooltip } from "@fluentui/react-components";
import {
  DismissRegular,
  InfoRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from "@fluentui/react-icons";

export function ImageViewer() {
  const store = useGalleryStore();
  const [showInfo, setShowInfo] = useState(false);

  const currentImage = store.images.find(
    (img) => img.id === store.previewImageId
  );

  const currentIndex = store.images.findIndex(
    (img) => img.id === store.previewImageId
  );

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          store.closePreview();
          break;
        case "ArrowLeft":
          store.prevPreview();
          break;
        case "ArrowRight":
          store.nextPreview();
          break;
        case "i":
        case "I":
          setShowInfo((prev) => !prev);
          break;
      }
    },
    [store]
  );

  useEffect(() => {
    if (store.isPreviewOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [store.isPreviewOpen, handleKeyDown]);

  if (!store.isPreviewOpen || !currentImage) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex">
      {/* 主图片区 */}
      <div className="flex-1 flex flex-col relative">
        {/* 顶部工具栏 */}
        <div className="absolute top-0 left-0 right-0 p-3 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent z-10">
          <div className="flex items-center gap-3">
            <Button
              appearance="transparent"
              icon={<DismissRegular className="w-5 h-5" />}
              onClick={() => store.closePreview()}
              className="!text-white/80 hover:!text-white hover:!bg-white/10 !rounded-lg"
              size="small"
            />
            <Text className="text-white/80 text-sm">
              {currentIndex + 1} / {store.images.length}
            </Text>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip content="信息 (I)" relationship="label">
              <Button
                appearance="transparent"
                icon={<InfoRegular className="w-5 h-5" />}
                onClick={() => setShowInfo(!showInfo)}
                className={`!rounded-lg ${
                  showInfo
                    ? "!bg-white/20 !text-white"
                    : "!text-white/70 hover:!text-white hover:!bg-white/10"
                }`}
                size="small"
              />
            </Tooltip>
          </div>
        </div>

        {/* 图片显示区 */}
        <div className="flex-1 flex items-center justify-center p-4">
          {/* 上一张按钮 */}
          {currentIndex > 0 && (
            <Button
              appearance="transparent"
              icon={<ChevronLeftRegular className="w-8 h-8" />}
              onClick={() => store.prevPreview()}
              className="absolute left-4 !text-white/40 hover:!text-white hover:!bg-white/10 !rounded-full !p-3"
            />
          )}

          {/* 图片 */}
          <img
            src={convertFileSrc(currentImage.path.replace(/\\/g, '/'))}
            alt={currentImage.file_name}
            className="max-w-full max-h-full object-contain"
          />

          {/* 下一张按钮 */}
          {currentIndex < store.images.length - 1 && (
            <Button
              appearance="transparent"
              icon={<ChevronRightRegular className="w-8 h-8" />}
              onClick={() => store.nextPreview()}
              className="absolute right-4 !text-white/40 hover:!text-white hover:!bg-white/10 !rounded-full !p-3"
            />
          )}
        </div>

        {/* 底部缩略图导航 */}
        <div className="h-20 bg-black/50 flex items-center gap-2 px-4 overflow-x-auto">
          {store.images
            .slice(Math.max(0, currentIndex - 10), currentIndex + 11)
            .map((img) => (
              <button
                key={img.id}
                onClick={() => store.openPreview(img.id)}
                className={`flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-all ${
                  img.id === currentImage.id
                    ? "border-white"
                    : "border-transparent hover:border-white/50"
                }`}
              >
                <img
                  src={convertFileSrc(img.path.replace(/\\/g, '/'))}
                  alt={img.file_name}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
        </div>
      </div>

      {/* 右侧信息面板 */}
      {showInfo && (
        <div className="w-72 bg-white border-l overflow-y-auto">
          <div className="p-4 border-b">
            <Text weight="semibold" className="text-gray-800">文件信息</Text>
          </div>
          
          <div className="p-4 space-y-4 text-sm">
            <InfoItem label="文件名" value={currentImage.file_name} />
            <InfoItem 
              label="格式" 
              value={currentImage.format?.toUpperCase() || "Unknown"} 
            />
            <InfoItem 
              label="尺寸" 
              value={
                currentImage.width && currentImage.height
                  ? `${currentImage.width} × ${currentImage.height}`
                  : "Unknown"
              } 
            />
            <InfoItem 
              label="大小" 
              value={formatFileSize(currentImage.file_size)} 
            />
            <InfoItem 
              label="修改时间" 
              value={new Date(currentImage.file_modified_at * 1000).toLocaleString()} 
            />
            <InfoItem 
              label="路径" 
              value={currentImage.path} 
              truncate 
            />
          </div>

          {/* 标签区域 */}
          <div className="border-t p-4">
            <Text weight="semibold" className="text-gray-800 mb-3 block">标签</Text>
            <Text className="text-sm text-gray-400">右键点击图片添加标签</Text>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ 
  label, 
  value, 
  truncate = false 
}: { 
  label: string; 
  value: string; 
  truncate?: boolean;
}) {
  return (
    <div>
      <Text className="text-gray-500 block text-xs mb-1">{label}</Text>
      <Text
        className={`text-gray-800 ${truncate ? "truncate block" : ""}`}
      >
        {value}
      </Text>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default ImageViewer;
