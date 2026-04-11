import { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  generateThumbnail,
  getThumbnailStatus,
  generateAllThumbnails,
  ThumbnailSize,
  THUMBNAIL_SIZES,
} from "../api/thumbnail";

interface ThumbnailViewerProps {
  imageId: number;
  imagePath?: string;
  className?: string;
}

export function ThumbnailViewer({
  imageId,
  imagePath,
  className = "",
}: ThumbnailViewerProps) {
  const [status, setStatus] = useState<{
    loading: boolean;
    hasSmall: boolean;
    hasMedium: boolean;
    hasLarge: boolean;
    smallPath: string | null;
    mediumPath: string | null;
    largePath: string | null;
  }>({
    loading: true,
    hasSmall: false,
    hasMedium: false,
    hasLarge: false,
    smallPath: null,
    mediumPath: null,
    largePath: null,
  });

  const [generating, setGenerating] = useState<ThumbnailSize | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      setStatus((prev) => ({ ...prev, loading: true }));
      const thumbnailStatus = await getThumbnailStatus(imageId);
      setStatus({
        loading: false,
        hasSmall: thumbnailStatus.has_small,
        hasMedium: thumbnailStatus.has_medium,
        hasLarge: thumbnailStatus.has_large,
        smallPath: thumbnailStatus.small_path,
        mediumPath: thumbnailStatus.medium_path,
        largePath: thumbnailStatus.large_path,
      });
    } catch (err) {
      console.error("Failed to load thumbnail status:", err);
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    loadStatus();
  }, [imageId]);

  const handleGenerate = async (size: ThumbnailSize) => {
    try {
      setGenerating(size);
      setError(null);
      const result = await generateThumbnail(imageId, size);

      if (result.success) {
        await loadStatus();
      } else {
        setError(result.error || "生成失败");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateAll = async () => {
    try {
      setGenerating("small" as ThumbnailSize); // 使用一个标记表示全部生成中
      setError(null);
      await generateAllThumbnails(imageId);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setGenerating(null);
    }
  };

  const renderThumbnail = (size: ThumbnailSize, hasPath: boolean, path: string | null) => {
    const config = THUMBNAIL_SIZES[size];
    const isGenerating = generating === size;

    return (
      <div
        key={size}
        className="border rounded-lg p-4 flex flex-col items-center"
      >
        <h4 className="text-sm font-medium mb-2">
          {config.label} ({config.size}px)
        </h4>

        {hasPath && path ? (
          <div className="relative">
            <img
              src={convertFileSrc(path.replace(/\\/g, '/'))}
              alt={`${config.label} thumbnail`}
              className="max-w-full h-auto rounded"
              style={{ maxHeight: 150 }}
            />
          </div>
        ) : (
          <div className="w-32 h-24 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-sm">
            无缩略图
          </div>
        )}

        <button
          onClick={() => handleGenerate(size)}
          disabled={isGenerating || generating !== null}
          className={`mt-3 px-3 py-1 text-sm rounded ${
            hasPath
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-primary-500 text-white hover:bg-primary-600"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isGenerating ? "生成中..." : hasPath ? "重新生成" : "生成"}
        </button>
      </div>
    );
  };

  if (status.loading) {
    return (
      <div className={`p-4 ${className}`}>
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-4 ${className}`}>
      {imagePath && (
        <div className="mb-4 text-sm text-gray-600 truncate" title={imagePath}>
          原图: {imagePath}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {renderThumbnail("small", status.hasSmall, status.smallPath)}
        {renderThumbnail("medium", status.hasMedium, status.mediumPath)}
        {renderThumbnail("large", status.hasLarge, status.largePath)}
      </div>

      <div className="mt-4 flex justify-center">
        <button
          onClick={handleGenerateAll}
          disabled={generating !== null}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? "生成中..." : "生成所有尺寸"}
        </button>
      </div>
    </div>
  );
}

export default ThumbnailViewer;
