---
description: "从 PDF 中提取选定页面到一个新文档。"
i18n_source_hash: e4a8fad31e0f
i18n_provenance: human
i18n_output_hash: a70ca59cae62
---

# Extract Pages {#extract-pages}

从 PDF 中提取选定页面，生成一个新的、更小的文档。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/extract-pages`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| range | string | Yes | - | 采用 qpdf 语法的页面范围，例如 `"1-5,8,10-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/extract-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"range": "1-5,8,10-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 3200000,
  "processedSize": 1100000
}
```

## Notes {#notes}

- 页面范围使用 qpdf 语法：`1-5` 表示第 1 到第 5 页，`z` 表示最后一页，用逗号组合多个范围（例如 `1-3,7,10-z`）。
- 提取出的页面保留其原始格式、注释和链接。
