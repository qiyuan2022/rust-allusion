import { ReactNode, useState } from "react";
import { ChevronLeft } from "lucide-react";

interface LayoutProps {
  header: ReactNode;
  sidebar: ReactNode;
  mainContent: ReactNode;
}

export function Layout({ header, sidebar, mainContent }: LayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen flex bg-white dark:bg-gray-900">
      {/* 左侧边栏 - 可折叠 */}
      <aside 
        className={`flex-shrink-0 border-r dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden flex flex-col transition-all duration-300 ${
          isSidebarCollapsed ? "w-0 opacity-0" : "w-72 opacity-100"
        }`}
      >
        {sidebar}
      </aside>

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* 折叠/展开按钮 */}
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-50 w-5 h-10 bg-white dark:bg-gray-800 border dark:border-gray-600 rounded-r-md shadow-lg flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-gray-700 transition-all"
          style={{ marginLeft: isSidebarCollapsed ? '0' : '-1px' }}
          title={isSidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          <ChevronLeft 
            className={`w-3.5 h-3.5 transition-transform duration-300 ${isSidebarCollapsed ? "rotate-180" : ""}`}
          />
        </button>

        {/* 头部放在右侧内容区顶部 */}
        {header}
        
        {/* 主内容区 */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
          {mainContent}
        </main>
      </div>
    </div>
  );
}

export default Layout;
