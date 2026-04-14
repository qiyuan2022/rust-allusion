import { useState, useEffect } from "react";
import { X, Settings, FolderInput, Info, Upload, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getThumbnailDir, setThumbnailDir } from "../api/settings";

type TabId = "general" | "import" | "about";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TabItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const tabs: TabItem[] = [
  { id: "general", label: "通用", icon: <Settings className="w-4 h-4" /> },
  { id: "import", label: "导入", icon: <FolderInput className="w-4 h-4" /> },
  { id: "about", label: "关于", icon: <Info className="w-4 h-4" /> },
];

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[60vw] h-[500px] flex overflow-hidden">
        {/* 左侧 Tabs */}
        <div className="w-48 bg-gray-50 border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-800">设置</h2>
          </div>
          <nav className="flex-1 p-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-white text-primary-600 shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 flex flex-col">
          {/* 头部 */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h3 className="font-medium text-gray-800">
              {tabs.find((t) => t.id === activeTab)?.label}
            </h3>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 设置内容 */}
          <div className="flex-1 p-6 overflow-auto">
            {activeTab === "general" && <GeneralSettings />}
            {activeTab === "import" && <ImportSettings />}
            {activeTab === "about" && <AboutSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

// 通用设置
function GeneralSettings() {
  const [thumbDir, setThumbDir] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    getThumbnailDir().then(setThumbDir).catch(console.error);
  }, []);

  const handleSelectDir = async () => {
    try {
      const selected = await open({ directory: true });
      if (!selected || Array.isArray(selected)) return;

      setIsMoving(true);
      const result = await setThumbnailDir(selected);
      setThumbDir(result.new_dir);
      alert(`缩略图目录已更改，成功迁移 ${result.moved} 个文件${result.failed > 0 ? `，失败 ${result.failed} 个` : ""}`);
    } catch (error) {
      console.error("Failed to set thumbnail dir:", error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">界面设置</h4>
        
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700">启动时自动扫描</p>
            <p className="text-xs text-gray-500">应用启动时自动扫描所有位置</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700">深色模式</p>
            <p className="text-xs text-gray-500">切换应用主题色</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
          </label>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-4">缓存设置</h4>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-700">缩略图缓存</p>
              <p className="text-xs text-gray-500">自动清理超过 30 天的缓存</p>
            </div>
            <button className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              立即清理
            </button>
          </div>

          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 mr-4">
              <p className="text-sm text-gray-700">缩略图存储位置</p>
              <p className="text-xs text-gray-500 mt-0.5 break-all">{thumbDir || "加载中..."}</p>
            </div>
            <button
              onClick={handleSelectDir}
              disabled={isMoving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              {isMoving ? "迁移中..." : "更改目录"}
            </button>
          </div>
          <p className="text-xs text-gray-400">更改目录时会自动将现有缩略图文件迁移到新位置</p>
        </div>
      </div>
    </div>
  );
}

// 导入设置
function ImportSettings() {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleImportAllusion = async () => {
    try {
      setImporting(true);
      setImportResult(null);

      // 打开文件选择对话框
      const selected = await open({
        filters: [{
          name: "Allusion Backup",
          extensions: ["json"]
        }]
      });

      if (!selected) return;

      // 调用后端导入函数
      const result = await invoke("import_allusion_data", {
        filePath: selected
      });

      setImportResult(result);
    } catch (error) {
      console.error("Import failed:", error);
      setImportResult({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">数据导入</h4>
        
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1 mr-4">
            <p className="text-sm text-gray-700">Allusion 数据导入</p>
            <p className="text-xs text-gray-500 mt-0.5">
              从 Allusion 备份文件中导入标签数据。
            </p>
          </div>
          <button
            onClick={handleImportAllusion}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {importing ? "导入中..." : "选择文件"}
          </button>
        </div>

        {importResult && (
          <div className="p-4 bg-gray-50 rounded-lg">
            <h5 className="text-sm font-medium text-gray-900 mb-2">导入结果</h5>
            {importResult.error ? (
              <p className="text-sm text-red-600">{importResult.error}</p>
            ) : (
              <div className="space-y-1 text-sm text-gray-700">
                <p>已导入: {importResult.imported} 个文件</p>
                <p>已跳过: {importResult.skipped} 个文件</p>
                <p>错误: {importResult.errors?.length || 0} 个</p>
                <p>备份中有标签的文件: {importResult.backup_files_with_tags} 个</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-4">缩略图生成</h4>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-700">缩略图尺寸</label>
            <select className="mt-1 w-full px-3 py-2 bg-white border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
              <option value="small">小 (200px)</option>
              <option value="medium">中 (400px)</option>
              <option value="large">大 (800px)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// 关于页面
function AboutSettings() {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="w-16 h-16 bg-primary-100 rounded-xl mx-auto mb-4 flex items-center justify-center">
          <Settings className="w-8 h-8 text-primary-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Allusion RS</h3>
        <p className="text-sm text-gray-500 mt-1">版本 0.1.0</p>
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Tauri 版本</span>
          <span className="text-gray-700">2.x</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">React 版本</span>
          <span className="text-gray-700">18.x</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">数据库</span>
          <span className="text-gray-700">SQLite</span>
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="text-xs text-gray-400 text-center">
          © 2024 Allusion RS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
