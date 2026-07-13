# PhotoManager

一款本地优先的桌面照片管理器，面向需要整理相机、手机和存储卡照片的用户。项目使用 Tauri 2 将 React 界面与 Rust 本地能力结合起来；照片继续保存在普通文件夹中，索引、相册关系和缩略图则随工作区存放在本地。

> 当前版本为 `0.1.0`，仍处于早期开发阶段。建议先使用测试目录体验，并为重要照片保留独立备份。

## 功能概览

- **多工作区**：创建、打开和切换多个图库目录。每个工作区拥有独立的 SQLite 索引与缩略图缓存。
- **本地目录存储**：导入或移动照片时，文件会整理到工作区下的相册子目录，不会被封装进专有图库文件。
- **多种浏览方式**：提供瀑布流、列表和画廊三种视图，并记住上次选择。
- **检索与整理**：支持按文件名或拍摄参数搜索，按标签和评分筛选，以及收藏、评分、标签、批量移动和导出。
- **照片预览与对比**：灯箱支持前后切换、缩放、拖拽、快捷键和详细信息；图库可锁定一张照片作为对比基准。
- **存储卡导入**：自动检测包含 `DCIM` 的可移动设备，也可选择任意本地文件夹作为来源。
- **可视化分配相册**：在导入预览中使用“相册染色刷”点击或拖过照片，批量指定目标相册。
- **导入辅助**：提供重复检测、导入进度、文件名模板、可选的同步备份目录，以及可选的当前位置补充。
- **EXIF 与地图**：读取拍摄时间、相机、镜头、曝光参数和 GPS；带坐标的照片可在 Leaflet/OpenStreetMap 地图中查看。
- **回收站流程**：先在应用内软删除，可恢复或永久删除；清空应用垃圾桶时会尝试把文件移入操作系统回收站。

## 支持的文件格式

| 类型 | 扩展名 | 说明 |
| --- | --- | --- |
| 常规图片 | `.jpg`、`.jpeg`、`.png` | 支持读取、生成缩略图和预览 |
| RAW | `.arw`、`.cr2`、`.nef` | 使用文件内嵌 JPEG 生成预览；Windows 下还会优先尝试系统 Shell 缩略图缓存和已安装的编解码器 |

RAW 文件能否显示高质量预览，取决于相机文件是否包含可读取的内嵌 JPEG，以及操作系统上可用的缩略图提供程序。PhotoManager 当前并不进行完整 RAW 显影。

## 数据如何保存

工作区采用可直接查看和备份的目录结构：

```text
我的图库/
├─ 默认相册/
│  └─ 20260713_IMG_0001.jpg
├─ 旅行/
│  └─ 20260713_IMG_0002.arw
└─ .photomanager/
   ├─ metadata.db
   ├─ thumbnails/
   └─ import-previews/
```

- `metadata.db` 保存照片元数据、相册关系、评分、收藏、标签和删除状态。
- `thumbnails/` 与 `import-previews/` 是可重新生成的预览缓存。
- 已注册工作区的列表保存在 Tauri 的应用本地数据目录中；从工作区列表移除项目只会取消注册，不会删除图库目录或照片。
- 移动照片到另一相册会同时移动磁盘文件；若目标文件名冲突，会自动追加序号。

## 导入流程

1. 创建或打开一个工作区。
2. 打开导入向导，选择检测到的存储卡或浏览本地来源目录。
3. 在瀑布流、列表或画廊视图中检查照片；已检测到的重复项会被标记并默认排除。
4. 选择相册染色刷，点击或拖过照片来分配相册。未指定的照片进入“默认相册”。
5. 按需选择重命名规则、备份目录或“补充当前位置”。照片自身已有 GPS 时会优先保留 EXIF 坐标。
6. 确认后，应用把照片复制进工作区并更新本地索引。

重复检测综合使用来源文件名与大小，以及由文件大小和修改时间生成的指纹。它适合避免常见的重复导入，但不是内容级加密哈希校验。

可用的文件名模板为：

- `{time}_{original}`：拍摄时间与原文件名，例如 `153012_IMG_0001.jpg`
- `{date}_{time}`：拍摄日期与时间，例如 `2026-07-13_153012.jpg`
- `{original}`：保留原文件名主体

## 开发环境

### 前置要求

- Node.js `^20.19.0` 或 `>=22.12.0`（Vite 7 的要求）
- Rust stable 与 Cargo
- Tauri 2 对应的平台构建依赖
  - Windows：Microsoft C++ Build Tools、Windows SDK 和 WebView2
  - macOS/Linux：请按 Tauri 2 的平台前置要求安装系统依赖

### 启动桌面应用

```bash
git clone https://github.com/HelloLiYifei/PhotoManager.git
cd PhotoManager
npm ci
npm run tauri dev
```

如果只需要调试前端界面，可运行 `npm run dev`。此时浏览器中没有 Tauri 原生命令，工作区、文件选择和照片读写等功能无法完整使用。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run tauri dev` | 启动完整 Tauri 桌面开发环境 |
| `npm run test` | 运行 Vitest 前端测试 |
| `npm run lint` | 运行 ESLint |
| `npm run build` | 构建前端资源到 `dist/` |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 运行 Rust 测试 |
| `npm run tauri build` | 构建桌面应用与平台安装包 |

Tauri 构建产物位于 `src-tauri/target/release/`；安装包通常位于其 `bundle/` 子目录。

## 项目结构

```text
PhotoManager/
├─ src/
│  ├─ components/       # 工作区、相册、图库、导入、地图与灯箱界面
│  ├─ lib/              # 缩略图和预览加载逻辑
│  ├─ services/         # 前端到 Tauri command 的调用封装
│  └─ styles/           # 全局设计变量
├─ src-tauri/
│  ├─ src/commands.rs   # 暴露给前端的 Tauri 命令
│  ├─ src/db.rs         # SQLite 表结构、迁移与查询
│  ├─ src/import.rs     # 存储卡检测、扫描和导入
│  ├─ src/metadata.rs   # EXIF、RAW 内嵌预览与缩略图
│  ├─ src/media.rs      # 本地媒体自定义协议
│  ├─ src/workspace.rs  # 工作区注册与数据库连接
│  └─ src/scan.rs       # 工作区目录扫描
├─ public/              # 静态资源
└─ package.json         # 前端脚本与依赖
```

## 技术栈

- **桌面框架**：Tauri 2
- **前端**：React 19、Vite 7、Leaflet、Lucide React、CSS Modules
- **后端**：Rust、rusqlite、kamadak-exif、image、walkdir、trash、rfd
- **测试与质量**：Vitest、Testing Library、ESLint

## 已知边界

- 地图底图来自 OpenStreetMap，需要网络连接；底图不可用时，照片的 GPS 元数据仍保留在本地。
- 当前内置扫描格式仅限上表列出的六种扩展名。
- RAW 支持侧重元数据与内嵌预览，不等同于 Lightroom、Capture One 等软件的 RAW 解码和调色能力。
- 当前仓库尚未包含开源许可证文件。在许可证明确前，请不要假定代码可按 MIT 或其他开源许可证使用。
