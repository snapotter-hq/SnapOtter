---
description: "SnapOtter 的 monorepo 结构、应用与包架构、请求生命周期以及资源占用。"
i18n_source_hash: 9e8f80499a37
i18n_provenance: human
i18n_output_hash: bc9e6a754251
---

# 架构 {#architecture}

SnapOtter 是一个使用 pnpm workspaces 和 Turborepo 管理的 monorepo。它以一个 3 容器的 Docker Compose 栈部署：SnapOtter 应用镜像、PostgreSQL 17 和 Redis 8。

## 项目结构 {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## 包 {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

基于 [Sharp](https://sharp.pixelplumbing.com/) 构建的核心图像处理库。它处理所有非 AI 操作：缩放、裁剪、旋转、翻转、转换、压缩、剥离元数据以及颜色调整（亮度、对比度、饱和度、灰度、棕褐色、反相、颜色通道）。

此包没有网络依赖，完全在进程内运行。

### `@snapotter/ai` {#snapotter-ai}

一个用于为 ML 操作调用 Python 脚本的桥接层。首次使用时，桥接层会启动一个常驻的 Python dispatcher 进程，预先导入重量级库（PIL、NumPy、MediaPipe、rembg），从而让后续的 AI 调用跳过导入开销。如果 dispatcher 尚未就绪，桥接层会回退到为每个请求生成一个全新的 Python 子进程。

**模型不会被预加载。** 每个工具脚本在请求时从磁盘加载其模型权重，并在请求结束时释放。完整的内存概况见[资源占用](#resource-footprint)。

支持的操作：背景移除（rembg/BiRefNet）、放大（RealESRGAN）、人脸模糊（MediaPipe）、人脸增强（GFPGAN/CodeFormer）、对象擦除（LaMa ONNX）、OCR（PaddleOCR/Tesseract）、上色（DDColor）、噪声移除、红眼移除、照片修复、证件照生成、透明度修复（BiRefNet HR-matting）以及内容感知缩放（Go caire 二进制）。

Python 脚本位于 `packages/ai/python/`。Docker 镜像会在构建期间预下载所有模型权重，因此容器可完全离线工作。

### `@snapotter/shared` {#snapotter-shared}

前端和后端共用的共享 TypeScript 类型、常量（如 `APP_VERSION` 和工具定义）以及 i18n 翻译字符串。

## 应用 {#applications}

### API（`apps/api`） {#api-apps-api}

一个 Fastify v5 服务器，暴露跨五种模态（image、video、audio、PDF、file）的 241 个工具路由，负责处理：
- 文件上传、临时工作区管理以及持久化文件存储
- 带版本链的用户文件库（`user_files` 表）——每个处理结果都会链接回其源文件，并记录所应用的工具，同时为 Files 页面自动生成缩略图
- 工具执行（将每个工具请求路由到图像引擎或 AI 桥接层）
- 流水线编排（顺序串联多个工具）
- 通过 BullMQ 作业队列进行带并发控制的批处理（池：image、media、ai、docs、system）
- 用户认证、RBAC（带完整权限集的 admin/user 角色）、API 密钥管理和限流
- 团队管理——仅限管理员的 CRUD；用户通过其个人资料上的 `team` 字段被分配到某个团队
- 运行时设置——`settings` 表中的键值存储，无需重新部署即可控制 `disabledTools`、`enableExperimentalTools`、`loginAttemptLimit` 及其他运维开关
- 通过数据库支持的设置实现自定义品牌化和运行时偏好
- 位于 `/api/docs` 的 Scalar/OpenAPI 文档
- 在生产环境中将构建后的前端作为 SPA 提供服务

关键依赖：Fastify、Drizzle ORM（pg-core、node-postgres）、Sharp、BullMQ、ioredis、用于校验的 Zod。

服务器在收到 SIGTERM/SIGINT 时会优雅关闭：排空 HTTP 连接、停止 BullMQ workers、关闭 Python dispatcher，并关闭数据库连接。

### Web（`apps/web`） {#web-apps-web}

一个使用 Vite 构建的 React 19 单页应用。使用 Zustand 进行状态管理，使用 Tailwind CSS v4 进行样式设计，使用 Lucide 提供图标。通过 REST 和 SSE（用于进度追踪）与 API 通信。

页面包括工具工作区、用于管理持久化上传和结果的 Files 页面、自动化/流水线构建器，以及管理员设置面板。

在生产环境中，构建后的前端由 Fastify 后端提供服务，因此 Docker 容器中没有单独的 web 服务器。

### 文档（`apps/docs`） {#docs-apps-docs}

即本 VitePress 站点。在推送到 `main` 时自动部署到 Cloudflare Pages。

## 一个请求如何流转 {#how-a-request-flows}

1. 用户在 web UI 中选择一个工具并上传一个文件。
2. 前端向 `/api/v1/tools/:section/:toolId` 发送一个包含文件和设置的 multipart POST。
3. API 路由使用 Zod 校验输入，然后分派处理。
4. 对于标准工具，作业会被入队到相应的 BullMQ 池（根据模态选择 image、media 或 docs）。进程内的 BullMQ worker 会根据 EXIF 元数据自动定向图像、运行该工具的处理函数并返回结果。
5. 对于 AI 工具，TypeScript 桥接层会向常驻的 Python dispatcher 发送请求（或作为回退生成一个全新的子进程），等待其完成，并读取输出文件。
6. 作业进度会被持久化到 PostgreSQL 中的 `jobs` 表，因此状态可在容器重启后保留。实时更新通过 `/api/v1/jobs/:jobId/progress` 处的 SSE 传递。
7. API 返回一个 `jobId` 和 `downloadUrl`。用户从 `/api/v1/download/:jobId/:filename` 下载处理后的文件。

对于流水线，API 将每一步的输出作为下一步的输入，按顺序运行它们。

对于批处理，API 使用带每步子作业的 BullMQ flows，并返回一个包含所有处理后文件的 ZIP 文件。

## 资源占用 {#resource-footprint}

SnapOtter 的设计目标是低空闲内存占用。启动时不会预加载或保持任何内容处于热态。

### 空闲时 {#at-idle}

Node.js/Fastify 进程、PostgreSQL 和 Redis 均在运行。三个容器（Node.js 进程、Postgres 和 Redis）合计的典型空闲 RAM 约为 **200-300 MB**。没有 Python 进程，内存中也没有模型权重。

### 什么会启动，以及何时启动 {#what-starts-and-when}

| 组件 | 何时启动 | 活动时的内存 |
|-----------|-------------|---------------------|
| Fastify 服务器 + Postgres + Redis | 容器启动 | 合计约 200-300 MB |
| BullMQ workers | 容器启动（进程内） | 每个池一个 worker（image、media、ai、docs、system） |
| Python dispatcher | 首个 AI 工具请求 | Python 解释器 + 预导入的库（PIL、NumPy、MediaPipe、rembg）——无模型权重 |
| AI 模型权重 | 特定工具的请求期间 | 从磁盘加载，请求结束时释放 |

### 模型加载 {#model-loading}

所有模型权重文件（合计数 GB）始终位于磁盘上的 `/opt/models/`。每个 AI 工具脚本仅在一次请求期间将其自身的模型加载到内存中，然后释放它们。有些脚本会在推理后显式调用 `del model` 和 `torch.cuda.empty_cache()`，以确保内存立即归还。

请求之间没有模型缓存。连续运行同一个 AI 工具每次都会重新加载模型。这以每次 AI 请求都有一次模型加载延迟为代价，让空闲内存保持接近于零。

### 首个 AI 请求的冷启动 {#first-ai-request-cold-start}

容器启动时 Python dispatcher 并未运行。首个 AI 请求会并行触发两件事：dispatcher 在后台开始预热，请求本身则回退到一次性的 Python 子进程生成。一旦 dispatcher 发出就绪信号，所有后续 AI 请求都会直接使用它，并跳过子进程生成的开销。
