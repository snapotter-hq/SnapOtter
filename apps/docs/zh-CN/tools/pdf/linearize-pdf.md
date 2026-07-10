---
description: "线性化 PDF 以实现快速网页查看（渐进式下载）。"
i18n_source_hash: 36280b478161
i18n_provenance: human
i18n_output_hash: 03079e663052
---

# Web-Optimize PDF {#web-optimize-pdf}

对 PDF 进行线性化，使其可以在网页浏览器中渐进式下载和显示，无需等待整个文件。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/linearize-pdf`

接受包含一个 PDF 文件的 multipart 表单数据。无需 `settings` 字段。

## Parameters {#parameters}

此工具没有设置参数。直接上传 PDF 文件即可。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/linearize-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2460000
}
```

## Notes {#notes}

- 线性化会重新排列 PDF 的内部结构，使第一页可以在整个文件下载完成之前先渲染。
- 由于添加了线性化数据，输出文件可能会比输入文件略大。
- 已线性化的 PDF 可以被重新线性化，不会出现问题。
