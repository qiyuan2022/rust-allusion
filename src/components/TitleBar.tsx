import { useState, useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  SubtractRegular,
  SquareRegular,
  SquareMultipleRegular,
  DismissRegular,
} from "@fluentui/react-icons";

interface HoverButtonProps {
  label: string;
  onClick: () => void;
  hoverClass: string;
  activeClass?: string;
  children: React.ReactNode;
}

function HoverButton({ label, onClick, hoverClass, children }: HoverButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={() => {
        onClick();
        setHovered(false);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={[
        "h-8 w-10 inline-flex items-center justify-center",
        "text-black dark:text-white",
        "transition-colors focus:outline-none",
        hovered ? hoverClass : "",
      ].join(" ")}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const window = getCurrentWebviewWindow();
    let unlisten: (() => void) | null = null;

    window.isMaximized().then(setIsMaximized);

    window
      .onResized(() => {
        window.isMaximized().then(setIsMaximized);
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  // 窗口从最小化/后台恢复时，强制重置所有 hover 状态
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "visible") {
        // 强制触发一次 mouseleave：在根元素上派发事件，让所有按钮的 onMouseLeave 触发
        document.querySelectorAll("[data-titlebar-btn]").forEach((btn) => {
          btn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
        });
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const handleMinimize = () => {
    getCurrentWebviewWindow().minimize();
  };

  const handleToggleMaximize = () => {
    getCurrentWebviewWindow().toggleMaximize();
  };

  const handleClose = () => {
    getCurrentWebviewWindow().close();
  };

  return (
    <div
      className="h-8 flex items-center bg-white dark:bg-gray-900 border-b dark:border-gray-700 select-none"
      data-tauri-drag-region
      style={{ ['WebkitAppRegion' as any]: 'drag' }}
    >
      {/* 左侧：可拖动区域 + 应用名 */}
      <div
        className="flex items-center gap-2 px-3 flex-1 min-w-0"
        style={{ ['WebkitAppRegion' as any]: 'drag' }}
      >
        <img
          src="/app-icon.png"
          alt="Rust Allusion"
          className="w-4 h-4 rounded-sm flex-shrink-0"
          draggable={false}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
          Rust Allusion
        </span>
      </div>

      {/* 右侧：窗口控制按钮（明确排除拖动区域） */}
      <div
        className="flex items-center flex-shrink-0"
        data-tauri-drag-region="no-drag"
        style={{ ['WebkitAppRegion' as any]: 'no-drag' }}
      >
        <div data-titlebar-btn>
          <HoverButton
            label="最小化"
            onClick={handleMinimize}
            hoverClass="bg-gray-100 dark:bg-gray-800"
          >
            <SubtractRegular className="w-4 h-4" />
          </HoverButton>
        </div>
        <div data-titlebar-btn>
          <HoverButton
            label={isMaximized ? "还原" : "最大化"}
            onClick={handleToggleMaximize}
            hoverClass="bg-gray-100 dark:bg-gray-800"
          >
            {isMaximized ? (
              <SquareMultipleRegular className="w-4 h-4" />
            ) : (
              <SquareRegular className="w-4 h-4" />
            )}
          </HoverButton>
        </div>
        <div data-titlebar-btn>
          <HoverButton
            label="关闭"
            onClick={handleClose}
            hoverClass="bg-red-500 text-white dark:bg-red-500 dark:text-white"
          >
            <DismissRegular className="w-4 h-4" />
          </HoverButton>
        </div>
      </div>
    </div>
  );
}

export default TitleBar;
