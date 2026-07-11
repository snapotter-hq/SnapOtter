---
description: "从 PDF 中删除特定页面。"
i18n_source_hash: 003e460a047c
i18n_provenance: human
i18n_output_hash: 57d65f5278fd
---

# Remove Pages {#remove-pages}

从 PDF 中删除特定页面，同时保持所有剩余页面完好无损。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/remove-pages`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pages | string | Yes | - | 采用 qpdf 语法要移除的页面范围，例如 `"3,5-7"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/remove-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"pages": "3,5-7"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- 你不能移除文档中的每一页；至少必须保留一页。
- 页面范围使用 qpdf 语法：`3` 表示单页，`5-7` 表示范围，用逗号组合（例如 `1,3,5-7`）。
