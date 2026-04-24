import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { FluentProvider, webLightTheme, webDarkTheme, type Theme } from '@fluentui/react-components';

// 自定义主题：覆盖为系统字体，确保 Fluent UI 组件与整体风格一致
const fontFamilyBase = '-apple-system, BlinkMacSystemFont, "Segoe UI Variable", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const customLightTheme: Theme = {
  ...webLightTheme,
  fontFamilyBase,
};

const customDarkTheme: Theme = {
  ...webDarkTheme,
  fontFamilyBase,
};

// 初始化主题（在渲染前执行，避免闪烁）
const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);

if (isDark) {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}

function Root() {
  const [theme, setTheme] = useState<Theme>(isDark ? customDarkTheme : customLightTheme);

  useEffect(() => {
    const el = document.documentElement;
    const update = () => {
      setTheme(el.classList.contains('dark') ? customDarkTheme : customLightTheme);
    };
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === 'class')) {
        update();
      }
    });
    observer.observe(el, { attributes: true });
    return () => observer.disconnect();
  }, []);

  return (
    <FluentProvider theme={theme}>
      <App />
    </FluentProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
