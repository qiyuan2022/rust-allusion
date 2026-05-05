import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Tag as TagType } from "../api/tags";
import {
  TagPicker,
  TagPickerControl,
  TagPickerInput,
  TagPickerGroup,
  TagPickerList,
  TagPickerOption,
} from "@fluentui/react-components";
import { AddRegular } from "@fluentui/react-icons";
import { TagBadge } from "./TagBadge";
// import { useGalleryStore } from "../stores/galleryStore";

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
  const [query, setQuery] = useState("");
  // 用一个统一的数组来驱动 TagPicker 的 selectedOptions
  const [allSelectedNames, setAllSelectedNames] = useState<string[]>([]);

  // 从外部 selectedTagIds 同步到内部状态
  useEffect(() => {
    const tagMapLocal = new Map(availableTags.map((t) => [t.id, t.name]));
    const existingNames = selectedTagIds
      .map((id) => tagMapLocal.get(id))
      .filter(Boolean) as string[];
    setAllSelectedNames(existingNames);
  }, [selectedTagIds, availableTags]);

  // 根据 allSelectedNames 拆分为现有标签 ID 和新标签名
  const resolveSelections = useCallback(
    (names: string[]) => {
      const tagIds: number[] = [];
      const newNames: string[] = [];
      for (const name of names) {
        const existing = availableTags.find(
          (t) => t.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) {
          tagIds.push(existing.id);
        } else {
          newNames.push(name);
        }
      }
      return { tagIds, newNames };
    },
    [availableTags],
  );

  // 未选中的标签（根据输入过滤）
  const filteredOptions = useMemo(() => {
    return availableTags.filter(
      (tag) => !allSelectedNames.includes(tag.name),
    );
  }, [availableTags, allSelectedNames]);

  const filteredAndQueried = useMemo(() => {
    if (!query.trim()) return filteredOptions;
    return filteredOptions.filter((tag) =>
      tag.name.toLowerCase().includes(query.toLowerCase()),
    );
  }, [filteredOptions, query]);

  // 按使用数量降序排序（后端已排序，但过滤后需要重新排序）
  const sortedOptions = useMemo(() => {
    return [...filteredAndQueried].sort((a, b) => {
      const countA = a.image_count ?? 0;
      const countB = b.image_count ?? 0;
      if (countB !== countA) return countB - countA;
      return a.name.localeCompare(b.name);
    });
  }, [filteredAndQueried]);

  // 是否存在可创建的新标签
  const isNewTag =
    query.trim() !== "" &&
    !availableTags.some(
      (t) => t.name.toLowerCase() === query.trim().toLowerCase(),
    ) &&
    !allSelectedNames.some(
      (n) => n.toLowerCase() === query.trim().toLowerCase(),
    );

  const handleOptionSelect = useCallback(
    (
      _e: unknown,
      data: { selectedOptions: string[]; value?: string },
    ) => {
      if (!data.value) return;

      const tagName = data.value;
      const isAlreadySelected = allSelectedNames.includes(tagName);

      let updatedNames: string[];
      if (isAlreadySelected) {
        // 取消选择 — 移除
        updatedNames = allSelectedNames.filter((n) => n !== tagName);
      } else {
        // 新增选择 — 追加到末尾（保持选择顺序）
        updatedNames = [...allSelectedNames, tagName];
      }

      setAllSelectedNames(updatedNames);
      const { tagIds, newNames } = resolveSelections(updatedNames);
      onChange(tagIds, newNames);
      // 不在这里清空 query，让 TagPicker 内部处理输入值
      // query 会在 onOpenChange 中或外部状态同步时清空
    },
    [allSelectedNames, resolveSelections, onChange],
  );

  // 处理 Tag 的 dismiss（点击 X 按钮移除）
  const handleDismiss = useCallback(
    (name: string) => {
      const updatedNames = allSelectedNames.filter((n) => n !== name);
      setAllSelectedNames(updatedNames);
      const { tagIds, newNames } = resolveSelections(updatedNames);
      onChange(tagIds, newNames);
    },
    [allSelectedNames, resolveSelections, onChange],
  );

  return (
    <TagPicker
      selectedOptions={allSelectedNames}
      onOptionSelect={handleOptionSelect}
      onOpenChange={(_e, data) => { if (!data.open) setQuery(""); }}
      positioning={{ position: "below", pinned: true }}
    >
      <TagPickerControl>
        <TagPickerGroup>
          {allSelectedNames.map((name) => (
            <TagBadge
              key={name}
              dismissible
              onDismiss={() => handleDismiss(name)}
            >
              {name}
            </TagBadge>
          ))}
        </TagPickerGroup>
        <TagPickerInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={allSelectedNames.length === 0 ? placeholder : ""}
        />
      </TagPickerControl>
      <TagPickerList style={{ maxHeight: 200, overflowY: 'auto' }}>
        {isNewTag && (
          <TagPickerOption
            value={query.trim()}
            text={query.trim()}
            className="!outline-none !border-0 !shadow-none !ring-0 focus:!outline-none focus-visible:!outline-none"
          >
            <div className="flex items-center gap-2">
              <AddRegular className="w-4 h-4 text-primary-500" />
              <span>
                新建标签 "
                <span className="font-medium">{query.trim()}</span>"
              </span>
            </div>
          </TagPickerOption>
        )}
        {sortedOptions.map((tag) => (
          <TagPickerOption key={tag.id} value={tag.name} text={tag.name}>
            <div className="flex items-center justify-between w-full">
              <TagBadge>{tag.name}</TagBadge>
              <span className="text-xs text-gray-400 ml-2">{tag.image_count ?? 0}</span>
            </div>
          </TagPickerOption>
        ))}
        {sortedOptions.length === 0 && !isNewTag && (
          <div className="px-3 py-2 text-sm text-gray-400">无匹配标签</div>
        )}
      </TagPickerList>
    </TagPicker>
  );
}

export default TagInput;