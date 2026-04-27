import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Tag as TagType } from "../api/tags";
import { AddRegular } from "@fluentui/react-icons";
import {
  Input,
  tokens,
} from "@fluentui/react-components";
import { TagBadge } from "./TagBadge";

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
  const [pendingNewTags, setPendingNewTags] = useState<{ name: string; color: string }[]>([]);
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
    ) &&
    !pendingNewTags.some(
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
      // 检查是否已经在 pendingNewTags 中
      const alreadyPending = pendingNewTags.some(
        (tag) => tag.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (!alreadyPending) {
        const newPendingTag = { name: trimmedName, color: "#3b82f6" };
        setPendingNewTags((prev) => [...prev, newPendingTag]);
        onChange([...selectedTagIds], [...pendingNewTags.map((t) => t.name), trimmedName]);
      }
    }

    setInputValue("");
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  const removeTag = (tagId: number) => {
    onChange(
      selectedTagIds.filter((id) => id !== tagId),
      pendingNewTags.map((t) => t.name)
    );
  };

  const removePendingTag = (tagName: string) => {
    const updatedPending = pendingNewTags.filter((t) => t.name !== tagName);
    setPendingNewTags(updatedPending);
    onChange(selectedTagIds, updatedPending.map((t) => t.name));
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
    } else if (e.key === "Backspace" && !inputValue && pendingNewTags.length > 0) {
      removePendingTag(pendingNewTags[pendingNewTags.length - 1].name);
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

  // 当 availableTags 变化时，清理已经被创建成功的 pending tags
  useEffect(() => {
    setPendingNewTags((prev) =>
      prev.filter(
        (pending) =>
          !availableTags.some(
            (tag) => tag.name.toLowerCase() === pending.name.toLowerCase()
          )
      )
    );
  }, [availableTags]);

  return (
    <div ref={containerRef} className="relative">
      {/* 标签+输入容器 */}
      <div
        className="min-h-[34px] px-2 py-1 flex flex-wrap gap-1.5 rounded"
        style={{
          border: `1px solid ${tokens.colorNeutralStroke1}`,
          backgroundColor: tokens.colorNeutralBackground1,
        }}
      >
        {selectedTags.map((tag) => (
          <TagBadge
            key={tag.id}
            dismissible
            onDismiss={() => removeTag(tag.id)}
          >
            {tag.name}
          </TagBadge>
        ))}
        {pendingNewTags.map((tag) => (
          <TagBadge
            key={`pending-${tag.name}`}
            dismissible
            onDismiss={() => removePendingTag(tag.name)}
          >
            {tag.name}
          </TagBadge>
        ))}

        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(_, data) => {
            setInputValue(data.value);
            setIsOpen(true);
          }}
          onClick={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 && pendingNewTags.length === 0 ? placeholder : ""}
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
