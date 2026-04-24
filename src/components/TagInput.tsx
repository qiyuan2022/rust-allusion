import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Tag as TagType } from "../api/tags";
import { AddRegular } from "@fluentui/react-icons";
import {
  Input,
  Tag,
  TagGroup,
  tokens,
} from "@fluentui/react-components";

interface TagInputProps {
  availableTags: TagType[];
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

  const selectedTags = availableTags.filter((tag) => selectedTagIds.includes(tag.id));
  const unselectedTags = availableTags.filter((tag) => !selectedTagIds.includes(tag.id));

  const filteredTags = inputValue.trim()
    ? unselectedTags.filter((tag) =>
        tag.name.toLowerCase().includes(inputValue.toLowerCase())
      )
    : unselectedTags;

  const isNewTag =
    inputValue.trim() &&
    !availableTags.some(
      (tag) => tag.name.toLowerCase() === inputValue.trim().toLowerCase()
    );

  const addTag = (tagName: string) => {
    const trimmedName = tagName.trim();
    if (!trimmedName) return;

    const existingTag = availableTags.find(
      (tag) => tag.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingTag) {
      if (!selectedTagIds.includes(existingTag.id)) {
        onChange([...selectedTagIds, existingTag.id], []);
      }
    } else {
      onChange([...selectedTagIds], [trimmedName]);
    }

    setInputValue("");
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  const removeTag = (tagId: number) => {
    onChange(
      selectedTagIds.filter((id) => id !== tagId),
      []
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isOpen && filteredTags.length > 0) {
        addTag(filteredTags[highlightedIndex]?.name || inputValue);
      } else {
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
      removeTag(selectedTagIds[selectedTagIds.length - 1]);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [inputValue]);

  return (
    <div ref={containerRef} className="relative">
      {/* 标签+输入容器 */}
      <div
        className="min-h-[42px] p-2 flex flex-wrap gap-2 rounded"
        style={{
          border: `1px solid ${tokens.colorNeutralStroke1}`,
          backgroundColor: tokens.colorNeutralBackground1,
        }}
      >
        <TagGroup onDismiss={(_, data) => removeTag(Number(data.value))}>
          {selectedTags.map((tag) => (
            <Tag
              key={tag.id}
              dismissible
              value={String(tag.id)}
              size="small"
              style={{
                backgroundColor: `${tag.color}20`,
                color: tag.color,
              }}
            >
              {tag.name}
            </Tag>
          ))}
        </TagGroup>

        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(_, data) => {
            setInputValue(data.value);
            setIsOpen(true);
          }}
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ""}
          appearance="filled-lighter"
          style={{
            flex: 1,
            minWidth: "120px",
            backgroundColor: "transparent",
          }}
        />
      </div>

      {/* 下拉列表 */}
      {isOpen && (filteredTags.length > 0 || isNewTag) && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 rounded shadow-lg max-h-[200px] overflow-auto"
          style={{
            backgroundColor: tokens.colorNeutralBackground1,
            border: `1px solid ${tokens.colorNeutralStroke1}`,
          }}
        >
          {isNewTag && (
            <button
              type="button"
              onClick={() => addTag(inputValue)}
              className="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700"
              style={{ color: tokens.colorNeutralForeground1 }}
            >
              <AddRegular className="w-4 h-4 text-primary-500" />
              <span>
                新建标签 "<span className="font-medium">{inputValue.trim()}</span>"
              </span>
            </button>
          )}

          {filteredTags.map((tag, index) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => addTag(tag.name)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 ${
                index === highlightedIndex
                  ? "bg-gray-100 dark:bg-gray-700"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              style={{ color: tokens.colorNeutralForeground1 }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
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
