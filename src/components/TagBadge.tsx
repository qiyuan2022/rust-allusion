import { ReactNode } from "react";

interface TagBadgeProps {
  children: ReactNode;
  className?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  tooltip?: string;
}

/**
 * 统一风格的标签徽章组件
 * 黑底白字风格（使用深灰而非纯黑，避免过于生硬）
 */
export function TagBadge({
  children,
  className = "",
  dismissible = false,
  onDismiss,
  tooltip,
}: TagBadgeProps) {

  return (
    <span
      className={`
        inline-flex items-center gap-0.5
        bg-black/60 backdrop-blur-sm
        text-white
        font-medium
        whitespace-nowrap
        text-xs px-1.5 rounded h-5
        ${className}
      `}
      data-tooltip={tooltip}
    >
      {children}
      {dismissible && onDismiss && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="ml-0.5 inline-flex items-center justify-center w-3 h-3 rounded-full
                     hover:bg-white/20 transition-colors cursor-pointer"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onDismiss();
            }
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 1L7 7M7 1L1 7"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
    </span>
  );
}

export default TagBadge;
