import { useState } from "react";
import { getSearchIndexStatus, rebuildSearchIndex } from "../api/search";
import { Search, ChevronUp } from "lucide-react";

interface SearchPanelProps {
  onSearchResults?: (results: any) => void;
  availableTags?: any[];
  className?: string;
}

export function SearchPanel({
  onSearchResults,
  availableTags = [],
  className = "",
}: SearchPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [indexStatus, setIndexStatus] = useState<{
    indexed: number;
    total: number;
    isUpToDate: boolean;
  } | null>(null);

  // 加载索引状态
  const loadIndexStatus = async () => {
    try {
      const status = await getSearchIndexStatus();
      setIndexStatus({
        indexed: status.indexed_count,
        total: status.total_images,
        isUpToDate: status.is_up_to_date,
      });
    } catch (error) {
      console.error("Failed to load index status:", error);
    }
  };

  // 重建索引
  const handleRebuildIndex = async () => {
    if (!confirm("重建索引可能需要一些时间，确定要继续吗？")) {
      return;
    }

    try {
      const count = await rebuildSearchIndex();
      alert(`索引重建完成，共索引 ${count} 张图片`);
      await loadIndexStatus();
    } catch (error) {
      console.error("Failed to rebuild index:", error);
      alert("索引重建失败");
    }
  };

  if (!isExpanded) {
    return (
      <div className={`p-2 ${className}`}>
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Search className="w-4 h-4" />
          <span>高级搜索...</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`p-4 border-b bg-gray-50 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-gray-700">搜索</h4>
        <button
          onClick={() => setIsExpanded(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* 索引状态 */}
      {indexStatus && (
        <div className="mb-3 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>索引: {indexStatus.indexed}/{indexStatus.total}</span>
            {!indexStatus.isUpToDate && (
              <button
                onClick={handleRebuildIndex}
                className="text-primary-500 hover:text-primary-600"
              >
                重建
              </button>
            )}
          </div>
        </div>
      )}

      {/* 搜索功能提示 */}
      <p className="text-xs text-gray-400">
        使用顶部搜索框进行全文搜索
      </p>
    </div>
  );
}

export default SearchPanel;
