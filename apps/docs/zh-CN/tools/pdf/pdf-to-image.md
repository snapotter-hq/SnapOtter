---
description: "将 PDF 页面转换为高质量图像。"
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 72d79f12822f
---

# PDF to Image {#pdf-to-image}

将 PDF 页面转换为高质量的栅格图像。支持页面选择、多种输出格式、DPI 控制和色彩模式。包含用于在转换前检查 PDF 的 info 和 preview 子路由。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | 输出格式：`png`、`jpg`、`webp`、`avif`、`tiff`、`gif`、`heic`、`heif`、`jxl` |
| dpi | number | No | 150 | 渲染分辨率（36 到 2400）。DPI 越高，生成的图像越大、越精细。 |
| quality | number | No | 85 | 有损格式的输出质量（1 到 100） |
| colorMode | string | No | `"color"` | 色彩模式：`color`、`grayscale`、`bw`（黑白阈值） |
| pages | string | No | `"all"` | 页面选择：`all`、单页（`3`）、范围（`1-5`）或逗号分隔（`1,3,5-8`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

返回 PDF 的页数，而不渲染任何页面。

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

以 base64 数据 URL 的形式返回所有页面的低分辨率 JPEG 缩略图。适用于构建页面选择 UI。

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- 使用 MuPDF 进行 PDF 渲染，提供高保真输出，具备正确的字体渲染和矢量图形。
- 不支持受密码保护的 PDF，会返回 400 错误。
- `pages` 参数支持灵活的语法：
  - `"all"` 或 `""` - 所有页面
  - `"3"` - 单页
  - `"1-5"` - 页面范围（含首尾）
  - `"1,3,5-8"` - 单页和范围混合
- 页码从 1 开始。指定超出文档长度的页面会返回 400 错误。
- 主端点始终同时生成各个页面的下载文件和包含所有选定页面的 ZIP。
- 预览端点以 72 DPI 渲染并缩放到 300px 宽度以快速生成缩略图。缩略图为 60% 质量的 JPEG。
- 预览端点会遵循 `MAX_PDF_PAGES` 服务器配置，限制生成的缩略图数量。
- 对于高 DPI 的大型文档，处理时间会成比例增加。网页用途请考虑使用较低的 DPI（150），打印用途请使用较高的 DPI（300-600）。
