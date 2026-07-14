---
description: "AI 引擎参考，涵盖所有本地 ML 工具。抠图、放大、OCR、人脸检测、照片修复等。"
i18n_output_hash: bf13c82eb496
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# AI 引擎参考 {#ai-engine-reference}

`@snapotter/ai` 包协调本机工具和 Python 运行时以进行本地 ML 操作。 大多数 ML 工具使用持久的 Python sidecar 来实现快速热启动。 OCR 是故意分开的： `fast` 调用本机 Tesseract 二进制文件， 而 `balanced` 和 `best` 使用专用的持久性 JSONL dispatcher，固定到 `/data/ai/v3` 下的活动不可变 RapidOCR 代。 每个请求都包含一个 generation lease。 在升级期间，SnapOtter 在激活之前在候选者上运行 smoke test，自动切换到新的 dispatcher，然后在 garbage collection 之前耗尽旧代。

NVIDIA CUDA 由支持它的运行时自动检测和使用。 OCR 在每个主机上使用 CPU，包括具有 NVIDIA GPU 的系统，避免 CUDA 和该工具的驱动程序耦合。

目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 集成显卡加速 AI 推理。将 `/dev/dri` 映射到容器中并不会加速这些 Python 边车工具，除非有支持 CUDA 的 NVIDIA GPU 可用。

19 个 Python 边车 AI 工具，覆盖四种模态（图像、音频、视频、文档），另有 2 个具备可选 AI 能力的工具。所有模型均在本地运行，首次下载模型后无需联网。


<!-- korean-ocr-contract:start -->
::: info 韩语 OCR 兼容性
快速 OCR 支持 `auto`、`en`、`de`、`es`、`fr`、`zh` 和 `ja`，但不支持韩语 (`ko`)。韩语需要精确 OCR 包以及 `balanced` 或 `best`。该包可在官方 Linux amd64 和 arm64 容器上运行；即使是 NVIDIA 主机，OCR 仍使用 CPU。不受支持的系统会返回明确的兼容性错误，绝不会静默回退到 `fast`。韩语与 `fast` 或旧版 `tesseract` 别名的组合会在入队前以 `FEATURE_INCOMPATIBLE` 和 `fast-korean-unsupported` 拒绝。
:::
<!-- korean-ocr-contract:end -->
## 架构 {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

一个独立的 "docs" 调度器配置用文档处理脚本（`doc_pagecount`、`doc_health`、`doc_flatten`、`doc_redact`、`doc_text`、`doc_to_word`、`doc_metadata`、`doc_html_pdf`）替换了 AI 白名单，并跳过繁重的 ML 导入。

**超时：** 默认 300 秒；OCR 和 BiRefNet 抠图为 600 秒。

## 功能包 {#feature-bundles}

AI 模型按共享依赖栈打包，而不是每个工具一个归档。当多个工具使用同一模型系列、Python wheel 或原生库时，一个功能包可以启用多个工具。这样可以让发布用的 Docker 镜像更小，并避免重复存储相同的抠图、人脸检测、OCR、修复和语音模型副本。

Docker 镜像随附应用程序以及通用运行时。大型模型归档会按需下载到常驻的 `/data/ai` 卷中，然后供每个需要它的工具复用。如果某个包因为另一个工具需要而已经安装，那么启用一个新的依赖工具时不会再次下载该包。

大多数人工智能工具都需要一个或多个功能包才能运行。 管理 UI 通过 `POST /api/v1/admin/tools/:toolId/features/install` 工具安装这些包，它解析完整的捆绑包列表，跳过已安装的捆绑包，并仅对缺少的下载进行排队。 例如，在新实例队列 `background-removal` 和 `face-detection` 上启用 Passport Photo； 在已安装后台删除后启用它仅排队 `face-detection`。 OCR 是例外，因为 `fast` 不需要包装； 通过 UI 或 `POST /api/v1/admin/features/ocr/install` 安装其可选的精确运行时。

| 功能包 | 大小 | 共享依赖组 | 使用它的工具 |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet 抠图 | remove-background、passport-photo、transparency-fixer、background-replace、blur-background |
| `face-detection` | 200-300 MB | MediaPipe 人脸检测与关键点 | blur-faces、red-eye-removal、smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa 图像修复/外扩与 DDColor | erase-object、colorize、ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN、GFPGAN / CodeFormer、降噪 | upscale、enhance-faces、noise-removal |
| `photo-restoration` | 4-5 GB | 划痕修复与修复流水线 | restore-photo |
| `ocr` | ~208-234 MiB 下载 / ~409-488 MiB 安装 | 可选 RapidOCR 3.9.1、ONNX Runtime 1.20.1 和固定 PP-OCR 型号 | ocr、ocr-pdf（仅限 `balanced` 和 `best`） |
| `transcription` | ~600 MB | faster-whisper 语音转文本模型 | transcribe-audio、auto-subtitles |

具有跨包依赖的工具：

| 工具 | 所需功能包 | 原因 |
|------|------------------|-----|
| `passport-photo` | `background-removal`、`face-detection` | 先移除背景，然后使用人脸关键点将裁剪对齐到护照和证件照规则。 |
| `enhance-faces` | `upscale-enhance`、`face-detection` | 在对选定的人脸区域运行 GFPGAN 或 CodeFormer 增强之前先检测人脸。 |

仅当安装了工具所需的所有捆绑包（OCR 除外）后，该工具才可用：其内置 `fast` 层在没有可选 OCR 包的情况下仍然可用。 部分安装是有效的，并且是增量处理的：已安装的捆绑包被重用，丢失的捆绑包显示为下载，排队安装一次运行一个，因此共享的 Python 环境不会同时修改。

### 准确的 OCR 运行时安装{#accurate-ocr-runtime-installation}

准确的 OCR 包是官方 Linux amd64 或 Linux arm64 容器的特定于平台的运行时。 amd64 构建使用 Python 3.12； arm64 版本使用 Python 3.11。 两个版本都通过 ONNX Runtime 的 `CPUExecutionProvider` 运行 RapidOCR，因此同一包可在仅 CPU 和 NVIDIA Docker 主机上运行。 准确的运行时需要至少 4 GiB 的有效内存：配置的容器 cgroup 限制，否则为主机内存。 低于该签名兼容性最低值的系统在下载前会被拒绝。 此要求不适用于内置 Fast OCR。 Bare-metal 构建被拒绝，因为它们的 libc 和 Python ABI 无法安全推断； 当主机提供 Tesseract 和 Ghostscript 时，快速 OCR 保持可用。

可选工件大约压缩 208-234 MiB 并提取 409-488 MiB，具体取决于架构。 签名索引绑定安装程序强制执行的精确压缩和提取字节计数。 内置 Tesseract 在官方镜像上增加了约25个 MiB，并且不需要`/data/ai`中的文件。

在线安装会获取已签名的版本索引以及当前平台的精确内容寻址工件。 SnapOtter 在原子激活新一代之前验证 Ed25519 索引签名、工件大小、SHA-256 摘要、模型摘要、路径、文件模式和暂存 smoke test。 失败的安装会使之前的健康生成保持活动状态。

对于气隙安装，请使用名为 `index` 和 `archive` 的多部分字段将版本的 `ocr-runtime-index.json` 和匹配的 OCR 运行时存档上传到 `POST /api/v1/admin/features/import`。 离线导入应用与在线安装相同的签名、哈希、提取、兼容性和冒烟测试检查； 没有可信签名索引的存档将被拒绝。

---

## 抠图 {#background-removal}

**工具路由：** `remove-background`  
**模型：** 采用 BiRefNet（默认）或 U2-Net 变体的 rembg

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `model` | string | - | 模型变体（可选覆盖） |
| `backgroundType` | string | `"transparent"` | 其一：`transparent`、`color`、`gradient`、`blur`、`image` |
| `backgroundColor` | string | - | 纯色背景的十六进制颜色 |
| `gradientColor1` | string | - | 第一个渐变颜色 |
| `gradientColor2` | string | - | 第二个渐变颜色 |
| `gradientAngle` | number | - | 渐变角度（度） |
| `blurEnabled` | boolean | - | 启用背景模糊效果 |
| `blurIntensity` | number (0-100) | - | 模糊强度 |
| `shadowEnabled` | boolean | - | 为主体启用投影 |
| `shadowOpacity` | number (0-100) | - | 阴影不透明度 |
| `outputFormat` | string | - | 输出格式：`png`、`webp` 或 `avif` |
| `edgeRefine` | integer (0-3) | - | 边缘细化级别 |
| `decontaminate` | boolean | - | 移除边缘的颜色溢出 |

## 背景替换 {#background-replace}

**工具路由：** `background-replace`  
**模型：** rembg / BiRefNet（与 remove-background 共享）

移除背景并将其替换为纯色或渐变。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | 背景模式 |
| `color` | string | `"#ffffff"` | 背景十六进制颜色（当 `backgroundType` 为 `color` 时） |
| `gradientColor1` | string | - | 第一个渐变十六进制颜色 |
| `gradientColor2` | string | - | 第二个渐变十六进制颜色 |
| `gradientAngle` | integer (0-360) | `180` | 渐变角度（度） |
| `feather` | integer (0-20) | `0` | 边缘羽化半径 |
| `format` | `"png"` \| `"webp"` | `"png"` | 输出格式 |

## 背景模糊 {#blur-background}

**工具路由：** `blur-background`  
**模型：** rembg / BiRefNet（与 remove-background 共享）

在保持主体清晰的同时模糊背景。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | 模糊强度 |
| `feather` | integer (0-20) | `0` | 边缘羽化半径 |
| `format` | `"png"` \| `"webp"` | `"png"` | 输出格式 |

## 图像放大 {#image-upscaling}

**工具路由：** `upscale`  
**模型：** RealESRGAN（不可用时回退到 Lanczos）

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `scale` | number | `2` | 放大倍数 |
| `model` | string | `"auto"` | 模型变体 |
| `faceEnhance` | boolean | `false` | 应用 GFPGAN 人脸增强处理 |
| `denoise` | number | `0` | 降噪强度 |
| `format` | string | `"auto"` | 输出格式覆盖 |
| `quality` | number | `95` | 输出质量（1-100） |

## OCR / 文本提取 {#ocr-text-extraction}

**工具路由：** `ocr`  
**型号：** Tesseract (`fast`)； RapidOCR 与 PP-OCRv6 小型号（`balanced`）；具有校准变体评分的 PP-OCRv6 中型模型 (`best`)

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 动态的 | 省略 `quality` 和 `engine` 时，SnapOtter 会按 `best`、`balanced`、`fast` 的顺序选择可用的最高质量层。韩语绝不会选择 `fast`；它会使用 `best`，其次是 `balanced`，否则返回精确运行时的安装或兼容性错误。 |
| `language` | string | `"auto"` | 语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `enhance` | 布尔值 | 取决于层级 | 提高局部对比度。快速直接应用；仅当校准得分提高 OCR 时，准确的等级才会保留变体。默认为“最佳” |
| `engine` | 细绳 | - | 已弃用的兼容性别名。将 `tesseract` 映射到 `fast`，并将旧版 `paddleocr` 值映射到 `balanced`；它不加载 PaddlePaddle |

返回提取的文本以及来源元数据：引擎、请求的和实际的质量、设备、提供商、降级状态、警告和准确的运行时/模型版本（如果适用）。 明确的质量要求永远不会退回到另一层。 如果 `balanced` 或 `best` 不可用，则 API 返回 `FEATURE_NOT_INSTALLED` 或 `FEATURE_INCOMPATIBLE`，而不是静默运行 `fast`。

## PDF OCR {#pdf-ocr}

**工具路由：** `ocr-pdf`  
**模型：** 与图像 OCR 相同的档次体系

使用 AI 驱动的 OCR 逐页从扫描的 PDF 文档中提取文本。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | 动态的 | 省略 `quality` 和 `engine` 时，SnapOtter 会按 `best`、`balanced`、`fast` 的顺序选择可用的最高质量层。韩语绝不会选择 `fast`；它会使用 `best`，其次是 `balanced`，否则返回精确运行时的安装或兼容性错误。 |
| `language` | string | `"auto"` | 语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| `pages` | string | `"all"` | 页面选择：`"all"`、`"1-3"`、`"1,3,5"` |
| `enhance` | 布尔值 | 取决于层级 | 提高局部对比度。快速直接应用；仅当校准得分提高 OCR 时，准确的等级才会保留变体。默认为“最佳” |
| `engine` | 细绳 | - | 已弃用的兼容性别名。将 `tesseract` 映射到 `fast`，并将旧版 `paddleocr` 值映射到 `balanced`；它不加载 PaddlePaddle |

同样的不降级规则适用于 PDF OCR。 PDF 页面在识别前会进行光栅化处理，一次请求最多可以选择50个页面。

## 人脸 / PII 模糊 {#face-pii-blur}

**工具路由：** `blur-faces`  
**模型：** MediaPipe 人脸检测

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | 高斯模糊半径 |
| `sensitivity` | number (0-1) | `0.5` | 检测置信度阈值 |

## 人脸增强 {#face-enhancement}

**工具路由：** `enhance-faces`  
**模型：** GFPGAN、CodeFormer

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | 增强模型 |
| `strength` | number (0-1) | `0.8` | 增强强度 |
| `sensitivity` | number (0-1) | `0.5` | 人脸检测阈值 |
| `onlyCenterFace` | boolean | `false` | 仅增强最居中的人脸 |

## AI 上色 {#ai-colorization}

**工具路由：** `colorize`  
**模型：** DDColor（回退到 OpenCV DNN）

将黑白或灰度照片转换为全彩。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | 色彩饱和度强度 |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | 模型变体 |

## 噪点去除 {#noise-removal}

**工具路由：** `noise-removal`  
**模型：** SCUNet（分档降噪流水线）

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | 处理档次 |
| `strength` | number (0-100) | `50` | 降噪强度 |
| `detailPreservation` | number (0-100) | `50` | 保留多少细节；数值越高保留的纹理越多 |
| `colorNoise` | number (0-100) | `30` | 彩色噪点抑制强度 |
| `format` | string | `"original"` | 输出格式：`original`、`png`、`jpeg`、`webp`、`avif`、`jxl` |
| `quality` | number (1-100) | `90` | 输出编码质量 |

## 红眼消除 {#red-eye-removal}

**工具路由：** `red-eye-removal`

检测人脸关键点，定位眼部区域，并校正红色通道过饱和。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | 红色像素检测阈值 |
| `strength` | number (0-100) | `70` | 校正强度 |
| `format` | string | - | 输出格式覆盖（可选） |
| `quality` | number (1-100) | `90` | 输出质量 |

## 照片修复 {#photo-restoration}

**工具路由：** `restore-photo`

针对老旧或受损照片的多步流水线：划痕/撕裂检测与修复、人脸增强、降噪，以及可选的上色。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | 检测并修复划痕、撕裂 |
| `faceEnhancement` | boolean | `true` | 应用人脸增强处理 |
| `fidelity` | number (0-1) | `0.7` | 人脸增强强度（越高越保守） |
| `denoise` | boolean | `true` | 应用降噪处理 |
| `denoiseStrength` | number (0-100) | `25` | 降噪强度 |
| `colorize` | boolean | `false` | 修复后进行上色 |
| `colorizeStrength` | number (0-100) | `85` | 上色强度 |

## 护照照片 {#passport-photo}

**工具路由：** `passport-photo`  
**模型：** MediaPipe 人脸关键点 + BiRefNet 抠图

两阶段工作流：分析（检测人脸 + 移除背景），然后生成（裁剪、缩放、平铺）。支持横跨 6 个地区的 37+ 个国家/地区。

### 阶段 1：分析 {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

接受一个图像文件（multipart）。返回人脸关键点数据、一张 base64 预览图，以及图像尺寸。

### 阶段 2：生成 {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

接受一个 JSON 主体，其中包含阶段 1 的结果加上生成设置：

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `jobId` | string | （必填） | 来自阶段 1 的作业 ID |
| `filename` | string | （必填） | 来自阶段 1 的原始文件名 |
| `countryCode` | string | （必填） | ISO 国家/地区代码（例如 `US`、`GB`、`IN`） |
| `documentType` | string | `"passport"` | 证件类型 |
| `bgColor` | string | `"#FFFFFF"` | 背景颜色十六进制 |
| `printLayout` | string | `"none"` | 打印排版：`none`、`4x6`、`a4`、`letter` |
| `maxFileSizeKb` | number | `0` | 最大文件大小（KB）（0 = 无限制） |
| `dpi` | number (72-1200) | `300` | 输出 DPI |
| `customWidthMm` | number | - | 自定义宽度（毫米）（覆盖国家/地区规格） |
| `customHeightMm` | number | - | 自定义高度（毫米）（覆盖国家/地区规格） |
| `zoom` | number (0.5-3) | `1` | 缩放系数 |
| `adjustX` | number | `0` | 水平位置调整 |
| `adjustY` | number | `0` | 垂直位置调整 |
| `landmarks` | object | （必填） | 来自阶段 1 的关键点 |
| `imageWidth` | number | （必填） | 来自阶段 1 的图像宽度 |
| `imageHeight` | number | （必填） | 来自阶段 1 的图像高度 |

## 对象擦除（图像修复） {#object-erasing-inpainting}

**工具路由：** `erase-object`  
**模型：** 通过 ONNX Runtime 运行的 LaMa

蒙版作为**第二个文件部分**发送（字段名 `mask`），而不是作为 base64。蒙版中的白色像素表示要擦除的区域。`format` 和 `quality` 设置作为顶层表单字段发送。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `file` | file | （必填） | 源图像（multipart） |
| `mask` | file | （必填） | 蒙版图像（multipart，字段名 `mask`，白色 = 擦除） |
| `format` | string | `"auto"` | 输出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 输出质量 |

当有 NVIDIA GPU 可用时启用 CUDA 加速。

## AI 画布扩展 {#ai-canvas-expand}

**工具路由：** `ai-canvas-expand`  
**模型：** 基于 LaMa 的外扩

向任意方向扩展图像画布，并用与现有图像相匹配的 AI 生成内容填充新增区域。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | 顶部扩展的像素数 |
| `extendRight` | integer | `0` | 右侧扩展的像素数 |
| `extendBottom` | integer | `0` | 底部扩展的像素数 |
| `extendLeft` | integer | `0` | 左侧扩展的像素数 |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | 质量档次 |
| `format` | string | `"auto"` | 输出格式：`auto`、`png`、`jpg`、`jpeg`、`webp`、`tiff`、`gif`、`avif`、`heic`、`heif`、`jxl` |
| `quality` | integer (1-100) | `95` | 输出质量 |

至少有一个扩展方向必须大于 0。

## 智能裁剪 {#smart-crop}

**工具路由：** `smart-crop`  
**模型：** MediaPipe 人脸检测（仅人脸模式）

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | 裁剪策略：`subject`、`face`、`trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | 主体模式的策略 |
| `width` | integer | - | 输出宽度 |
| `height` | integer | - | 输出高度 |
| `padding` | integer (0-50) | `0` | 主体周围的内边距百分比 |
| `facePreset` | string | `"head-shoulders"` | 当 `mode=face` 时的预设取景 |
| `sensitivity` | number (0-1) | `0.5` | 人脸检测阈值 |
| `threshold` | integer (0-255) | `30` | 背景检测阈值（trim 模式） |
| `padToSquare` | boolean | `false` | 将裁剪结果补齐为正方形 |
| `padColor` | string | `"#ffffff"` | 正方形补齐的背景颜色 |
| `targetSize` | integer | - | 补齐输出的目标尺寸（像素） |
| `quality` | integer (1-100) | - | 输出质量 |

旧版 `mode` 值 `attention` 和 `content` 仍被接受，并分别映射到 `subject` 和 `trim`。

**人脸预设：**

| 预设 | 最适合 |
|--------|---------|
| `closeup` | 头像特写 |
| `head-shoulders` | 个人资料照片 |
| `upper-body` | LinkedIn / 正式照 |
| `half-body` | 完整上半身 |

## 音频转写 {#transcribe-audio}

**工具路由：** `transcribe-audio`  
**模型：** faster-whisper

将语音转换为文本。支持纯文本、SRT 和 VTT 输出格式。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | 输出格式 |

## 自动字幕 {#auto-subtitles}

**工具路由：** `auto-subtitles`  
**模型：** faster-whisper（从视频中提取音频，然后转写）

从视频的音轨生成字幕文件。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | 语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko`、`id`、`th`、`vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | 输出字幕格式 |

## PNG 透明度修复 {#png-transparency-fixer}

**工具路由：** `transparency-fixer`  
**模型：** BiRefNet HR-matting（2048x2048 分辨率）

修复"伪透明"PNG，即背景已被移除但残留了毛边、光晕或半透明杂影。使用 BiRefNet 的高分辨率抠图模型生成干净的 alpha 通道，然后应用可配置的去边处理以移除边缘的颜色污染。

**OOM 回退链：** 如果 BiRefNet HR-matting 超出可用内存，工具会自动回退到 `birefnet-general`，然后回退到 `u2net`。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | 边缘去边强度，用于移除颜色污染 |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | 输出图像格式 |
| `removeWatermark` | boolean | `false` | 应用水印移除预处理（中值滤波） |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## 具备可选 AI 能力的工具 {#tools-with-optional-ai-capabilities}

以下工具并非 Python 边车工具，但在启用某些选项时会使用 AI 功能。

### 图像增强 {#image-enhancement}

**工具路由：** `image-enhancement`  
**引擎：** 基于分析（Sharp 直方图与统计）

分析图像并对曝光、对比度、白平衡、饱和度、锐度和噪点应用自动校正。支持特定场景模式。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | 用于微调校正的场景模式 |
| `intensity` | number (0-100) | `50` | 整体校正强度 |
| `corrections.exposure` | boolean | `true` | 应用曝光校正 |
| `corrections.contrast` | boolean | `true` | 应用对比度校正 |
| `corrections.whiteBalance` | boolean | `true` | 应用白平衡校正 |
| `corrections.saturation` | boolean | `true` | 应用饱和度校正 |
| `corrections.sharpness` | boolean | `true` | 应用锐度校正 |
| `corrections.denoise` | boolean | `true` | 应用降噪 |
| `deepEnhance` | boolean | `false` | 通过 SCUNet 启用 AI 噪点去除（需要 `upscale-enhance` 功能包） |

在 `POST /api/v1/tools/image/image-enhancement/analyze` 处还提供一个额外的分析端点，它返回检测到的校正而不实际应用它们。

### 内容感知缩放（接缝裁剪） {#content-aware-resize-seam-carving}

**工具路由：** `content-aware-resize`  
**引擎：** Go `caire` 二进制文件（非 Python，无 GPU 收益）

通过移除低能量接缝智能地缩放图像，保留重要内容。

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `width` | number | - | 目标宽度 |
| `height` | number | - | 目标高度 |
| `protectFaces` | boolean | `false` | 保护检测到的人脸区域（需要 `face-detection` 功能包） |
| `blurRadius` | number (0-20) | `4` | 用于能量计算的预模糊 |
| `sobelThreshold` | number (1-20) | `2` | 边缘敏感度阈值 |
| `square` | boolean | `false` | 强制正方形输出 |
