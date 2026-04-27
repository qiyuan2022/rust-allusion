import { useState, useEffect } from "react";
import {
  DismissRegular,
  SettingsRegular,
  FolderArrowRightRegular,
  InfoRegular,
  ArrowUploadRegular,
  FolderOpenRegular,
} from "@fluentui/react-icons";
import {
  Dialog,
  DialogSurface,
  Button,
  TabList,
  Tab,
  Switch,
  Dropdown,
  Option,
  Divider,
  Text,
  Caption1,
  Subtitle1,
  Body1,
  Label,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getThumbnailDir, setThumbnailDir } from "../api/settings";
import { useGalleryStore } from "../stores/gallery";

const useStyles = makeStyles({
  surface: {
    maxWidth: "720px",
    width: "720px",
    height: "520px",
    padding: 0,
    overflow: "hidden",
  },
  container: {
    display: "flex",
    height: "100%",
  },
  sidebar: {
    width: "180px",
    display: "flex",
    flexDirection: "column",
    borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  sidebarHeader: {
    padding: "16px",
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  sidebarNav: {
    flex: 1,
    padding: "8px",
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  contentHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    padding: "16px 20px",
  },
  contentBody: {
    flex: 1,
    padding: "20px",
    overflow: "auto",
  },
  settingItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: "44px",
  },
  settingLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  aboutBox: {
    textAlign: "center",
    padding: "32px 0",
  },
  aboutIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "12px",
    backgroundColor: tokens.colorBrandBackground2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 16px",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 0",
  },
  dropdown: {
    maxWidth: "200px",
  },
});

type TabId = "general" | "import" | "about";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const styles = useStyles();

  return (
    <Dialog open={isOpen} onOpenChange={(_e, data) => data.open === false && onClose()}>
      <DialogSurface className={styles.surface}>
        <div className={styles.container}>
          {/* 左侧 Tabs */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
              <Subtitle1>设置</Subtitle1>
            </div>
            <div className={styles.sidebarNav}>
              <TabList
                vertical
                selectedValue={activeTab}
                onTabSelect={(_e, data) => setActiveTab(data.value as TabId)}
              >
                <Tab icon={<SettingsRegular fontSize={16} />} value="general">
                  通用
                </Tab>
                <Tab icon={<FolderArrowRightRegular fontSize={16} />} value="import">
                  导入
                </Tab>
                <Tab icon={<InfoRegular fontSize={16} />} value="about">
                  关于
                </Tab>
              </TabList>
            </div>
          </div>

          {/* 右侧内容 */}
          <div className={styles.content}>
            <div className={styles.contentHeader}>
              <Button
                appearance="subtle"
                icon={<DismissRegular fontSize={20} />}
                onClick={onClose}
              />
            </div>

            <div className={styles.contentBody}>
              {activeTab === "general" && <GeneralSettings />}
              {activeTab === "import" && <ImportSettings />}
              {activeTab === "about" && <AboutSettings />}
            </div>
          </div>
        </div>
      </DialogSurface>
    </Dialog>
  );
}

// 通用设置
function GeneralSettings() {
  const [thumbDir, setThumbDir] = useState<string>("");
  const [isMoving, setIsMoving] = useState(false);
  const { isDarkMode, setDarkMode } = useGalleryStore();
  const styles = useStyles();

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
      alert(
        `缩略图目录已更改，成功迁移 ${result.moved} 个文件${result.failed > 0 ? `，失败 ${result.failed} 个` : ""}`
      );
    } catch (error) {
      console.error("Failed to set thumbnail dir:", error);
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text weight="semibold">界面设置</Text>

        <div className={styles.settingItem}>
          <div className={styles.settingLabel}>
            <Body1>启动时自动扫描</Body1>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              应用启动时自动扫描所有位置
            </Caption1>
          </div>
          <Switch defaultChecked={false} />
        </div>

        <div className={styles.settingItem}>
          <div className={styles.settingLabel}>
            <Body1>深色模式</Body1>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              切换应用主题色
            </Caption1>
          </div>
          <Switch
            checked={isDarkMode}
            onChange={(_e, data) => setDarkMode(data.checked)}
          />
        </div>
      </div>

      <Divider />

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text weight="semibold">缓存设置</Text>

        <div className={styles.settingItem}>
          <div className={styles.settingLabel}>
            <Body1>缩略图缓存</Body1>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              自动清理超过 30 天的缓存
            </Caption1>
          </div>
          <Button appearance="secondary">立即清理</Button>
        </div>

        <div className={styles.settingItem}>
          <div className={styles.settingLabel} style={{ minWidth: 0, flex: 1 }}>
            <Body1>缩略图存储位置</Body1>
            <Caption1
              style={{
                color: tokens.colorNeutralForeground3,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "360px",
              }}
            >
              {thumbDir || "加载中..."}
            </Caption1>
          </div>
          <Button
            appearance="outline"
            icon={<FolderOpenRegular fontSize={16} />}
            onClick={handleSelectDir}
            disabled={isMoving}
            style={{ flexShrink: 0 }}
          >
            {isMoving ? "迁移中..." : "更改目录"}
          </Button>
        </div>
        <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
          更改目录时会自动将现有缩略图文件迁移到新位置
        </Caption1>
      </div>
    </div>
  );
}

// 导入设置
function ImportSettings() {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [thumbSize, setThumbSize] = useState("small");
  const styles = useStyles();

  const handleImportAllusion = async () => {
    try {
      setImporting(true);
      setImportResult(null);

      const selected = await open({
        filters: [
          {
            name: "Allusion Backup",
            extensions: ["json"],
          },
        ],
      });

      if (!selected) return;

      const result = await invoke("import_allusion_data", {
        filePath: selected,
      });

      setImportResult(result);
    } catch (error) {
      console.error("Import failed:", error);
      setImportResult({
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text weight="semibold">数据导入</Text>

        <div className={styles.settingItem}>
          <div className={styles.settingLabel}>
            <Body1>Allusion 数据导入</Body1>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              从 Allusion 备份文件中导入标签数据
            </Caption1>
          </div>
          <Button
            appearance="outline"
            icon={<ArrowUploadRegular fontSize={16} />}
            onClick={handleImportAllusion}
            disabled={importing}
          >
            {importing ? "导入中..." : "选择文件"}
          </Button>
        </div>

        {importResult && (
          <div
            style={{
              padding: "12px",
              backgroundColor: tokens.colorNeutralBackground2,
              borderRadius: tokens.borderRadiusMedium,
            }}
          >
            <Text weight="semibold" block style={{ marginBottom: "8px" }}>
              导入结果
            </Text>
            {importResult.error ? (
              <Body1 style={{ color: tokens.colorPaletteRedForeground1 }}>
                {importResult.error}
              </Body1>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <Caption1>已导入: {importResult.imported} 个文件</Caption1>
                <Caption1>已跳过: {importResult.skipped} 个文件</Caption1>
                <Caption1>错误: {importResult.errors?.length || 0} 个</Caption1>
                <Caption1>
                  备份中有标签的文件: {importResult.backup_files_with_tags} 个
                </Caption1>
              </div>
            )}
          </div>
        )}
      </div>

      <Divider />

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <Text weight="semibold">缩略图生成</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <Label>缩略图尺寸</Label>
          <Dropdown
            className={styles.dropdown}
            value={thumbSize}
            onOptionSelect={(_e, data) =>
              data.optionValue && setThumbSize(data.optionValue as string)
            }
          >
            <Option value="small">小 (200px)</Option>
            <Option value="medium">中 (400px)</Option>
            <Option value="large">大 (800px)</Option>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}

// 关于页面
function AboutSettings() {
  const styles = useStyles();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div className={styles.aboutBox}>
        <div className={styles.aboutIcon}>
          <SettingsRegular fontSize={32} style={{ color: tokens.colorBrandForeground1 }} />
        </div>
        <Subtitle1>Rust Allusion</Subtitle1>&nbsp;
        <Caption1 style={{ color: tokens.colorNeutralForeground3, marginTop: "4px" }}>
          0.1.0
        </Caption1>
      </div>

      <Divider />

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div className={styles.infoRow}>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>Tauri 版本</Caption1>
          <Caption1>2.x</Caption1>
        </div>
        <div className={styles.infoRow}>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>React 版本</Caption1>
          <Caption1>18.x</Caption1>
        </div>
        <div className={styles.infoRow}>
          <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>数据库</Caption1>
          <Caption1>SQLite</Caption1>
        </div>
      </div>

      <Divider />

      <Caption1 style={{ color: tokens.colorNeutralForeground3, textAlign: "center" }}>
        © 2024 Rust Allusion. All rights reserved.
      </Caption1>
    </div>
  );
}

export default SettingsDialog;
