---
description: "以自定义分辨率和 DPI 将 SVG 文件转换为 PNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF 或 JXL，并支持批量处理。"
i18n_source_hash: cf36830f8797
i18n_provenance: human
i18n_output_hash: c79bbc83c528
---

# SVG 转位图 {#svg-to-raster}

以自定义分辨率和 DPI 将 SVG 文件转换为位图图像格式（PNG、JPEG、WebP、AVIF、TIFF、GIF、HEIF 或 JXL）。同时支持多个 SVG 的批量转换。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/svg-to-raster`

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | - | 目标宽度（像素，1 到 65536）。若仅设置一个维度则保持宽高比。 |
| height | integer | 否 | - | 目标高度（像素，1 到 65536）。若仅设置一个维度则保持宽高比。 |
| dpi | integer | 否 | 300 | 渲染 DPI，控制基础栅格化密度（36 到 2400） |
| quality | number | 否 | 90 | 有损格式的输出质量（1 到 100） |
| backgroundColor | string | 否 | `"#00000000"` | 背景颜色，十六进制（6 或 8 个字符，8 字符含 alpha） |
| outputFormat | string | 否 | `"png"` | 输出格式：`png`、`jpg`、`webp`、`avif`、`tiff`、`gif`、`heif`、`jxl` |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster \
  -F "file=@logo.svg" \
  -F 'settings={"width":1024,"dpi":300,"outputFormat":"png","backgroundColor":"#FFFFFF"}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.webp",
  "originalSize": 12345,
  "processedSize": 67890
}
```

## 批量端点 {#batch-endpoint}

`POST /api/v1/tools/image/svg-to-raster/batch`

在一次请求中转换多个 SVG 文件。返回 ZIP 压缩包。

### 额外的批量参数 {#additional-batch-parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| clientJobId | string | 否 | - | 可选的客户端提供的作业 ID，用于进度跟踪（最多 128 个字符） |

### 批量示例请求 {#batch-example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/svg-to-raster/batch \
  -F "file=@icon1.svg" \
  -F "file=@icon2.svg" \
  -F "file=@icon3.svg" \
  -F 'settings={"width":512,"outputFormat":"png","dpi":150}'
```

### 批量响应 {#batch-response}

批量端点直接流式返回 ZIP 文件，附带以下标头：
- `Content-Type: application/zip`
- `X-Job-Id: <jobId>`
- `X-File-Results: <url-encoded JSON mapping of index to filename>`

## 说明 {#notes}

- 仅接受 SVG 和 SVGZ 文件（验证内容，而不仅是扩展名）。SVGZ 会被自动解压。
- SVG 内容在渲染前会被净化，以防止 XSS 和外部资源加载。
- `dpi` 设置控制 SVG 栅格化的密度。更高的 DPI 会从相同的 SVG 视口产生更大的像素尺寸。
- 当同时提供 `width` 和 `height` 时，图像会使用 `fit: inside` 进行调整（在边界内保持宽高比）。
- 对于浏览器无法原生显示的格式（TIFF、HEIF），响应中会包含 `previewUrl`。预览是 1200px 的 WebP 缩略图。
- 默认背景 `#00000000` 为完全透明。设为 `#FFFFFF` 可获得白色背景（对不支持透明度的 JPEG 输出很有用）。
- 批量处理遵循 `MAX_BATCH_SIZE` 服务器配置，并使用并发工作进程以提升性能。
- 批量操作的进度可通过 `/api/v1/jobs/:jobId/progress` 处的 SSE 跟踪。
