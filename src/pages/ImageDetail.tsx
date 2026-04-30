import { useEffect, useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Tag } from "../api/tags";
import { TagInput } from "../components/TagInput";
import { useGalleryStore } from "../stores/gallery";
import { generateThumbnail, ThumbnailResult } from "../api/thumbnail";
import {
  ChevronLeftRegular,
  HeartRegular,
  FolderOpenRegular,
  DeleteRegular,
  CopyRegular,
  ArrowCounterclockwiseRegular,
  PanelRightRegular,
  PanelLeftRegular,
  ArrowResetRegular,
} from "@fluentui/react-icons";
import {
  Button,
  Spinner,
  Text,
  Divider,
  Tooltip,
} from "@fluentui/react-components";

interface ImageDetailProps {
  imageId: number;
  onClose: () => void;
}

interface ImageDetailData {
  id: number;
  path: string;
  hash: string;
  file_name: string;
  file_size: number;
  width?: number;
  height?: number;
  format?: string;
  file_modified_at: number;
  created_at: number;
  updated_at: number;
  tags: Tag[];
}

export function ImageDetail({ imageId, onClose }: ImageDetailProps) {
  const [image, setImage] = useState<ImageDetailData | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenResult, setRegenResult] = useState<{
    result: ThumbnailResult;
    duration: number;
  } | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const updateImageTags = useGalleryStore((state) => state.updateImageTags);

  const loadImageDetail = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<ImageDetailData>("get_image_with_tags", {
        imageId,
      });
      setImage(result);
    } catch (error) {
      console.error("Failed to load image detail:", error);
    } finally {
      setLoading(false);
    }
  }, [imageId]);

  const loadAvailableTags = useCallback(async () => {
    try {
      const tags = await invoke<Tag[]>("get_all_tags");
      setAvailableTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      await Promise.all([loadImageDetail(), loadAvailableTags()]);
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [imageId, loadImageDetail, loadAvailableTags]);

  useEffect(() => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, [imageId]);

  const handleResetView = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      offsetX: panOffset.x,
      offsetY: panOffset.y,
    };
  };

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((prev) => {
        const next = prev + delta;
        return Math.max(0.1, Math.min(5, next));
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [loading]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPanOffset({
        x: dragStartRef.current.offsetX + dx,
        y: dragStartRef.current.offsetY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleTagChange = async (tagIds: number[], newTagNames: string[]) => {
    if (!image) return;

    try {
      const newTags: Tag[] = [];
      for (const name of newTagNames) {
        const tag = await invoke<Tag>("create_tag", {
          req: { name, color: "#3b82f6", parent_id: null },
        });
        newTags.push(tag);
      }

      await invoke("clear_image_tags", { imageHash: image.hash });

      const allTagIds = [...tagIds, ...newTags.map((t) => t.id)];
      if (allTagIds.length > 0) {
        await invoke("add_tags_to_image", {
          imageHash: image.hash,
          tagIds: allTagIds,
        });
      }

      const updatedTags: Tag[] = [
        ...availableTags.filter((t) => tagIds.includes(t.id)),
        ...newTags,
      ];

      setImage((prev) => (prev ? { ...prev, tags: updatedTags } : null));
      updateImageTags(imageId, updatedTags);
      await loadAvailableTags();
    } catch (error) {
      console.error("Failed to update tags:", error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KiB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getMegapixels = (width?: number, height?: number): string => {
    if (!width || !height) return "-";
    return ((width * height) / 1000000).toFixed(1);
  };

  const handleRegenerateThumbnails = async () => {
    if (!image) return;
    setRegenerating(true);
    setRegenResult(null);
    const start = performance.now();
    try {
      const result = await generateThumbnail(image.id, "small", true);
      const duration = performance.now() - start;
      setRegenResult({ result, duration });
      console.log(
        "Thumbnail regeneration result:",
        result,
        "Duration:",
        duration,
      );
    } catch (error) {
      console.error("Failed to regenerate thumbnail:", error);
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="small" />
          <Text className="text-gray-500 dark:text-gray-400">加载中...</Text>
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Text className="text-gray-500 dark:text-gray-400">图片不存在</Text>
          <Button appearance="primary" onClick={onClose} className="mt-4">
            返回
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* 顶部工具栏 */}
      <div className="h-12 pl-4 pr-6 flex items-center justify-between border-b dark:border-gray-700 bg-white dark:bg-gray-900">
        <Button
          appearance="transparent"
          icon={<ChevronLeftRegular className="w-5 h-5" />}
          onClick={onClose}
          style={{
            padding: 0,
            justifyContent: "flex-start",
            fontWeight: 400,
          }}
        >
          返回
        </Button>

        <div className="flex items-center gap-1">
          <Tooltip content="收藏" relationship="label">
            <Button
              appearance="transparent"
              icon={<HeartRegular className="w-5 h-5" />}
              size="small"
            />
          </Tooltip>
          <Tooltip content="删除" relationship="label">
            <Button
              appearance="transparent"
              icon={<DeleteRegular className="w-5 h-5" />}
              size="small"
              className="hover:!text-red-600 hover:!bg-red-50 dark:hover:!bg-red-900/20"
            />
          </Tooltip>
          <Tooltip content="重置视图" relationship="label">
            <Button
              appearance="transparent"
              icon={<ArrowResetRegular className="w-5 h-5" />}
              onClick={handleResetView}
              size="small"
            />
          </Tooltip>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <Tooltip content={showInfoPanel ? "隐藏信息面板" : "显示信息面板"} relationship="label">
            <Button
              appearance="transparent"
              icon={
                showInfoPanel ? (
                  <PanelRightRegular className="w-5 h-5" />
                ) : (
                  <PanelLeftRegular className="w-5 h-5" />
                )
              }
              onClick={() => setShowInfoPanel((prev) => !prev)}
              size="small"
            />
          </Tooltip>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧图片预览 */}
        <div
          ref={previewRef}
          className="flex-1 bg-gray-100 dark:bg-gray-950 flex items-center justify-center overflow-hidden"
        >
          <img
            src={convertFileSrc(image.path.replace(/\\/g, "/"))}
            alt={image.file_name}
            className="max-w-full max-h-full object-contain shadow-lg"
            onMouseDown={handleMouseDown}
            style={{
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
              transformOrigin: "center center",
              cursor: scale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              transition: isDragging ? "none" : "transform 0.1s ease-out",
            }}
          />
        </div>

        {/* 右侧信息面板 */}
        <div
          className="bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-300 ease-in-out flex-shrink-0"
          style={{ width: showInfoPanel ? 320 : 0 }}
        >
          <div className="w-80 h-full overflow-y-auto">
            {/* 图片信息 */}
            <div className="p-4">
              <Text
                weight="semibold"
                className="text-gray-900 dark:text-gray-100"
                style={{ display: "block", marginBottom: "8px" }}
              >
                图片信息
              </Text>
              <div className="space-y-3 text-sm">
                <InfoRow label="文件名" value={image.file_name} truncate />
                <InfoRow
                  label="尺寸"
                  value={
                    image.width && image.height
                      ? `${image.width} x ${image.height}`
                      : "-"
                  }
                />
                <InfoRow label="大小" value={formatFileSize(image.file_size)} />
                <InfoRow
                  label="导入时间"
                  value={formatDate(image.created_at)}
                />
                <InfoRow
                  label="创建时间"
                  value={formatDate(image.file_modified_at)}
                />
                <InfoRow
                  label="修改时间"
                  value={formatDate(image.file_modified_at)}
                />
                <InfoRow label="位深度" value="8" />
                <InfoRow
                  label="像素"
                  value={getMegapixels(image.width, image.height)}
                />
              </div>
            </div>

            <Divider />

            {/* 文件路径 */}
            <div className="px-4 py-3">
              <Text
                weight="semibold"
                className="text-gray-900 dark:text-gray-100"
                style={{ display: "block", marginBottom: "8px" }}
              >
                文件路径
              </Text>
              <div className="flex gap-2">
                <Tooltip content={image.path} relationship="label">
                  <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-300 truncate">
                    {image.path}
                  </div>
                </Tooltip>
                <Tooltip content="复制路径" relationship="label">
                  <Button
                    appearance="secondary"
                    icon={<CopyRegular fontSize={24} />}
                    onClick={() => navigator.clipboard.writeText(image.path)}
                    size="medium"
                  />
                </Tooltip>
                <Tooltip content="在文件夹中显示" relationship="label">
                  <Button
                    appearance="secondary"
                    icon={<FolderOpenRegular fontSize={24} />}
                    onClick={() => invoke("show_in_folder", { path: image.path })}
                    size="medium"
                  />
                </Tooltip>
              </div>
            </div>

            <Divider />

            {/* 标签 */}
            <div className="px-4 py-3">
              <Text
                weight="semibold"
                className="text-gray-900 dark:text-gray-100"
                style={{ display: "block", marginBottom: "8px" }}
              >
                标签
              </Text>
              <TagInput
                availableTags={availableTags}
                selectedTagIds={image.tags.map((t) => t.id)}
                onChange={handleTagChange}
                placeholder="添加标签..."
              />
              <Text
                size={200}
                className="text-gray-500 dark:text-gray-400 mt-2 block"
              >
                输入标签名后按回车添加，点击标签可删除
              </Text>
            </div>

            <Divider />

            {/* 缩略图调试 */}
            <div className="px-4 py-3">
              <Text
                weight="semibold"
                className="text-gray-900 dark:text-gray-100"
                style={{ display: "block", marginBottom: "8px" }}
              >
                缩略图调试
              </Text>
              <div className="space-y-2">
                <Button
                  appearance="secondary"
                  icon={
                    <ArrowCounterclockwiseRegular
                      fontSize={24}
                      className={regenerating ? "animate-spin" : ""}
                    />
                  }
                  onClick={handleRegenerateThumbnails}
                  disabled={regenerating}
                  size="medium"
                  className="w-full"
                >
                  {regenerating ? "生成中..." : "重新生成缩略图"}
                </Button>
                {regenResult && (
                  <div className="text-xs space-y-1">
                    <InfoRow
                      label="耗时"
                      value={`${regenResult.duration.toFixed(0)} ms`}
                    />
                    <InfoRow
                      label="成功"
                      value={regenResult.result.success ? "是" : "否"}
                      valueClassName={
                        regenResult.result.success
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }
                    />
                    <InfoRow
                      label="尺寸"
                      value={
                        regenResult.result.width && regenResult.result.height
                          ? `${regenResult.result.width}x${regenResult.result.height}`
                          : "-"
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  truncate = false,
  valueClassName,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  valueClassName?: string;
}) {
  const valueText = (
    <Text
      className={`text-gray-900 dark:text-gray-100 text-right ${valueClassName || ""}`}
      style={
        truncate
          ? {
              display: "block",
              maxWidth: "180px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }
          : { display: "block", maxWidth: "180px" }
      }
    >
      {value}
    </Text>
  );

  return (
    <div className="flex justify-between">
      <Text className="text-gray-500 dark:text-gray-400">{label}</Text>
      {truncate ? (
        <Tooltip content={value} relationship="label">
          <span className="min-w-0 flex-1 flex justify-end overflow-hidden">
            {valueText}
          </span>
        </Tooltip>
      ) : (
        valueText
      )}
    </div>
  );
}

export default ImageDetail;
