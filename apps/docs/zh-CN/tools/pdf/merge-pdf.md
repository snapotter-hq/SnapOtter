---
description: "将多个 PDF 合并成一个文档。"
i18n_source_hash: e82e389cb8b6
i18n_provenance: human
i18n_output_hash: b509a58c4264
---

# Merge PDFs {#merge-pdfs}

将两个或更多 PDF 文件合并成一个文档，保留每个输入文件的页面顺序。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/merge-pdf`

接受包含两个或更多 PDF 文件的 multipart 表单数据。无需 `settings` 字段。

## Parameters {#parameters}

此工具没有设置参数。只需上传两个或更多 PDF 文件。

| Constraint | Value |
|------------|-------|
| Minimum files | 2 |
| Maximum files | 20 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/merge-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document1.pdf" \
  -F "file=@document2.pdf" \
  -F "file=@document3.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.pdf",
  "originalSize": 4500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- 文件按上传的顺序合并。
- 至少需要两个 PDF 文件；如果提供的文件少于两个，请求将以 400 错误失败。
- 输入文件的最大数量为 20。
- 加密的 PDF 必须先解锁才能合并。
