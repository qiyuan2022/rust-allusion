import { ReactNode } from "react";

interface LayoutProps {
  header: ReactNode;
  sidebar: ReactNode;
  mainContent: ReactNode;
  sidebarCollapsed?: boolean;
}

export function Layout({ header, sidebar, mainContent, sidebarCollapsed = false }: LayoutProps) {
  return (
    <div className="h-screen flex bg-white dark:bg-gray-900">
      {/* 左侧边栏 */}
      <aside 
        className={`flex-shrink-0 border-r dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "w-14" : "w-72"
        }`}
      >
        {sidebar}
      </aside>

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
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
