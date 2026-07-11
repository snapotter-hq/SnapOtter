---
description: "将表单和注释固化到页面内容中。"
i18n_source_hash: b25c2a2b6f40
i18n_provenance: human
i18n_output_hash: 16ebbe40d5eb
---

# Flatten PDF {#flatten-pdf}

将交互式表单字段和注释固化到页面内容中，生成一个在任何地方看起来都一致的静态 PDF。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/flatten-pdf`

接受包含一个 PDF 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置参数。上传 PDF，所有表单和注释都会被扁平化。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/flatten-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@form.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/form.pdf",
  "originalSize": 185000,
  "processedSize": 172000
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 这是一个快速（同步）工具，直接返回结果。
- 表单字段的值在输出中被保留为静态文本。
- 注释（评论、高亮、便签）会成为页面内容的一部分，不再可编辑。
