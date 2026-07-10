---
description: "将一个或多个图像合并为 PDF 文档，可选择页面大小、方向和目标文件大小。"
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: 6cfa1b2ea8b1
---

# 图像转 PDF {#image-to-pdf}

将一个或多个图像合并为 PDF 文档。支持多种页面大小、方向、边距，并可通过质量调整选择性地约束文件大小。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

接受包含一个或多个图像文件的 multipart 表单数据，以及一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| pageSize | string | 否 | `"A4"` | 页面大小：`A4`、`Letter`、`A3`、`A5` |
| orientation | string | 否 | `"portrait"` | 页面方向：`portrait` 或 `landscape` |
| margin | number | 否 | `20` | 页面边距（磅，0-500） |
| targetSize | object | 否 | - | 目标文件大小约束（见下文） |
| collate | boolean | 否 | `true` | 将所有图像合并到一个 PDF。若为 `false`，则每张图像生成一个 PDF。 |

### Target Size 对象 {#target-size-object}

| 字段 | 类型 | 是否必填 | 说明 |
|-------|------|----------|-------------|
| value | number | 是 | 目标大小值 |
| unit | string | 是 | 单位：`KB` 或 `MB` |

最小目标大小为 50 KB。

## 请求示例 {#example-request}

基础的多图像 PDF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

带文件大小目标：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

每张图像生成一个 PDF：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## 响应示例（合并） {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## 响应示例（非合并） {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## 响应示例（带目标大小） {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## 说明 {#notes}

- 图像在页面上居中，并在保持宽高比的前提下缩放以适应边距。图像永远不会被放大。
- 当 `collate` 为 `false` 时，每张图像会成为单独的 PDF 文件，下载内容是包含所有 PDF 的 ZIP 归档。
- 目标大小功能通过对 JPEG 质量级别（10-95）进行迭代二分搜索，找出在预算内的最佳质量。
- 透明图像在嵌入 PDF 前会被平整为白色。
- 支持的输入格式：JPEG、PNG、WebP、AVIF、TIFF、GIF、HEIC、RAW、PSD、SVG 等。
- 在嵌入前会自动应用 EXIF 方向信息。
