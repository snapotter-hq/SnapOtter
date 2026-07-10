---
description: "将普通截图变成精致的图像，加上渐变背景、设备框架、阴影和社交媒体尺寸。"
i18n_source_hash: 8fd8a930a45e
i18n_provenance: human
i18n_output_hash: b9abf471fb21
---

# Beautify Screenshot {#beautify-screenshot}

为截图添加渐变背景、设备框架、阴影、水印和社交媒体尺寸。非常适合为产品营销、社交媒体和文档创建精致的图像。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/beautify`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| backgroundType | string | 否 | `"linear-gradient"` | 背景类型：`solid`、`linear-gradient`、`radial-gradient`、`image`、`transparent` |
| backgroundColor | string | 否 | `"#667eea"` | 纯色背景颜色（当 `backgroundType` 为 `solid` 时使用） |
| gradientStops | array | 否 | `[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}]` | 渐变色标（至少 2 个）。每个色标有 `color`（十六进制）和 `position`（0-100）。 |
| gradientAngle | number | 否 | 135 | 渐变角度（度，0 到 360） |
| padding | number | 否 | 64 | 图像周围的内边距（像素，0 到 256） |
| borderRadius | number | 否 | 12 | 截图的圆角半径（0 到 64） |
| shadowPreset | string | 否 | `"subtle"` | 阴影预设：`none`、`subtle`、`medium`、`dramatic`、`custom` |
| shadowBlur | number | 否 | 20 | 自定义阴影模糊半径（0 到 100，当 `shadowPreset` 为 `custom` 时使用） |
| shadowOffsetX | number | 否 | 0 | 自定义阴影水平偏移（-50 到 50） |
| shadowOffsetY | number | 否 | 10 | 自定义阴影垂直偏移（-50 到 50） |
| shadowColor | string | 否 | `"#000000"` | 自定义阴影颜色（十六进制） |
| shadowOpacity | number | 否 | 30 | 自定义阴影不透明度（0 到 100） |
| frame | string | 否 | `"none"` | 设备或窗口框架：`none`、`macos-light`、`macos-dark`、`windows-light`、`windows-dark`、`browser-light`、`browser-dark`、`iphone`、`iphone-dark`、`macbook`、`macbook-dark`、`ipad`、`ipad-dark` |
| frameTitle | string | 否 | - | 显示在窗口框架标题栏中的标题文本 |
| socialPreset | string | 否 | `"none"` | 调整到社交媒体尺寸：`none`、`twitter`、`linkedin`、`instagram-square`、`instagram-story`、`facebook`、`producthunt` |
| watermarkText | string | 否 | - | 可选的水印文本叠加 |
| watermarkPosition | string | 否 | `"bottom-right"` | 水印位置：`top-left`、`top-right`、`bottom-left`、`bottom-right`、`center` |
| watermarkOpacity | number | 否 | 50 | 水印不透明度（0 到 100） |
| outputFormat | string | 否 | `"png"` | 输出格式：`png`、`jpeg`、`webp` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F 'settings={"backgroundType":"linear-gradient","gradientStops":[{"color":"#667eea","position":0},{"color":"#764ba2","position":100}],"gradientAngle":135,"padding":64,"borderRadius":12,"shadowPreset":"medium","frame":"macos-dark","socialPreset":"twitter"}'
```

### With Background Image {#with-background-image}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/beautify \
  -F "file=@screenshot.png" \
  -F "backgroundImage=@bg-texture.jpg" \
  -F 'settings={"backgroundType":"image","padding":80,"borderRadius":16,"shadowPreset":"dramatic"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/screenshot.png",
  "originalSize": 234567,
  "processedSize": 567890
}
```

## Notes {#notes}

- 接受两个文件字段：`file`（必填，主截图）和 `backgroundImage`（可选，当 `backgroundType` 为 `image` 时使用）。
- 支持 HEIC、RAW、PSD 和 SVG 输入格式（自动解码）。
- 阴影预设映射到特定的值：
  - `subtle`：模糊 20，offsetY 4，不透明度 20%
  - `medium`：模糊 40，offsetY 10，不透明度 35%
  - `dramatic`：模糊 80，offsetY 20，不透明度 50%
- 社交媒体预设使用 `contain` 模式将最终输出调整为适配目标尺寸：
  - `twitter`：1600x900
  - `linkedin`：1200x627
  - `instagram-square`：1080x1080
  - `instagram-story`：1080x1920
  - `facebook`：1200x630
  - `producthunt`：1270x760
- 设备框架（`iphone`、`macbook`、`ipad`）会在图像周围应用硬件边框，并跳过 `borderRadius` 设置。
- 当需要透明度时（阴影、圆角、设备框架或透明背景），即使选择了 `jpeg`，输出也会被强制为 PNG。
- 图像背景在管道/批处理模式下不受支持。
