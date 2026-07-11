---
description: "在每张纸上排布多个 PDF 页面（2 合 1、4 合 1 等）。"
i18n_source_hash: 9dd82737cb72
i18n_provenance: human
i18n_output_hash: f7c9899d22b1
---

# N-up PDF {#n-up-pdf}

在每张纸上排布多个页面以在打印时节省纸张，例如 2 合 1 或 4 合 1 版式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/nup-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| perSheet | integer | No | `2` | 每张纸的页数：`2`、`3`、`4`、`8`、`9`、`12` 或 `16` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/nup-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 4}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2300000
}
```

## Notes {#notes}

- 页面按阅读顺序排布（从左到右，从上到下）。
- 输出页面大小与原始页面一致；各个页面会被缩小以适应网格。
- 一个 20 页的文档使用 `perSheet: 4` 会生成一个 5 页的输出。
