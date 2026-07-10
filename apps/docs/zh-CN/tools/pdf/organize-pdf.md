---
description: "使用显式的页面顺序重新排列 PDF 中的页面。"
i18n_source_hash: e961fc895b4b
i18n_provenance: human
i18n_output_hash: 716a5fd688bb
---

# Organize PDF {#organize-pdf}

通过指定所需的页面序列来重新排列 PDF 中的页面。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/organize-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| order | string | Yes | - | 采用 qpdf 语法的所需页面顺序，例如 `"3,1,2,5-z"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/organize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"order": "3,1,2,5-z"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- 页面范围使用 qpdf 语法：`3,1,2` 重新排列前三页，`5-z` 追加第 5 页到最后一页。
- 通过多次列出某个页面可以复制它（例如 `"1,1,2,3"` 复制第 1 页）。
- 未在顺序字符串中列出的页面会从输出中省略。
