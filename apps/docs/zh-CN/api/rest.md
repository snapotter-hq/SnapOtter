---
description: "完整的 REST API 参考。工具端点、批处理、流水线、文件库、身份验证、团队以及管理操作。"
i18n_output_hash: c43973438a42
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# REST API 参考 {#rest-api-reference}

带请求/响应示例的交互式 API 文档见 [http://localhost:1349/api/docs](http://localhost:1349/api/docs)。

机器可读规范：
- `/api/v1/openapi.yaml` - OpenAPI 3.1 规范
- `/llms.txt` - 面向 LLM 的摘要
- `/llms-full.txt` - 完整的面向 LLM 的文档

## 身份验证 {#authentication}

除非 `AUTH_ENABLED=false`，否则所有端点都需要身份验证。

### 会话令牌 {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

会话在 7 天后过期（可通过 `SESSION_DURATION_HOURS` 配置）。

### API 密钥 {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

密钥以 `si_` 为前缀，并以 scrypt 哈希形式存储，原始密钥只显示一次，之后再也无法取回。

### 身份验证端点 {#auth-endpoints}

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | 公开 | 登录，获取会话令牌 |
| `POST` | `/api/auth/logout` | 需身份验证 | 销毁当前会话 |
| `GET` | `/api/auth/session` | 需身份验证 | 校验当前会话 |
| `POST` | `/api/auth/change-password` | 需身份验证 | 修改自己的密码（会使所有其他会话和 API 密钥失效） |
| `GET` | `/api/auth/users` | 管理员 | 列出所有用户 |
| `POST` | `/api/auth/register` | 管理员 | 创建新用户 |
| `PUT` | `/api/auth/users/:id` | 管理员 | 更新用户角色或团队 |
| `POST` | `/api/auth/users/:id/reset-password` | 管理员 | 重置用户密码 |
| `DELETE` | `/api/auth/users/:id` | 管理员 | 删除用户 |
| `GET` | `/api/v1/config/auth` | 公开 | 检查是否启用了身份验证（`{ authEnabled: bool }`） |
| `POST` | `/api/auth/mfa/enroll` | 需身份验证 | 开始 TOTP MFA 注册。需要企业版 `mfa` 功能 |
| `POST` | `/api/auth/mfa/verify` | 需身份验证 | 用 TOTP 验证码确认 MFA 注册 |
| `POST` | `/api/auth/mfa/complete` | 公开 | 完成待处理的 MFA 登录挑战 |
| `POST` | `/api/auth/mfa/disable` | 需身份验证 | 为当前用户禁用 MFA |
| `POST` | `/api/auth/users/:id/mfa/reset` | 管理员（`users:manage`） | 为用户重置 MFA |
| `GET` | `/api/auth/oidc/login` | 公开 | 启用 OIDC 时开始 OIDC 登录 |
| `GET` | `/api/auth/oidc/callback` | 公开 | OIDC 授权回调 |
| `GET` | `/api/auth/saml/metadata` | 公开 | 启用 SAML 时提供 SAML SP 元数据 XML |
| `GET` | `/api/auth/saml/login` | 公开 | 开始 SAML 登录 |
| `POST` | `/api/auth/saml/callback` | 公开 | SAML 断言消费者服务 |

当用户启用了 MFA 时，`POST /api/auth/login` 会返回 `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` 而不是会话令牌。将该 `mfaToken` 连同 TOTP 或恢复码一起发送到 `/api/auth/mfa/complete`。

### 权限 {#permissions}

| 权限 | 管理员 | 用户 |
|-----------|:-----:|:----:|
| 使用工具 | ✓ | ✓ |
| 自己的文件/流水线/API 密钥 | ✓ | ✓ |
| 查看所有用户的文件/流水线/密钥 | ✓ | - |
| 写入设置 | ✓ | - |
| 管理用户与团队 | ✓ | - |
| 管理品牌设置 | ✓ | - |

## 健康检查 {#health-check}

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | 公开 | 基础健康检查。数据库可用时返回 `{"status":"healthy","version":"..."}` 与 200，数据库不可达时返回 `{"status":"unhealthy"}` 与 503。 |
| `GET` | `/api/v1/readyz` | 公开 | 就绪探针。检查 PostgreSQL、Redis、磁盘空间，以及在配置了 S3 时检查 S3。当实例不应接收流量时返回 503。 |
| `GET` | `/api/v1/admin/health` | 管理员（`system:health`） | 详细诊断信息，包括运行时长、存储模式、数据库状态、队列状态以及 GPU 可用性。 |

## 使用工具 {#using-tools}

每个工具都遵循相同的模式：

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` 是 `image`、`video`、`audio`、`pdf` 或 `files` 之一。

- 上传为 `multipart/form-data`。
- `settings` 是一个包含工具专属选项的 JSON 字符串。
- `clientJobId` 是一个可选的表单字段，用于调用方提供的进度关联标识。
- `fileId` 是一个可选的表单字段，引用现有文件库项目。存在时，处理输出会保存为一个新版本，且响应中会包含 `savedFileId`。
- **快速工具** 通常返回 200 JSON：`{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`。从 `downloadUrl` 获取处理后的文件。
- **任何排队工具** 若为长时间运行或超过同步等待窗口，都可能返回 202 JSON：`{"jobId":"...","async":true}`。连接 SSE 获取进度，完成后再下载（参见 [进度跟踪](#progress-tracking)）。
- **批处理** 路由会直接以流式返回一个 ZIP 归档（带 `X-Job-Id` 头），适用于在通用批处理注册表中注册的工具。

## 工具参考 {#tools-reference}

### 转换预设 {#conversion-presets}

共享目录包含 83 个专用的转换预设端点，例如 `jpg-to-png`、`mov-to-mp4`、`m4a-to-mp3`、`pdf-to-jpg` 和 `excel-to-csv`。预设是一等的工具路由：

`POST /api/v1/tools/<section>/<presetId>`

每个预设锁定输出格式，并委托给某个基础工具，例如 `convert`、`convert-video`、`extract-audio`、`convert-audio`、`image-to-pdf`、`pdf-to-image`、`svg-to-raster` 或 `convert-spreadsheet`。完整的路由表和可选设置见 [转换预设](/zh-CN/tools/conversion-presets)。

### 基础工具 {#essentials}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `resize` | 调整尺寸 | `width`、`height`、`fit`（cover/contain/fill/inside/outside）、`percentage`、`withoutEnlargement`，另加 23 个社交媒体预设 |
| `crop` | 裁剪 | `left`、`top`、`width`、`height`、`unit`（px/percent） |
| `rotate` | 旋转与翻转 | `angle`、`horizontal`（bool）、`vertical`（bool） |
| `convert` | 转换 | `format`（jpg/png/webp/avif/tiff/gif/heic/heif）、`quality` |
| `compress` | 压缩 | `mode`（quality/targetSize）、`quality`（1–100）、`targetSizeKb` |

### 优化 {#optimization}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `optimize-for-web` | 网页优化 | `format`（webp/jpeg/avif/png）、`quality`、`maxWidth`、`maxHeight`、`progressive`、`stripMetadata` |
| `strip-metadata` | 去除元数据 | - |
| `edit-metadata` | 编辑元数据 | `title`、`description`、`author`、`copyright`、`keywords`、`gps`（lat/lon）、`dateTime` |
| `bulk-rename` | 批量重命名 | `pattern`（支持 `{n}`、`{date}`、`{original}`）、`startIndex`、`padding` |
| `image-to-pdf` | 图片转 PDF | `pageSize`（A4/Letter/...）、`orientation`、`margin`、`targetSize`（{value, unit}） |
| `favicon` | 网站图标生成器 | `padding`、`backgroundColor`、`borderRadius` - 生成所有标准尺寸 |

### 调整 {#adjustments}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `adjust-colors` | 调整颜色 | `brightness`、`contrast`、`exposure`、`saturation`、`temperature`、`tint`、`hue`、`sharpness`、`red`、`green`、`blue`、`effect`（none/grayscale/sepia/invert） |
| `sharpening` | 锐化 | `method`（adaptive/unsharp-mask/high-pass）、`sigma`、`m1`、`m2`、`x1`、`y2`、`y3`、`amount`、`radius`、`threshold`、`strength`、`kernelSize`（3/5）、`denoise`（off/light/medium/strong） |
| `replace-color` | 替换颜色 | `sourceColor`、`targetColor`（替换色）、`makeTransparent`、`tolerance` |
| `color-blindness` | 色盲模拟 | `simulationType`（protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy，默认 "deuteranomaly"） |
| `duotone` | 双色调 | `shadow`（hex）、`highlight`（hex）、`intensity`（0-100） |
| `pixelate` | 像素化 | `blockSize`（2-128）、`region`（{left, top, width, height}，用于局部像素化） |
| `vignette` | 暗角 | `strength`（0.1-1）、`color`（hex）、`radius`、`softness`、`roundness`、`centerX`、`centerY` |

### AI 工具 {#ai-tools}

所有 AI 工具都在你自己的硬件上运行：默认使用 CPU，或在有受支持的 NVIDIA GPU 时使用 NVIDIA CUDA。目前不支持通过 VA-API、Quick Sync 或 OpenCL 使用 Intel/AMD 核显进行 AI 推理加速。无需联网。

| 工具 ID | 名称 | AI 模型 | 主要设置 |
|---------|------|---------|-------------|
| `remove-background` | 移除背景 | rembg (BiRefNet / U2-Net) | `model`、`backgroundType`（transparent/color/gradient/blur/image）、`backgroundColor`、`gradientColor1`、`gradientColor2`、`gradientAngle`、`blurEnabled`、`blurIntensity`、`shadowEnabled`、`shadowOpacity` |
| `upscale` | 图片放大 | RealESRGAN | `scale`（2/4）、`model`、`faceEnhance`、`denoise`、`format`、`quality` |
| `erase-object` | 对象擦除 | LaMa (ONNX) | 蒙版作为第二个文件部分发送（字段名 `mask`）、`format`、`quality` |
| `ocr` | OCR / 文本提取 | Tesseract（快速）； RapidOCR + PP-OCR ONNX（平衡/最佳） | `quality`（快速/平衡/最佳）、`language`、`enhance` |
| `blur-faces` | 人脸 / PII 模糊 | MediaPipe | `blurRadius`、`sensitivity` |
| `smart-crop` | 智能裁剪 | MediaPipe + Sharp | `mode`（subject/face/trim）、`strategy`（attention/entropy）、`width`、`height`、`padding`、`facePreset`（closeup/head-shoulders/upper-body/half-body）、`sensitivity`、`threshold`、`padToSquare`、`padColor`、`targetSize`、`quality` |
| `image-enhancement` | 图片增强 | 基于分析 | `mode`（auto/exposure/contrast/color/sharpness）、`strength` |
| `enhance-faces` | 人脸增强 | GFPGAN / CodeFormer | `model`（gfpgan/codeformer）、`strength`、`sensitivity`、`centerFace` |
| `colorize` | AI 上色 | DDColor | `intensity`、`model` |
| `noise-removal` | 降噪 | 分级降噪 | `tier`（quick/balanced/quality/maximum）、`strength`、`detailPreservation`、`colorNoise`、`format`、`quality` |
| `red-eye-removal` | 去红眼 | 人脸关键点 + 颜色分析 | `sensitivity`、`strength` |
| `restore-photo` | 照片修复 | 多步流水线 | `mode`（auto/light/heavy）、`scratchRemoval`、`faceEnhancement`、`fidelity`、`denoise`、`denoiseStrength`、`colorize` |
| `passport-photo` | 证件照 | MediaPipe 关键点 | 两阶段流程。分析使用 multipart `file`；生成使用带 `countryCode`、`bgColor`、`printLayout`（none/4x6/a4）、关键点、图片尺寸的 JSON |
| `content-aware-resize` | 内容感知调整尺寸 | 接缝裁剪 (caire) | `width`、`height`、`protectFaces`、`blurRadius`、`sobelThreshold`、`square` |
| `transparency-fixer` | PNG 透明度修复 | BiRefNet HR-matting | `defringe`（0-100）、`outputFormat`（png/webp） |
| `background-replace` | 背景替换 | rembg (BiRefNet) | `backgroundType`（color/gradient）、`color`（hex）、`gradientColor1`、`gradientColor2`、`gradientAngle`、`feather`（0-20）、`format`（png/webp） |
| `blur-background` | 背景模糊 | rembg (BiRefNet) | `intensity`（1-100）、`feather`（0-20）、`format`（png/webp） |
| `ai-canvas-expand` | AI 画布扩展 | LaMa (outpainting) | `extendTop`、`extendRight`、`extendBottom`、`extendLeft`（px）、`tier`（fast/balanced/high）、`format`、`quality` |

### 水印与叠加 {#watermark-overlay}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `watermark-text` | 文字水印 | `text`、`font`、`fontSize`、`color`、`opacity`、`position`、`rotation`、`tile` |
| `watermark-image` | 图片水印 | `opacity`、`position`、`scale` - 第二个文件是水印 |
| `text-overlay` | 文字叠加 | `text`、`font`、`fontSize`、`color`、`x`、`y`、`background`、`padding`、`borderRadius` |
| `compose` | 图片合成 | `x`、`y`、`opacity`、`blend` - 第二个文件叠在上层 |
| `meme-generator` | 表情包生成器 | `templateId`、`textLayout`（top-bottom/top-only/bottom-only/center/side-by-side）、`textBoxes`（[{id, text}]）、`fontFamily`（anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto）、`fontSize`、`textColor`、`strokeColor`、`textAlign`、`allCaps`。支持模板模式（带 `templateId` 的 JSON 请求体）或自定义图片模式（带文件的 multipart）。 |

### 实用工具 {#utilities}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `info` | 图片信息 | -（返回宽度、高度、格式、大小、通道数、hasAlpha、DPI、EXIF） |
| `compare` | 图片对比 | `mode`（side-by-side/overlay/diff）、`diffThreshold` - 第二个文件是对比目标 |
| `find-duplicates` | 查找重复 | `threshold`（感知哈希距离，默认 8）- 多文件 |
| `color-palette` | 调色板 | `count`（主色数量）、`format`（hex/rgb） |
| `qr-generate` | 二维码生成器 | `data`、`size`、`margin`、`colorDark`、`colorLight`、`errorCorrectionLevel`、`dotStyle`、`cornerStyle`、`logo`（可选文件） |
| `barcode-read` | 条形码识别 | -（自动识别 QR、EAN、Code128、DataMatrix 等） |
| `image-to-base64` | 图片转 Base64 | `format`（data-uri/plain）、`mimeType` |
| `html-to-image` | HTML 转图片 | `url`、`format`（png/jpg/webp）、`quality`、`fullPage`、`devicePreset`（desktop/tablet/mobile/custom）、`viewportWidth`、`viewportHeight` |
| `histogram` | 直方图 | `scale`（linear/log）- 返回 RGB 直方图图表 + 各通道统计 |
| `lqip-placeholder` | LQIP 占位图 | `width`（4-64）、`blur`、`strategy`（blur/pixelate/solid）、`format`（webp/png/jpeg）、`quality` |
| `barcode-generate` | 条形码生成器 | `text`、`type`（code128/ean13/upca/code39/itf14/datamatrix）、`scale`（1-8）、`includeText`（bool）。JSON 请求体，无需上传文件。 |

### 布局与合成 {#layout-composition}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `collage` | 拼贴 / 网格 | `template`（25+ 种布局）、`gap`、`backgroundColor`、`borderRadius` - 多文件 |
| `stitch` | 拼接 / 合并 | `direction`（horizontal/vertical/grid）、`gap`、`backgroundColor`、`alignment` - 多文件 |
| `split` | 图片分割 | `mode`（grid/rows/cols）、`rows`、`cols`、`tileWidth`、`tileHeight` |
| `border` | 边框与相框 | `width`、`color`、`style`（solid/gradient/pattern）、`borderRadius`、`padding`、`shadow` |
| `beautify` | 美化截图 | `backgroundType`（solid/linear-gradient/radial-gradient/image/transparent）、`gradientStops`、`padding`、`borderRadius`、`shadowPreset`、`frame`（none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...）、`socialPreset`（none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt）、`watermarkText`、`outputFormat` |
| `circle-crop` | 圆形裁剪 | `zoom`（1-5）、`offsetX`、`offsetY`、`borderWidth`、`borderColor`、`background`（transparent/hex）、`outputSize` |
| `image-pad` | 图片留白 | `target`（16:9/9:16/1:1/4:3/3:4/custom）、`ratioW`、`ratioH`、`background`（color/transparent/blur）、`color`（hex）、`padding`（0-50%） |
| `sprite-sheet` | 精灵图 | `columns`（1-16）、`padding`、`background`（hex）、`format`（png/webp/jpeg）、`quality` - 多文件（2-64 张图片） |

### 格式与转换 {#format-conversion}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `svg-to-raster` | SVG 转位图 | `format`（png/jpeg/webp/avif/tiff/gif/heif）、`width`、`height`、`scale`、`dpi`、`background` |
| `vectorize` | 图片转 SVG | `colorMode`（bw/color）、`threshold`、`colorPrecision`、`filterSpeckle`、`pathMode`（none/polygon/spline） |
| `gif-tools` | GIF 工具 | `action`（resize/optimize/reverse/speed/extract-frames/rotate/add-text）、动作专属参数 |
| `gif-webp` | GIF/WebP 转换器 | `quality`（1-100）、`lossless`（bool）、`resizePercent`（10-100） |

### 视频工具 {#video-tools}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `convert-video` | 转换视频 | `format`（mp4/mov/webm/avi/mkv）、`quality`（high/balanced/small） |
| `compress-video` | 压缩视频 | `quality`（light/balanced/strong）、`resolution`（original/1080p/720p/480p） |
| `trim-video` | 裁剪视频（时长） | `startS`、`endS`、`precise`（bool，逐帧精确剪切） |
| `mute-video` | 视频静音 | - |
| `video-to-gif` | 视频转 GIF | `fps`（1-30）、`width`、`startS`、`durationS`（最长 60 秒） |
| `resize-video` | 调整视频尺寸 | `width`、`height`、`preset`（custom/2160p/1440p/1080p/720p/480p/360p） |
| `crop-video` | 裁剪视频（画面） | `width`、`height`、`x`、`y` |
| `rotate-video` | 旋转视频 | `transform`（cw90/ccw90/180/hflip/vflip） |
| `change-fps` | 更改帧率 | `fps`（1-120） |
| `video-color` | 视频调色 | `brightness`、`contrast`、`saturation`、`gamma` |
| `video-speed` | 视频速度 | `factor`（0.25-4）、`keepPitch`（bool） |
| `reverse-video` | 倒放视频 | -（最长 5 分钟） |
| `video-loudnorm` | 音频归一化 | -（EBU R128） |
| `aspect-pad` | 比例留白 | `target`（16:9/9:16/1:1/4:3/3:4）、`color`（hex） |
| `blur-pad` | 模糊留白 | `target`（16:9/9:16/1:1/4:3/3:4）、`blur`（2-50） |
| `watermark-video` | 视频加水印 | `text`、`position`、`fontSize`、`opacity`、`color` |
| `stabilize-video` | 视频防抖 | `smoothing`（5-60，以帧计） |
| `gif-to-video` | GIF 转视频 | `format`（mp4/webm/mov） |
| `video-to-webp` | 视频转 WebP | `fps`、`width`、`quality`、`loop`（bool） |
| `video-to-frames` | 视频转帧 | `mode`（all/nth/timestamps）、`n`、`timestamps`、`format`（png/jpg） |
| `merge-videos` | 合并视频 | -（多文件，归一化到第一个视频的分辨率） |
| `replace-audio` | 替换音频 | -（视频 + 音频文件，两个文件） |
| `burn-subtitles` | 烧录字幕 | `fontSize`（8-72）- 视频 + 字幕文件 |
| `embed-subtitles` | 嵌入字幕 | `language`（ISO 639-2/B 代码）- 视频 + 字幕文件 |
| `extract-subtitles` | 提取字幕 | -（输出 SRT） |
| `images-to-video` | 图片转视频 | `secondsPerImage`（0.5-10）、`resolution`（1080p/720p/square）、`fps` - 多文件 |
| `video-metadata` | 清理视频元数据 | - |
| `auto-subtitles` | 自动字幕（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）、`format`（srt/vtt） |
| `extract-audio` | 提取音频 | `format`（mp3/wav/m4a/ogg） |

### 音频工具 {#audio-tools}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `convert-audio` | 转换音频 | `format`（mp3/wav/ogg/flac/m4a）、`bitrateKbps`（32-320） |
| `trim-audio` | 裁剪音频 | `startS`、`endS` |
| `volume-adjust` | 调整音量 | `gainDb`（-30 至 30） |
| `normalize-audio` | 音频归一化 | -（EBU R128，-16 LUFS） |
| `fade-audio` | 音频淡入淡出 | `fadeInS`（0-30）、`fadeOutS`（0-30） |
| `reverse-audio` | 倒放音频 | - |
| `audio-speed` | 音频速度 | `factor`（0.25-4） |
| `pitch-shift` | 音调变换 | `semitones`（-12 至 12） |
| `audio-channels` | 音频声道 | `mode`（stereo-to-mono/mono-to-stereo/swap） |
| `silence-removal` | 去除静音 | `thresholdDb`（-80 至 -20）、`minSilenceS`（0.1-5） |
| `noise-reduction` | 降噪 | `strength`（light/medium/strong） |
| `merge-audio` | 合并音频 | `format`（mp3/wav/flac/m4a）- 多文件 |
| `split-audio` | 分割音频 | `mode`（time/parts/silence）、`segmentS`、`parts`、`thresholdDb`、`minSilenceS` |
| `ringtone-maker` | 铃声制作 | `startS`、`durationS`（1-30） |
| `waveform-image` | 波形图 | `width`、`height`、`color`（hex） |
| `audio-metadata` | 音频元数据 | `strip`（bool）、`title`、`artist`、`album` |
| `transcribe-audio` | 音频转写（AI） | `language`（auto/en/de/fr/es/zh/ja/ko/id/th/vi）、`outputFormat`（txt/srt/vtt） |

### 文档工具 {#document-tools}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `merge-pdf` | 合并 PDF | -（多文件，最多 20 个 PDF） |
| `split-pdf` | 拆分 PDF | `mode`（range/every）、`range`、`everyN`（1-500） |
| `compress-pdf` | 压缩 PDF | `mode`（quality/targetSize）、`quality`（1-100）、`targetSizeKb` |
| `rotate-pdf` | 旋转 PDF | `angle`（90/180/270）、`range`（页面范围） |
| `extract-pages` | 提取页面 | `range`（qpdf 语法，例如 "1-5,8,10-z"） |
| `remove-pages` | 删除页面 | `pages`（要删除的 qpdf 范围） |
| `organize-pdf` | 整理 PDF | `order`（qpdf 页面顺序，例如 "3,1,2,5-z"） |
| `protect-pdf` | 保护 PDF | `userPassword`、`ownerPassword`（AES-256） |
| `unlock-pdf` | 解锁 PDF | `password` |
| `repair-pdf` | 修复 PDF | - |
| `linearize-pdf` | 网页优化 PDF | -（线性化以便快速网页查看） |
| `grayscale-pdf` | PDF 灰度化 | - |
| `pdfa-convert` | PDF/A 转换 | -（归档级 PDF/A-2） |
| `crop-pdf` | 裁剪 PDF | `margin`（0-2000 点） |
| `nup-pdf` | N-up PDF | `perSheet`（2/3/4/8/9/12/16） |
| `booklet-pdf` | 小册子 PDF | `perSheet`（2/4/6/8） |
| `watermark-pdf` | PDF 加水印 | `text`、`position`、`fontSize`、`opacity`、`rotation` |
| `pdf-page-numbers` | PDF 页码 | `position`（bl/bc/br/tl/tc/tr）、`fontSize` |
| `flatten-pdf` | 展平 PDF | -（将表单和批注固化） |
| `redact-pdf` | PDF 涂黑 | `terms`（string[]）、`caseSensitive`（bool） |
| `sign-pdf` | PDF 签名 | 自定义 multipart 路由，带 PDF `file`、签名文件 `sig0`、`sig1` 和 `placements` JSON 数组 |
| `pdf-to-text` | PDF 转文本 | - |
| `pdf-to-word` | PDF 转 Word | - |
| `pdf-metadata` | PDF 元数据 | `title`、`author`、`subject`、`keywords` |
| `convert-document` | 转换文档 | `format`（docx/odt/rtf/txt） |
| `convert-presentation` | 转换演示文稿 | `format`（pptx/odp） |
| `convert-spreadsheet` | 转换电子表格 | `format`（xlsx/ods/csv） |
| `excel-to-pdf` | Excel 转 PDF | - |
| `word-to-pdf` | Word 转 PDF | - |
| `powerpoint-to-pdf` | PowerPoint 转 PDF | - |
| `html-to-pdf` | HTML 转 PDF | -（已禁用远程资源） |
| `markdown-to-docx` | Markdown 转 Word | - |
| `markdown-to-html` | Markdown 转 HTML | - |
| `markdown-to-pdf` | Markdown 转 PDF | -（已禁用远程资源） |
| `epub-convert` | 转换 EPUB | `format`（pdf/docx/html/md） |
| `to-epub` | 转换为 EPUB | -（接受 .docx、.md、.html、.txt） |
| `ocr-pdf` | PDF OCR（AI） | `quality`（fast/balanced/best）、`language`（auto/en/de/fr/es/zh/ja/ko）、`pages` |
| `pdf-to-image` | PDF 转图片 | `pages`（all/range）、`format`、`dpi`、`quality` |
| `pdf-to-jpg` | PDF 转 JPG | `pages`、`dpi`、`quality`、`colorMode` |
| `pdf-to-png` | PDF 转 PNG | `pages`、`dpi`、`quality`、`colorMode` |
| `pdf-to-tiff` | PDF 转 TIFF | `pages`、`dpi`、`quality`、`colorMode` |

### 文件工具 {#file-tools}

| 工具 ID | 名称 | 主要设置 |
|---------|------|-------------|
| `chart-maker` | 图表制作 | `kind`（bar/line/pie）、`title`、`width`、`height` |
| `csv-excel` | CSV 转 Excel | `sheet`（XLSX 输入的工作表编号）- 双向 |
| `csv-json` | CSV 转 JSON | `pretty`（bool）- 双向 |
| `json-xml` | JSON 转 XML | `pretty`（bool）- 双向 |
| `split-csv` | 拆分 CSV | `rowsPerFile`（1-1000000）、`keepHeader`（bool） |
| `merge-csvs` | 合并 CSV | -（多文件，列匹配） |
| `yaml-json` | YAML / JSON | -（双向） |
| `xml-to-csv` | XML 转 CSV | -（自动查找重复元素） |
| `excel-to-csv` | Excel 转 CSV | 由 `convert-spreadsheet` 支撑的专用转换预设 |
| `create-zip` | 创建 ZIP | -（多文件，2-50 个文件） |
| `extract-zip` | 解压 ZIP | -（已做 ZIP 炸弹防护） |

### HTML 转图片 {#html-to-image}

将网页捕获为图片。与其他工具不同，该端点接受 `application/json` 而非 multipart 表单数据（无需上传文件）。

**端点：** `POST /api/v1/tools/image/html-to-image`

**Content-Type：** `application/json`

| 参数 | 类型 | 默认值 | 说明 |
|-----------|------|---------|-------------|
| `url` | string | （必填） | 要捕获的 URL（仅限 http/https） |
| `format` | string | `"png"` | 输出格式：`jpg`、`png`、`webp` |
| `quality` | number | `90` | 质量 1-100（仅 JPG/WebP） |
| `fullPage` | boolean | `false` | 捕获整个可滚动页面 |
| `devicePreset` | string | `"desktop"` | `desktop`、`tablet`、`mobile`、`custom` |
| `viewportWidth` | number | `1280` | 自定义视口宽度 320-3840 |
| `viewportHeight` | number | `720` | 自定义视口高度 320-2160 |

**示例：**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**响应：**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### 工具子路由 {#tool-sub-routes}

某些工具在标准的 `POST /api/v1/tools/<section>/<toolId>` 之外还暴露了额外端点：

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | 返回热门工具 ID，当使用数据稀少时回退到精选默认列表 |
| `POST` | `/api/v1/tools/image/remove-background/effects` | 应用背景效果（color/gradient/blur/shadow）而无需重新运行 AI。使用初次移除时缓存的蒙版。 |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | 从图片读取现有的 EXIF/IPTC/XMP 元数据 |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | 在去除前检查元数据字段 |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | 第 1 阶段：AI 人脸检测 + 背景移除。返回人脸关键点和缓存数据。 |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | 第 2 阶段：使用缓存分析进行裁剪、调整尺寸和平铺。无需重新运行 AI。 |
| `POST` | `/api/v1/tools/image/gif-tools/info` | 获取 GIF 元数据（帧数、尺寸、时长） |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | 获取 PDF 元数据（页数、尺寸） |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | 生成指定 PDF 页面的预览 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | 获取专用 JPG 预设的 PDF 元数据 |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | 生成 JPG 预设的 PDF 页面预览 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | 获取专用 PNG 预设的 PDF 元数据 |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | 生成 PNG 预设的 PDF 页面预览 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | 获取专用 TIFF 预设的 PDF 元数据 |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | 生成 TIFF 预设的 PDF 页面预览 |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | 将多个 SVG 批量转换为位图 |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | 分析图片质量并返回增强建议 |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | 用于实时参数调节的轻量预览。返回带尺寸头的优化图片。 |

## 批处理 {#batch-processing}

将某个支持批处理的通用工具一次性应用到多个文件。返回一个 ZIP 归档。自定义的多文件或多步路由（例如 PDF 签名以及 PDF 转图片预设路由）使用它们自己的端点约定，而非通用的 `/batch` 路由。

`ocr-pdf` 工具支持此通用 `/batch` 路由。

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

并发由 `CONCURRENT_JOBS` 控制（默认：从 CPU 核心数自动检测）。`MAX_BATCH_SIZE` 限制每个批次的文件数量（默认：100；设为 0 表示无限制）。

## 流水线 {#pipelines}

### 执行流水线 {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

每一步的输出是下一步的输入。流水线默认允许 20 步，可通过 `MAX_PIPELINE_STEPS` 配置。设置 `MAX_PIPELINE_STEPS=0` 可移除该限制。

### 保存和管理流水线 {#save-and-manage-pipelines}

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | 保存一个命名流水线（`name`、`description`、`steps[]`） |
| `GET` | `/api/v1/pipeline/list` | 列出已保存的流水线（管理员看到全部；用户看到自己的） |
| `DELETE` | `/api/v1/pipeline/:id` | 删除（所有者或管理员） |
| `GET` | `/api/v1/pipeline/tools` | 列出可用于流水线步骤的工具 ID |

## 进度跟踪 {#progress-tracking}

长时间运行的作业、排队工具、批处理作业和流水线会通过 Server-Sent Events 实时发出进度。进度流是公开的，以作业 ID 作为键，因此客户端无需发送 Authorization 头即可读取。

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

事件格式：
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

你可以用 `POST /api/v1/jobs/:jobId/cancel` 请求取消一个已排队或正在运行的作业。响应为 `{"canceled":true|false}`。

## 文件库 {#file-library}

带版本历史的持久化文件存储。

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | 将文件上传到工作区（临时处理） |
| `POST` | `/api/v1/files/upload` | 将文件上传到持久化文件库 |
| `POST` | `/api/v1/files/save-result` | 将工具处理结果保存为一个新文件版本 |
| `GET` | `/api/v1/files` | 列出已保存文件（分页，带搜索） |
| `GET` | `/api/v1/files/:id` | 获取文件元数据 + 版本链 |
| `GET` | `/api/v1/files/:id/download` | 下载文件 |
| `GET` | `/api/v1/files/:id/thumbnail` | 获取 300px JPEG 缩略图 |
| `DELETE` | `/api/v1/files` | 批量删除文件及其版本链（请求体：`{ ids: [...] }`） |
| `POST` | `/api/v1/fetch-urls` | 将远程 URL 抓取到工作区，用于基于 URL 的导入 |
| `POST` | `/api/v1/preview` | 生成浏览器兼容的 WebP 预览（适用于 HEIC/HEIF/RAW 格式） |
| `GET` | `/api/v1/files/:id/preview` | 为已保存的 PDF、Office 文档、视频或音频文件流式传输已缓存或生成的浏览器兼容预览 |
| `POST` | `/api/v1/preview/generate` | 为已上传的媒体文件按需生成 MP4 或 MP3 预览，无需先保存 |
| `GET` | `/api/v1/download/:jobId/:filename` | 从工作区下载已处理的文件 |

要将工具结果自动保存到文件库，请将 `fileId` 作为一个 multipart 表单字段包含进去，引用一个现有的库文件。处理结果将保存为一个新版本。

## API 密钥管理 {#api-key-management}

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | 需身份验证 | 生成新密钥 - 只显示一次 |
| `GET` | `/api/v1/api-keys` | 需身份验证 | 列出密钥（name、id、lastUsedAt - 不含原始密钥） |
| `DELETE` | `/api/v1/api-keys/:id` | 需身份验证 | 删除密钥 |

## 团队 {#teams}

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | 管理员（`teams:manage`） | 列出团队 |
| `POST` | `/api/v1/teams` | 管理员（`teams:manage`） | 创建团队 |
| `PUT` | `/api/v1/teams/:id` | 管理员（`teams:manage`） | 重命名团队 |
| `DELETE` | `/api/v1/teams/:id` | 管理员（`teams:manage`） | 删除团队（无法删除默认团队或有成员的团队） |

## 设置 {#settings}

运行时配置仅使用一组封闭的已识别键。读取需要 `settings:read`，写入需要 `settings:write`；安全和合规键还分别需要 `security:manage` 或 `compliance:manage`。机密设置需要完整管理员权限，而由专用端点管理的凭据和状态在此处为只读。批量更新会在写入任何值之前完成验证。

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | 获取所有设置 |
| `PUT` | `/api/v1/settings` | 批量更新设置（带键值对的 JSON 请求体） |
| `GET` | `/api/v1/settings/:key` | 按键获取指定设置 |

代表性键包括：`disabledTools`（工具 ID 的 JSON 数组）、`enableExperimentalTools`（布尔值）、`loginAttemptLimit`（安全策略）和 `auditRetentionDays`（合规策略）。未知键会被拒绝。

## 偏好设置 {#preferences}

每用户偏好设置与实例设置是分开的。任何已验证用户都可以读取和更新自己的偏好映射。

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | 以 `{ "preferences": { ... } }` 获取当前用户的偏好设置 |
| `PUT` | `/api/v1/preferences` | 为当前用户新增或更新一个或多个偏好键 |

## 角色 {#roles}

带细粒度权限的自定义角色管理。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | 管理员（`audit:read`） | 列出所有角色及其用户数量 |
| `POST` | `/api/v1/roles` | 管理员（`security:manage`） | 创建自定义角色（`name`、`description`、`permissions`） |
| `PUT` | `/api/v1/roles/:id` | 管理员（`security:manage`） | 更新自定义角色（无法修改内置角色） |
| `DELETE` | `/api/v1/roles/:id` | 管理员（`security:manage`） | 删除自定义角色（无法删除内置角色；受影响用户回退到 `user` 角色） |

可用权限（17 个）：`tools:use`、`files:own`、`files:all`、`apikeys:own`、`apikeys:all`、`pipelines:own`、`pipelines:all`、`settings:read`、`settings:write`、`users:manage`、`teams:manage`、`features:manage`、`system:health`、`audit:read`、`compliance:manage`、`webhooks:manage`、`security:manage`。

## 审计日志 {#audit-log}

仅管理员的端点，用于审查与安全相关的操作。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | 管理员（`audit:read`） | 带可选过滤器的分页审计日志 |

查询参数：

| 参数 | 说明 |
|-----------|-------------|
| `page` | 页码（默认：1） |
| `limit` | 每页条目数（默认：50，最大：100） |
| `action` | 按操作类型过滤（例如 `ROLE_CREATED`、`ROLE_DELETED`） |
| `ip` | 按来源 IP 地址过滤 |
| `from` | 过滤此 ISO 8601 日期之后的条目 |
| `to` | 过滤此 ISO 8601 日期之前的条目 |

## 分析 {#analytics}

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | 公开 | 获取生效的分析配置（PostHog 密钥、Sentry DSN、采样率）。当分析关闭时（无论来自编译期烘焙还是实例 `analyticsEnabled` 设置），密钥、DSN 和实例 ID 均为空。 |
| `POST` | `/api/v1/feedback` | 需身份验证 | 将显式的用户反馈以 `feedback_submitted` 提交到已配置的 PostHog 项目。该路由遵守分析开关，对提交进行限流，除非 `contactOk` 为 true 否则会剥离联系字段，并且从不接受文件内容、文件名、上传路径或原始私有错误文本。分析被禁用时，返回 `{ "ok": true, "accepted": false }`。 |
| `PUT` | `/api/v1/settings` | 管理员（`settings:write`） | 设置实例范围的选择退出。发送 JSON 请求体 `{ "analyticsEnabled": "false" }` 为所有人关闭分析，或 `"true"` 重新开启。 |

## 功能 / AI 捆绑包 {#features-ai-bundles}

管理 AI 功能捆绑包（在 Docker 环境中安装/卸载 AI 模型包）。从自定义自动化启用某个工具时，优先使用工具级安装端点：某些 AI 工具需要多个共享捆绑包，而该端点会跳过已安装的捆绑包，仅将缺失的排队安装。

OCR 是可选增强功能而不是硬依赖项。 其 `fast` Tesseract 层无需包装即可工作； `POST /api/v1/admin/features/ocr/install` 在 Linux amd64 或 arm64 上安装 `balanced` 和 `best` 的签名 RapidOCR 包。 准确的 OCR 运行时在仅 CPU 和 NVIDIA 主机上使用 CPU，并且需要至少 4 GiB 的有效内存（配置的容器 cgroup 限制，否则主机内存）。 SnapOtter 报告 `requiredMemoryBytes`、`effectiveMemoryBytes` 和 `insufficient-memory` 兼容性原因，并在下载前拒绝不兼容的安装。 此内存要求不适用于 `fast`。 该包大约需要下载 208-234 MiB 和安装 409-488 MiB，具体取决于目标； 签名索引绑定安装期间强制执行的确切大小。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | 需身份验证 | 列出所有功能捆绑包及其安装状态 |
| `POST` | `/api/v1/admin/features/:bundleId/install` | 管理员（`features:manage`） | 安装一个功能捆绑包（异步，返回 `jobId` 用于进度跟踪） |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | 管理员（`features:manage`） | 安装某工具所需的每个捆绑包；返回每个捆绑包的已排队/已跳过状态 |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | 管理员（`features:manage`） | 卸载一个功能捆绑包并清理模型文件 |
| `GET` | `/api/v1/admin/features/disk-usage` | 管理员（`features:manage`） | 获取 AI 模型的总磁盘占用 |
| `POST` | `/api/v1/admin/features/import` | 管理员 (`features:manage`) | 导入旧版 AI 捆绑包 (`file`) 或已签名的离线 OCR 版本（`index` 加 `archive`） |

气隙 OCR 导入必须包含版本的签名 `ocr-runtime-index.json` 和匹配的平台存档。 SnapOtter 应用与在线安装相同的 Ed25519 签名、工件哈希、兼容性、提取和冒烟测试检查：

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

在 arm64 上使用 `linux-arm64-cpu-py311` 存档。另一个目标的签名工件被拒绝而不是安装。

## 管理操作 {#admin-operations}

用于可观测性、支持、用量报告和备份状态的运维端点。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | 管理员（`settings:write`） | 读取当前运行时日志级别 |
| `POST` | `/api/v1/admin/log-level` | 管理员（`settings:write`） | 更改运行时日志级别（`fatal`、`error`、`warn`、`info`、`debug`、`trace` 或 `silent`） |
| `GET` | `/api/v1/metrics` | 管理员（`system:health`） | 文本格式的 Prometheus 指标 |
| `GET` | `/api/v1/admin/support-bundle` | 管理员（`system:health`） | 下载一个已脱敏的诊断支持包 ZIP |
| `GET` | `/api/v1/admin/usage` | 管理员（`audit:read`） | 用量仪表盘数据，带可选的 `days` 查询参数 |
| `GET` | `/api/v1/admin/backup-status` | 管理员（`system:health`） | 读取上次备份元数据和新鲜度状态 |
| `POST` | `/api/v1/admin/backup-status` | 管理员（`system:health`） | 记录一次已完成的备份（`type`，可选 `sizeBytes`，可选 `notes`） |

## 企业版 API {#enterprise-apis}

这些路由由其相关的企业版功能进行许可证限制。它们仍需要列出的 SnapOtter 权限。

**拥有完整权限的内置管理员**是指经过身份验证的主体拥有 `admin` 角色以及完整的有效管理员权限集。若 API 密钥的权限范围缺少任何管理员权限，则不符合此要求。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | 管理员（`audit:read`） | 带过滤器将审计条目导出为 JSON 或 CSV |
| `GET` | `/api/v1/enterprise/config/export` | 拥有完整权限的内置管理员 | 导出已脱敏的实例配置、自定义角色和团队 |
| `POST` | `/api/v1/enterprise/config/import` | 拥有完整权限的内置管理员 | 导入配置，可选试运行 |
| `GET` | `/api/v1/enterprise/ip-allowlist` | 管理员（`security:manage`） | 读取已配置的 CIDR 允许列表 |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | 管理员（`security:manage`） | 更新 CIDR 允许列表，并防止自我锁定 |
| `GET` | `/api/v1/enterprise/legal-hold` | 管理员（`compliance:manage`） | 列出用户和团队的法律保留 |
| `PUT` | `/api/v1/enterprise/legal-hold` | 管理员（`compliance:manage`） | 对用户或团队施加或解除法律保留 |
| `POST` | `/api/v1/enterprise/scim/token` | 管理员（`users:manage`） | 生成一个 SCIM 承载令牌，仅返回一次 |
| `DELETE` | `/api/v1/enterprise/scim/token` | 管理员（`users:manage`） | 吊销当前 SCIM 承载令牌 |
| `GET` | `/api/v1/enterprise/siem/config` | 管理员（`webhooks:manage`） | 读取 SIEM 转发配置 |
| `PUT` | `/api/v1/enterprise/siem/config` | 管理员（`webhooks:manage`） | 更新 SIEM 转发配置 |
| `GET` | `/api/v1/enterprise/webhooks` | 管理员（`webhooks:manage`） | 列出 webhook 目标 |
| `POST` | `/api/v1/enterprise/webhooks` | 管理员（`webhooks:manage`） | 创建一个 webhook 目标 |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | 管理员（`webhooks:manage`） | 更新一个 webhook 目标 |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | 管理员（`webhooks:manage`） | 删除一个 webhook 目标 |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | 管理员（`webhooks:manage`） | 发送一个测试 webhook 载荷 |
| `POST` | `/api/v1/enterprise/users/:id/export` | 管理员（`compliance:manage`） | 启动一个 GDPR 用户导出作业 |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | 管理员（`compliance:manage`） | 读取 GDPR 导出状态和下载 URL |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | 管理员（`compliance:manage`） | 确认后永久清除用户数据 |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | 管理员（`compliance:manage`） | 确认后永久清除团队数据 |
| `GET` | `/api/v1/admin/version` | 管理员（`system:health`） | 读取应用、构建、Node 和 schema 版本元数据 |
| `GET` | `/api/v1/admin/migrations/pending` | 管理员（`system:health`） | 比较打包的迁移与已应用的迁移 |
| `GET` | `/api/v1/admin/upgrade-check` | 管理员（`system:health`） | 运行升级就绪检查 |

### SCIM 2.0 {#scim-2-0}

SCIM 发现端点是公开的。用户和组端点需要上面生成的 SCIM 承载令牌。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | 公开 | SCIM 服务器能力 |
| `GET` | `/api/v1/scim/v2/Schemas` | 公开 | SCIM schema 发现 |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | 公开 | SCIM 资源类型发现 |
| `GET` | `/api/v1/scim/v2/Users` | SCIM 令牌 | 列出用户，带可选的 SCIM 过滤器 |
| `POST` | `/api/v1/scim/v2/Users` | SCIM 令牌 | 创建一个用户 |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM 令牌 | 获取一个用户 |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM 令牌 | 替换一个用户 |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM 令牌 | 软停用一个用户 |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM 令牌 | 将团队列为 SCIM 组 |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM 令牌 | 创建一个团队 |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM 令牌 | 获取一个团队 |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM 令牌 | 替换一个团队及组成员关系 |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM 令牌 | 删除一个团队 |

## 表情包模板 {#meme-templates}

为表情包生成器工具提供支持的 API。

| 方法 | 路径 | 访问权限 | 说明 |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | 需身份验证 | 列出所有可用的表情包模板及文本框位置 |
| `GET` | `/api/v1/meme-templates/full/:filename` | 需身份验证 | 提供完整尺寸的模板图片 |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | 需身份验证 | 提供模板缩略图 |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | 需身份验证 | 提供用于表情包文本渲染的字体文件 |

## 错误响应 {#error-responses}

所有错误都返回 JSON：

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| 状态码 | 含义 |
|--------|---------|
| 400 | 请求无效 / 校验失败 |
| 401 | 未通过身份验证 |
| 403 | 权限不足 |
| 404 | 资源未找到 |
| 413 | 文件过大（见 `MAX_UPLOAD_SIZE_MB`） |
| 422 | 校验通过后处理失败 |
| 429 | 已被限流（见 `RATE_LIMIT_PER_MIN`） |
| 501 | 所需的 AI 功能捆绑包未安装（`FEATURE_NOT_INSTALLED`） |
| 500 | 服务器内部错误 |
