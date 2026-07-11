---
description: "以统一的边距裁剪 PDF 的所有页面。"
i18n_source_hash: ffa1a2cee08d
i18n_provenance: human
i18n_output_hash: 98c1a64a36fd
---

# Crop PDF {#crop-pdf}

通过应用统一边距裁剪 PDF 的所有页面，从每条边等量地裁去内容。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| margin | number | No | `20` | 以点为单位的统一裁剪边距（0-2000） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- 边距值以 PDF 点为单位（1 点 = 1/72 英寸）。
- 相同的边距会应用到每一页的全部四条边。
- 边距为 `0` 会移除所有现有的裁剪边距，显示完整的媒体框。
