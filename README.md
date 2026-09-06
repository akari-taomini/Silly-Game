# SillyTavern 小游戏中心

一个纯前端、零后端依赖的 SillyTavern 第三方扩展。

## 当前游戏
- 💣 扫雷
- 🔢 2048
- 📦 推箱子
- 🔲 数独

## 这一版的改动
- UI 改为尽量跟随 SillyTavern 当前主题，不再固定黑色/紫色弹窗。
- 使用 SillyTavern 常见主题变量，如 `--SmartThemeBodyColor`、`--SmartThemeBlurTintColor`、`--SmartThemeBorderColor` 等。
- 扫雷保留清爽的白色棋盘格。
- 扫雷支持右键标记，以及“已翻开的数字 + 周围旗子数量正确 → 再次点击自动展开”。
- “重新开始”现在是原地重置游戏状态，不会重新复制一套 UI，也不会叠加事件监听。
- 2048、推箱子也使用原地重置。
- 游戏切换时会清理键盘事件监听。

## 安装
将本文件夹作为扩展安装，目录内第一层应直接包含：

```text
manifest.json
index.js
style.css
README.md
```

也可以将仓库 URL 直接用于 SillyTavern 的第三方扩展安装功能。

### 数独
标准 9×9 数独，支持简单 / 中等 / 困难三档。题目随机生成，并在出题时校验唯一解；支持鼠标、手机数字键盘和电脑 1–9 / Delete / 方向键操作。
