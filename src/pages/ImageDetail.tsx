import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Tag } from "../api/tags";
import { TagInput } from "../components/TagInput";
import { useGalleryStore } from "../stores/gallery";
import { ChevronLeft, Heart, FolderOpen, Trash2, Copy } from "lucide-react";

interface ImageDetailProps {
  imageId: number;
  onClose: () => void;
}

interface ImageDetail {
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
  const [image, setImage] = useState<ImageDetail | null>(null);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const updateImageTags = useGalleryStore((state) => state.updateImageTags);

  const loadImageDetail = useCallback(async () => {
    try {
      setLoading(true);
      const result = await invoke<ImageDetail>("get_image_with_tags", {
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

  const handleTagChange = async (tagIds: number[], newTagNames: string[]) => {
    if (!image) return;

    try {
      // 创建新标签
      const newTags: Tag[] = [];
      for (const name of newTagNames) {
        const tag = await invoke<Tag>("create_tag", {
          req: { name, color: "#3b82f6", parent_id: null },
        });
        newTags.push(tag);
      }

      // 清除现有标签并添加新标签
      await invoke("clear_image_tags", { imageHash: image.hash });

      const allTagIds = [...tagIds, ...newTags.map((t) => t.id)];
      if (allTagIds.length > 0) {
        await invoke("add_tags_to_image", {
          imageHash: image.hash,
          tagIds: allTagIds,
        });
      }

      // 构建新的标签列表用于更新 store
      const updatedTags: Tag[] = [
        // 从 availableTags 中获取选中的已有标签
        ...availableTags.filter((t) => tagIds.includes(t.id)),
        // 添加新创建的标签
        ...newTags,
      ];

      // 更新本地状态和 store 中的图片列表
      setImage((prev) => (prev ? { ...prev, tags: updatedTags } : null));
      updateImageTags(imageId, updatedTags);

      // 重新加载可用标签（以防有新创建的）
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-500">图片不存在</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* 顶部工具栏 */}
      <div className="h-12 px-4 flex items-center justify-between border-b bg-white">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          <span>返回</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            title="收藏"
          >
            <Heart className="w-5 h-5" />
          </button>
          <button
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            title="在文件夹中显示"
            onClick={() => invoke("show_in_folder", { path: image.path })}
          >
            <FolderOpen className="w-5 h-5" />
          </button>
          <button
            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg"
            title="删除"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧图片预览 */}
        <div className="flex-1 bg-gray-100 flex items-center justify-center p-8">
          <img
            src={convertFileSrc(image.path.replace(/\\/g, "/"))}
            alt={image.file_name}
            className="max-w-full max-h-full object-contain shadow-lg"
          />
        </div>

        {/* 右侧信息面板 */}
        <div className="w-80 bg-white border-l overflow-y-auto">
          {/* 图片信息 */}
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-4">图片信息</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">文件名</span>
                <span
                  className="text-gray-900 text-right max-w-[180px] truncate"
                  title={image.file_name}
                >
                  {image.file_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">尺寸</span>
                <span className="text-gray-900">
                  {image.width && image.height
                    ? `${image.width} x ${image.height}`
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">大小</span>
                <span className="text-gray-900">
                  {formatFileSize(image.file_size)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">导入时间</span>
                <span className="text-gray-900">
                  {formatDate(image.created_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">创建时间</span>
                <span className="text-gray-900">
                  {formatDate(image.file_modified_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">修改时间</span>
                <span className="text-gray-900">
                  {formatDate(image.file_modified_at)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">位深度</span>
                <span className="text-gray-900">8</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">像素</span>
                <span className="text-gray-900">
                  {getMegapixels(image.width, image.height)}
                </span>
              </div>
            </div>
          </div>

          {/* 文件路径 */}
          <div className="px-4 py-3 border-t">
            <h3 className="font-semibold text-gray-900 mb-3">文件路径</h3>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 bg-gray-50 rounded text-sm text-gray-600 truncate">
                {image.path}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(image.path)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                title="复制路径"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 标签 */}
          <div className="px-4 py-3 border-t">
            <h3 className="font-semibold text-gray-900 mb-3">标签</h3>
            <TagInput
              availableTags={availableTags}
              selectedTagIds={image.tags.map((t) => t.id)}
              onChange={handleTagChange}
              placeholder="添加标签..."
            />
            <p className="text-xs text-gray-500 mt-2">
              输入标签名后按回车添加，点击标签可删除
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageDetail;
