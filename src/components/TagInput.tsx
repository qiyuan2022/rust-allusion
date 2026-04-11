import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Tag } from "../api/tags";
import { X, Plus } from "lucide-react";

interface TagInputProps {
  availableTags: Tag[];
  selectedTagIds: number[];
  onChange: (tagIds: number[], newTagNames: string[]) => void;
  placeholder?: string;
}

export function TagInput({
  availableTags,
  selectedTagIds,
  onChange,
  placeholder = "输入标签名，回车添加...",
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取已选中的标签对象
  const selectedTags = availableTags.filter((tag) => selectedTagIds.includes(tag.id));

  // 过滤未选中的标签（用于下拉列表）
  const unselectedTags = availableTags.filter((tag) => !selectedTagIds.includes(tag.id));

  // 根据输入值过滤标签
  const filteredTags = inputValue.trim()
    ? unselectedTags.filter(
        (tag) =>
          tag.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : unselectedTags;

  // 检查输入是否是新标签
  const isNewTag =
    inputValue.trim() &&
    !availableTags.some(
      (tag) => tag.name.toLowerCase() === inputValue.trim().toLowerCase()
    );

  // 添加标签
  const addTag = (tagName: string) => {
    const trimmedName = tagName.trim();
    if (!trimmedName) return;

    // 查找是否已存在同名标签
    const existingTag = availableTags.find(
      (tag) => tag.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingTag) {
      // 如果标签已存在且未被选中，则选中它
      if (!selectedTagIds.includes(existingTag.id)) {
        onChange([...selectedTagIds, existingTag.id], []);
      }
    } else {
      // 创建新标签
      const newTagIds = [...selectedTagIds];
      const newTagNames: string[] = [];
      
      // 检查是否已经在 newTagNames 中（通过 onChange 回传的状态无法直接获取，需要父组件处理）
      // 这里简化处理，直接通知父组件创建新标签
      onChange(newTagIds, [trimmedName]);
    }

    setInputValue("");
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  // 移除标签
  const removeTag = (tagId: number) => {
    onChange(
      selectedTagIds.filter((id) => id !== tagId),
      []
    );
  };

  // 处理键盘事件
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && filteredTags.length > 0) {
        // 选择高亮的标签
        addTag(filteredTags[highlightedIndex]?.name || inputValue);
      } else {
        // 直接添加输入的内容
        addTag(inputValue);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      setHighlightedIndex((prev) =>
        prev < filteredTags.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Backspace" && !inputValue && selectedTagIds.length > 0) {
      // 删除最后一个标签
      removeTag(selectedTagIds[selectedTagIds.length - 1]);
    }
  };

  // 点击外部关闭下拉列表
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 当输入变化时重置高亮索引
  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputValue]);

  return (
    <div ref={containerRef} className="relative">
      {/* 已选标签区域 */}
      <div className="min-h-[42px] p-2 border rounded-lg bg-white flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-900 text-white text-sm rounded"
          >
            {tag.name}
            <button
              onClick={() => removeTag(tag.id)}
              className="hover:text-gray-300 focus:outline-none"
              type="button"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        
        {/* 输入框 */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] outline-none text-sm"
        />
      </div>

      {/* 下拉列表 */}
      {isOpen && (filteredTags.length > 0 || isNewTag) && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-[200px] overflow-auto">
          {/* 新建标签选项 */}
          {isNewTag && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 border-b"
            >
              <Plus className="w-4 h-4 text-primary-500" />
              <span>
                新建标签 "<span className="font-medium">{inputValue.trim()}</span>"
              </span>
            </button>
          )}
          
          {/* 现有标签列表 */}
          {filteredTags.map((tag, index) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag.name)}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                index === highlightedIndex ? "bg-gray-100" : ""
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: tag.color || "#3b82f6" }}
              />
              <span>{tag.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default TagInput;
