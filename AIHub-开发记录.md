# AIHub 开发记录

## 项目位置
`C:\xxx\AIHub`

## 技术栈
Electron + Webview，单文件架构（index.html + main.js），打包为 app.asar

## 核心文件
- `index.html` — UI、样式、标签逻辑、右键菜单、CSS 注入、用量显示、内存监控
- `main.js` — Electron 窗口配置、IPC 通信、GPU 参数、上下文菜单转发、内存查询

## 修改方式
```bash
# 解包
npx asar extract "C:\xxx\AIHub\resources\app.asar" "C:\xxx\AIHub\resources\app"

# 修改 app 目录下的文件...

# 重新打包
npx asar pack "C:\xxx\AIHub\resources\app" "C:\xxx\AIHub\resources\app.asar"

# 删除解包目录
rm -rf "C:\xxx\AIHub\resources\app"
```

---

## 已完成功能

### 1. 标签页系统
- 3 个默认标签：ChatGPT、Gemini（`?hl=zh`）、NotebookLM
- Claude 和 Codex 不再作为默认标签，改为通过 + 按钮添加（减少内存占用）
- 标签页居中显示（flexbox 居中布局）
- 每个标签页有关闭按钮（×），hover 时显示
- 标签页可拖拽排序（dragstart/dragover/drop 事件）
- Ctrl+Tab / Ctrl+Shift+Tab 切换标签（通过 main.js `before-input-event` 拦截，webview 内也生效）
- 自定义 SVG 图标：
  - ChatGPT：内嵌 SVG path
  - NotebookLM：内嵌 SVG，填充白色，viewBox 裁剪为 `2 2.5 12 9.5` 放大显示
  - Codex：内嵌 SVG（从 chatgpt.com CDN sprite 提取的 symbol）
  - Gemini、Claude：使用 Google favicon 服务 `https://www.google.com/s2/favicons?domain=xxx&sz=32`
- 会话持久化：每个服务使用独立 `partition="persist:xxx"` 保持登录状态

### 2. 新建标签页（+ 按钮）
- 标签栏最右侧有 + 按钮
- 点击弹出深色下拉菜单，可选择打开 5 个站点之一（ChatGPT、Gemini、NotebookLM、Claude、Codex）
- 点击菜单外区域自动关闭（透明全屏遮罩层 `#dropdown-overlay` 实现，解决 webview 不冒泡问题）

### 3. 右键菜单
- 自定义深色样式右键菜单（非原生 Electron Menu，纯 HTML/CSS 实现）
- 菜单项顺序：Copy → Paste → Cut → Select All → 分隔线 → Copy URL → Reload
- 每项显示快捷键提示（如 Ctrl+C）
- 点击外部区域自动关闭（透明遮罩层 `#menu-overlay` 实现）
- 通过 IPC 通信执行操作：
  - webview 的 `context-menu` 事件 → 发送坐标和 webContents ID 到 renderer
  - renderer 显示自定义菜单 → 用户点击后发送 `context-menu-action` 到 main
  - main.js 根据 action 调用对应 webContents 方法（copy/paste/cut/selectAll/reload）
  - Copy URL：通过 `clipboard.writeText(wc.getURL())` 复制当前 webview 网址

### 4. 滚动条样式
- 通过 `webview.insertCSS()` 注入 CSS 到所有 webview
- 样式：5px 宽、半透明白色（`rgba(255,255,255,0.15)`）、圆角 3px
- 所有规则加 `!important` 确保覆盖网站自带样式
- 隐藏滚动条箭头按钮（`display: none`）
- 禁用 overscroll 回弹（`overscroll-behavior: none`）

### 5. 用量显示（电池指示器）
- 标题栏右侧（窗口控制按钮左边）显示 Claude 和 Codex 的用量
- 两个隐藏 webview（`claude-usage-wv` 和 `codex-usage-wv`）在后台加载用量页面
- 通过 `executeJavaScript()` 在隐藏 webview 中执行 DOM 抓取脚本
- 抓取页面中的文字匹配用量信息（如 "X out of Y"、"X / Y" 等模式）
- 显示为类似电池的进度条，颜色根据剩余量变化
- **重试机制**：`scrapeWithRetry()` 函数，最多重试 10 次，每次间隔 3 秒，解决 SPA 页面加载慢导致抓取失败的问题
- **刷新按钮**：↻ 按钮，点击后重新加载隐藏 webview 并重新抓取，带旋转动画反馈

### 6. 内存显示
- 标题栏显示当前应用总内存占用
- 通过 IPC 调用 main.js 的 `get-memory` handler
- 使用 WMI `Win32_PerfFormattedData_PerfProc_Process` 查询 `WorkingSetPrivate`（私有工作集），与任务管理器 "内存" 列完全一致
- 按进程名 `AIHub` 查询，使用 `execFile('powershell')` 避免 shell 转义问题
- 查询失败时 fallback 到 Electron 的 `app.getAppMetrics()` API
- 每 5 秒自动更新
- 颜色编码：正常白色，>1GB 橙色，>2GB 红色
- 显示格式：小于 1GB 显示 MB，大于等于 1GB 显示 GB（保留一位小数）

### 7. 性能优化
- **懒加载**：只有 ChatGPT 启动时加载 URL，其他 webview 使用 `data-src` 属性存储 URL，首次切换到该标签时才设置 `src` 加载
- **减少默认标签**：从 5 个默认标签减至 3 个（移除 Claude、Codex），降低启动内存
- **GPU 加速**（main.js command line switches）：
  - `enable-gpu-rasterization`：启用 GPU 光栅化
  - `enable-zero-copy`：零拷贝优化
  - `disable-features=ElasticOverscroll`：禁用 Chromium 弹性过度滚动
- CSS 注入不使用 `*` 通配符选择器，避免性能开销

---

## 开发历程

### 第一阶段：基础框架
1. 创建 Electron 应用，5 个标签页（ChatGPT、Gemini、NotebookLM、Claude、Codex）
2. 标签页居中显示，支持拖拽排序
3. Ctrl+Tab / Ctrl+Shift+Tab 快捷键切换

### 第二阶段：图标与 UI
1. NotebookLM 标签名称修正（原来写错了）
2. NotebookLM 图标：使用内嵌 SVG，改为白色填充，调整 viewBox 放大
3. Codex 图标：从 chatgpt.com CDN 的 SVG sprite 中提取对应 symbol
4. Gemini 网址修正为 `https://gemini.google.com/?hl=zh`

### 第三阶段：交互完善
1. 每个标签页添加关闭按钮（×）
2. 添加 + 按钮和下拉菜单，支持新建任意站点标签
3. 自定义深色右键菜单（Copy/Paste/Cut/Select All/Reload）
4. 下拉菜单和右键菜单点击外部区域自动关闭（透明遮罩层方案，解决 webview 事件不冒泡问题）
5. 右键菜单增加 Copy URL 功能

### 第四阶段：滚动与性能
1. 注入自定义滚动条 CSS（5px 半透明白色）
2. 修复 ChatGPT 页面底部上滑卡顿（`overscroll-behavior: none` + 禁用 ElasticOverscroll）
3. CSS 规则全部加 `!important` 确保覆盖
4. 去掉 `*` 通配符选择器减少性能开销

### 第五阶段：性能优化
1. 实现懒加载（`data-src` 模式），仅 ChatGPT 启动时加载
2. 启用 GPU 加速（gpu-rasterization、zero-copy）
3. 将 Claude 和 Codex 从默认标签移除，减少内存占用
4. 添加 `partition="persist:xxx"` 保持各站点登录状态

### 第六阶段：用量监控
1. 添加隐藏 webview 后台抓取 Claude 和 Codex 用量数据
2. 标题栏显示电池式用量指示器
3. 修复用量一直 "loading" 问题：添加 `scrapeWithRetry()` 重试机制（10 次，3 秒间隔）
4. 添加 ↻ 刷新按钮手动刷新用量，带旋转动画
5. 添加内存占用显示（`app.getAppMetrics()`），每 5 秒更新，颜色编码

### 第七阶段：布局优化
1. 去掉电池旁的百分比数字（hover tooltip 已包含详细信息，数字冗余）
2. 标签栏改为对称 padding（`0 140px`），初始 3 个标签真正居中
3. 移除了 `.usage-pct` 相关的 HTML、CSS 和 JS 代码

---

## Bug 修复记录

### main.js:81 多余闭合大括号（SyntaxError）
- **现象**：启动时弹窗报错 `A JavaScript error occurred in the main process`，`SyntaxError: Unexpected token '}'` 指向 `main.js:81`
- **原因**：将 `ipcMain.handle('get-memory')` 从 `createWindow()` 函数内移到函数外部时，遗留了一个多余的 `}`
- **修复**：删除第 81 行孤立的 `}`

### 右键菜单 Copy/Paste/Cut 无效（经历两轮修复）
- **现象**：右键菜单正常弹出，但点击 Copy、Paste、Cut 无反应
- **第一次修复**：去掉 IPC 中转，在 renderer 直接调用 webview 的 `.copy()` / `.paste()` 方法。仍然无效
- **根因**：点击菜单项时 `mousedown` 事件导致 webview 失焦、文本选区丢失，webview 的 `.copy()` 等方法找不到选区
- **最终修复**：
  1. 在 `ctxMenu` 和 `ctxOverlay` 上添加 `mousedown preventDefault`，阻止点击菜单时 webview 失焦
  2. Copy：通过 `executeJavaScript('window.getSelection().toString()')` 获取选中文本，写入 clipboard
  3. Cut：在 webview 中执行 `document.execCommand('delete')` 删除选区，同时写入 clipboard
  4. Paste：`wv.focus()` + `wv.insertText(clipboard.readText())` 直接插入文本
  5. 从 main.js 移除了不再需要的 `context-menu-action` IPC handler

### 内存显示虚高（经历两轮修复）
- **第一次**：界面显示 1.4GB，任务管理器仅 500MB
  - 原因：`app.getAppMetrics()` 的 `workingSetSize` 包含共享内存（Chromium DLLs），多进程重复计算约 3 倍虚高
  - 修复：改用 PowerShell 按 PID 查询 `PrivateMemorySize`（PM）
- **第二次**：界面显示 900MB，任务管理器仅 650MB
  - 原因：`PrivateMemorySize` 包含已换页到磁盘的私有内存，仍然偏高
  - 修复：改用 WMI `WorkingSetPrivate`（私有工作集），与任务管理器完全一致
  - 验证：WMI 返回 654904 KB ≈ 640MB，与任务管理器 650MB 吻合

---

## 已知问题
- 用量抓取依赖页面 DOM 结构，如果 Claude/Codex 网页改版可能需要更新抓取逻辑
- 登录状态有时丢失，可能与 Electron 的 cookie 策略或 app 路径变更有关
- 内存占用较高（多 webview 架构，每个 webview 相当于一个 Chromium 进程）
