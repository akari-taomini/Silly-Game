# Silly Game 2.3.0｜Tauri Tavern 兼容说明

本版按 TauriTavern 公开源码和宿主接口契约实现，兼容普通 SillyTavern。
没有 Tauri 实机验收，不能视为所有设备、历史版本和 API 渠道均已验证。

## API 与陪玩

- 等待 TT 宿主就绪；优先读取酒馆上下文，必要时从酒馆模块补载连接服务。
- 使用 ConnectionManagerRequestService，调用用户选择的已保存连接配置。模型、渠道、密钥和反代均由酒馆服务处理，小游戏不自行读取密钥、不切换当前 RP 连接。
- 按所参考的 TT 源码，只列出聊天补全类型的陪玩连接配置。该源码明确拒绝文本补全请求，因此不尝试绕过宿主限制。
- 新用户需自行选择配置；已选配置被删除或不受支持时，提示重选，不自动换成列表第一项。
- 过滤无效配置，保留有效配置；刷新按钮可重新等待并读取接口。连接管理器被禁用时显示具体提示。
- 请求设置 90 秒超时，并传递 AbortSignal。返回前检查实际经过时间；切回前台时处理已超时请求，避免无限等待。底层服务能否立即停止生成仍取决于 TT 和上游接口。
- 区分鉴权失败、限流、连接故障等常见错误；界面不展示原始渠道响应或密钥。保留现有游戏的本地 AI 回退。

## 角色、世界书与头像

- 支持 description 与 data.description 两种角色简介位置。
- 优先使用 unshallowCharacter 加载完整卡；接口缺失时使用酒馆兼容的 /api/characters/get 路由。
- 显式展开世界书或进入已选世界书角色的对局时，读取该卡关联的世界书；兼容内嵌条目和独立世界书文件。只把选中的单个条目放进陪玩提示词。
- 世界书读取失败允许重新展开重试。异步加载期间离开页面，不再把旧界面画回新页面。
- 保留宿主文件选择器；允许部分原生选择器返回空 MIME 的常见图片文件，仍须通过图片解码才能使用。HEIC 等格式能否解码取决于设备 WebView。

## 存档与移动端

- 原有 localStorage 存档格式和键保持不变。
- TT 提供 api.extension.store 时，在 namespace=silly-game、key=snapshot-v1 保存小游戏专用快照，不复制酒馆聊天、密钥或其他扩展数据。写入合并并顺序执行。
- 只有全部小游戏网页存档均不存在时，才从本地快照恢复；单独缺失的键不会被恢复，以免撤销玩家的重置操作。
- 本地备份读取失败时不覆盖已有快照，继续使用网页存档。备份异步执行；强制杀进程前最后一瞬间的写入不能保证完成。该备份不是跨设备同步功能。
- 在切后台、关闭浮窗时补存已经支持存档的游戏；不为原本没有持久存档的游戏虚构保存能力。
- 使用 TT 的 fullscreen-window 标记、Layout API、安全区域和 IME 变量；结合 visualViewport 调整面板高度，减少键盘遮挡。

## 更新

覆盖原扩展目录中的文件，完整重启/刷新酒馆。不要另装第二份，也不用清除数据。
ZIP 安装建议继续覆盖更新；Git 安装仍走酒馆 /api/extensions/* 兼容路由。
不对写入磁盘的扩展更新操作设置前端超时，避免后端仍在更新时误报失败。

## 范围与验证

本版保留 2.2.5 星星点击消除及 2.2.6 药水纯色改动。
按用户要求，只做一次 JavaScript 语法检查，没有运行测试套件、浏览器或 TT 实机验收。
tests 目录中原有检查脚本与结果属于历史版本，不是 2.3.0 验收结果。

## 对照源码

参考提交：a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375

- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/scripts/extensions/shared.js
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/scripts/st-context.js
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/docs/API/Extension.md
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/docs/FrontendHostContract.md
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/tauri/main/api/layout.js
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/scripts/tauritavern/layout-kit.js
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/tauri/main/routes/extensions-routes.js
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/tauri/main/routes/worldinfo-routes.js
- https://github.com/Darkatse/TauriTavern/blob/a1855be4a4f8b6ee7cd0374a84dbb3709c3e5375/src/tauri/main/routes/character-routes.js
