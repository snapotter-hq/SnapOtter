---
description: "SnapOtter 的发行说明与版本历史。查看每个版本中的新增、改进和修复内容。"
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 84699e495397
---

# 更新日志 {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0 将图像工具箱升级为完整的文件处理套件：跨五种模态（图像、视频、音频、PDF 和文件）的 200+ 工具，基于 Postgres 17 和 Redis 支持的作业队列重建，并提供一条命令即可完成的 `docker run`。这是一次重大版本发布；从 1.x 升级之前，请先阅读“重大变更”部分。

### 新功能 {#new-features}

- **四种全新工具模态**：视频、音频、PDF 和文件加入图像模态，使工具目录达到 200+ 个工具。
- **持久化后台作业**：由 Redis 支持的队列（BullMQ）将每个工具作为可追踪的作业运行，并通过 SSE 实时反馈进度。
- **一体化单容器模式**：一条 `docker run` 即可启动一个内置 Postgres 和 Redis 的完整实例。
- **按需 AI 组件包**：背景移除、OCR、转录、放大、人脸检测与增强、对象擦除、上色以及照片修复均可从界面中安装。GPU 加速会按框架分别检测。
- **签署 PDF**：在浏览器中绘制、输入或上传签名，并将其放置到 PDF 上。
- **Automate（自动化）**：一个可视化的流水线构建器，用于串联多个工具，并附带九个预置模板。
- **83 个一键转换预设**：专用的 JPG-to-PNG、MP4-to-GIF 等转换器，支持模糊搜索。
- **基于图层的图像编辑器**：位于 `/editor` 的 Konva 驱动编辑器，具备画笔、形状、调整、滤镜和曲线功能。
- **文件库**：保存任意处理结果，并将其作为另一个工具的输入重复使用。
- 固定工具、画布内缩放与平移、21 种语言，以及企业级能力（OIDC/SSO、SAML、SCIM、S3 存储、按工具权限、审计导出、分布式追踪）。

### 改进 {#improvements}

- 可取消正在运行的处理过程。（#137）
- 通过 LibRaw 进行全分辨率 RAW 解码，包括 DNG。（#289）
- 支持非 root 及外部 UID 部署（TrueNAS、Unraid、OpenShift、PUID/PGID）。（#230, #127）
- 更准确的 AI 安装检测以及经过加固的安装流程。（#214, #352）
- 隐私加固：不再有任何自动的第三方外发请求，并新增可选的严格离线模式。
- 常驻反馈按钮，即使在关闭分析功能时也可用。

### Bug 修复 {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` 重新为工具路由禁用限流。（#271）
- 修复了 Docker 镜像内部的 AI 虚拟环境路径。（#390）
- 兼容 sharp 0.35.2+。（#362）
- 图像编辑器布局修复：标尺、填充行为、侧边栏和画布尺寸。（#258, #259）
- 完成了意大利语翻译。（#231, #206, #425）
- 音频归一化和 loudnorm 会保留源采样率。
- SSRF 加固：数值型 IPv6 CIDR 匹配以及更广泛的 URL 预扫描。（#287）
- 生成的 PDF 会将 SnapOtter 标注为 Producer。
- mediapipe 可在 Python 3.13 和 Debian 13 上安装。

### 重大变更 {#breaking-changes}

2.0 用 Postgres 17 替代了内置的 SQLite 数据库，并新增 Redis 8 用于作业队列。你的 1.x 数据会在首次启动时自动迁移，但容器栈发生了变化，因此请先备份整个 `/data` 卷（1.x 以 WAL 模式运行 SQLite，因此已提交的数据通常位于 `snapotter.db-wal`）。然后选择单容器镜像（内置 Postgres 和 Redis，仅限 root）或 Compose 栈（应用外加 Postgres 17 和 Redis 8）。请参阅[迁移指南](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md)和[升级指南](/zh-CN/guide/upgrading)。

### 升级 {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[在 GitHub 上查看完整 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

新增 HTML to Image 工具、WCAG 2.2 AA 无障碍支持、来自渗透测试的安全加固，以及 5 个关键的 Docker 修复。

### 新功能 {#new-features-1}

- **HTML to Image**：将 URL 或原始 HTML 截图保存为 PNG/JPEG/WebP。支持整页截图、自定义视口和深色模式。
- **Docker _FILE 密钥约定**：将敏感环境变量以文件形式挂载，而不是明文。（#205）
- **企业授权与 S3 存储**：可选的商业许可密钥和 S3 兼容对象存储。
- **形状编辑器改进**：填充/描边透明度、RGBA 取色器、虚线样式。
- **预构建发布归档**：从 GitHub Releases 下载 tarball，用于非 Docker 安装（Proxmox、裸机、LXC）。（#202）

### 改进 {#improvements-1}

- **WCAG 2.2 AA 无障碍支持**：跳过导航、焦点捕获、aria-live 区域、减弱动效支持，以及正确的对比度。（#209）
- **移动端响应式**：响应式设置、移动端切换标签页时 SSE 自动重连。（#203, #204）
- **背景移除质量**：边缘平滑、颜色去污以及输出格式选择。
- **意大利语翻译**：由 @albanobattistella 贡献约 145 条新字符串。（#206）
- **按工具 API 文档**：53 个包含参数、示例和响应格式的文档页面。
- **AI 模型下载**：针对 HuggingFace 的带指数退避的重试逻辑。（#201）

### Bug 修复 {#bug-fixes-1}

- 全新的 Docker 容器完全无法使用（限流拦截了所有请求）。
- 人脸检测类 AI 工具（blur-faces、red-eye-removal、enhance-faces、passport-photo）在所有平台上均失败。
- HEIC 文件在 ARM 上损坏（libheif 符号不匹配）。
- 放大和 restore-photo 的 AI 组件包在 ARM 上安装失败。
- OCR 在 GPU 容器上使用了错误的 CUDA 版本。
- 通过十六进制 IPv4 映射 IPv6 地址绕过 SSRF 防护。（鸣谢：@tonghuaroot）
- 带辅助图像的 iPhone HEIC 解码。（#183, #199）
- 8GB GPU 上的 Real-ESRGAN CUDA 内存溢出。（#200）
- 6 个生产环境 Sentry 错误和 7 个 QA bug。（#208）

### 安全 {#security}

- 处理了 10 个渗透测试发现的问题（XFF 绕过、畸形 JSON 崩溃、无界限流水线、审计日志 XSS、TRACE 方法等）。（#207）
- 阻止了 SSRF 十六进制 IPv6 绕过。（鸣谢：@tonghuaroot）
- Dockerfile 基础镜像按摘要固定。

### 升级 {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[在 GitHub 上查看完整 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

在线演示、按工具的落地页，以及一批打磨性修复。

### 新功能 {#new-features-2}

- **在线演示** - [demo.snapotter.com](https://demo.snapotter.com) 让人们无需安装任何东西即可试用 SnapOtter。
- **工具索引页** - 在 `/tools` 浏览全部 50+ 工具，支持搜索和分类筛选。
- **50+ SEO 落地页** - 现在每个工具都有专属落地页，包含常见问题、使用场景和对比表格。
- **背景预览** - 前后对比滑块会在透明图像后方显示棋盘格背景。
- **强密码生成器** - “添加成员”表单中的一键按钮。

### Bug 修复 {#bug-fixes-2}

- HEIC/HEIF 信息工具不再失败（已添加预解码）。
- AI 模型组件包安装会显示更清晰的错误消息，并遵守资源限制。
- 库中的缩略图可正确加载（此前缺少鉴权头）。
- 下拉菜单在“人员”和“团队”设置表格中不再被裁切。
- 在非压缩类工具上隐藏了尺寸对比百分比。
- 移除了重复的隐私政策链接。
- 为 AI 功能设置添加了意大利语翻译。
- 更新了重命名后的 Lucide 图标（Wand2、Columns）。

### 基础设施 {#infrastructure}

- OpenSSF Scorecard 从 4.3 加固到约 7.0。
- CI 测试并行拆分为 4 个分片，并使用了更小的测试固件。
- 41 项依赖更新。

### 升级 {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[在 GitHub 上查看完整 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

五个新工具、一个完整的图像编辑器、SSO 登录、20 种语言。本该分成三次单独发布，但事已至此。

### 新功能 {#new-features-3}

- **图像编辑器** - 图层、画笔、形状、调整、滤镜、曲线、键盘快捷键。在你的浏览器中运行，在你的硬件上处理。
- **OIDC / SSO 认证** - 使用 Google、GitHub、Okta 或任意 OpenID Connect 提供方登录。设置几个环境变量，你的团队即可使用已有账户。
- **表情包生成器** - 100 个内置模板，通过 opentype.js 渲染文本。也可上传你自己的图像。
- **Beautify（美化）** - 放入一张截图，得到一张精致的图像。设备边框（macOS、Windows、浏览器）、阴影、渐变、社交媒体预设。
- **色盲模拟** - 预览图像在红色盲、绿色盲、蓝色盲及其他色觉缺陷下的观感。
- **PNG 透明度修复器** - 检测伪透明 PNG，并使用 BiRefNet HR-matting 修复它们。可选通过 LaMa 图像修补移除水印。
- **AI 画布扩展** - 用 AI 填充扩展图像边界。三个质量档位（快速、平衡、高质量），取决于你愿意投入多少 GPU 时间。
- **20 种语言** - 阿拉伯语、简体/繁体中文、捷克语、荷兰语、法语、德语、印地语、印度尼西亚语、意大利语、日语、韩语、波兰语、葡萄牙语、俄语、西班牙语、泰语、土耳其语、乌克兰语、越南语。阿拉伯语支持 RTL。
- **URL 导入** - 将 URL 粘贴到拖放区，或从列表批量导入。带 SSRF 防护的服务端抓取。
- **多文件擦除器** - 在多张图像上绘制擦除蒙版，一键处理全部。笔画按图像分别保留。
- **流水线导入/导出** - 将工具链保存为 JSON，与他人分享。
- 通过 exiftool 支持 **17 种新的相机 RAW 格式**，另加 QOI、JP2、EPS、DDS、CUR、DPX、FITS、PPM/PGM/PBM、SVGZ 和 APNG 输入。新增 BMP、ICO、JP2、QOI 的输出编解码。AVIF、TIFF、GIF、JXL 和 PSD 导出从此前丢失的分支中恢复。

### 改进 {#improvements-2}

- **图像增强** - 用 CLAHE + normalise + gamma 替换了旧流水线。新的 Deep Enhance 开关使用 AI 模型以获得更激进的效果。
- **修复照片** - 划痕检测用 8 角度 Otsu 滤波重写。LaMa 图像修补现以原始分辨率运行。
- **处处支持特殊格式** - OCR、image-to-PDF、favicon 生成器、合成、拼接和矢量化现在均可解码 HEIC、RAW、PSD。
- **压缩** - 目标尺寸容差从 5% 收紧到 1%。目标尺寸成为默认模式。新增步进按钮和 KB/MB 单位选择器。
- **Sentry 清理** - 过滤了 644 个不可处理的事件。现在能正确处理真实错误。
- **GPU 检测** - 针对存在 CUDA 但没有 nvidia-smi 的容器提供更好的诊断。
- **禁用鉴权模式** - 在数据库中以 admin 角色播种匿名用户。API 密钥、流水线和用户文件不再因外键约束而中断。
- 跨单元、集成和 E2E 的 **2,705+ 项新测试**。

### Bug 修复 {#bug-fixes-3}

- CPU 上的放大在 NAS 设备和低功耗硬件上不再超时。
- 二维码 logo 不再使预览永久消失。
- 修复了高竖版图像的裁剪溢出。
- TIFF alpha 文件现在会正确强制 PNG 输出，而不是产生损坏。
- HDR/EXR 解码在 CLAHE 之前转换为 8 位，修复了解码失败。
- 人脸关键点的输入缓冲在进入 Python 边车之前转换为 PNG，修复了崩溃。
- 查找重复项可处理混合格式的批次和网络错误。
- Beautify 预览可实时更新。
- 为拼接和矢量化添加了进度条。
- SVGZ 由 SVG-to-raster 处理。
- 通过百分号编码的 X-File-Results 头修复了非 ASCII 文件名。

### 升级 {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

或使用 Docker Compose：

```bash
docker compose pull && docker compose up -d
```

[在 GitHub 上查看完整 diff](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

带 GPU 自动检测的统一 Docker 镜像。一个镜像同时处理 CPU 和 GPU 工作负载。将 compose 简化为带日志轮转的单文件。模型预下载现在包含校验和冒烟测试。

---

## v1.13.0 {#v1-13-0}

基于角色的访问控制（RBAC）。14 项细粒度权限、三个内置角色（admin、editor、user）、自定义角色支持。对所有 API 路由进行权限检查。前端标签页按用户权限过滤。

---

## v1.12.0 {#v1-12-0}

PDF to Image 工具。以自定义 DPI 将 PDF 页面转换为 PNG、JPEG、WebP 或 TIFF。带 GPU 自动检测的统一 Docker 镜像。

---

## v1.11.0 {#v1-11-0}

通过 vitepress-plugin-llms 自动生成 llms.txt，用于对 AI 友好的文档。

---

## v1.10.0 {#v1-10-0}

带人脸保护的内容感知缩放（seam carving）。在保留重要内容的同时缩放图像。

---

## v1.9.0 {#v1-9-0}

拼接 / 合并工具。将图像并排、竖向堆叠或以自定义网格拼接。

---

## v1.8.0 {#v1-8-0}

编辑元数据工具。查看并编辑 EXIF、IPTC 和 XMP 元数据，提供细粒度的剥离/保留界面。

---

## 更早的版本 {#older-releases}

若需包含补丁版本在内的完整提交级更新日志，请查看 [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases)。
