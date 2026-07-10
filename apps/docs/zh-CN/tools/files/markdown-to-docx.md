---
description: "将 Markdown 文件转换为 Word 文档（DOCX）。"
i18n_source_hash: 979cb8ee13f2
i18n_provenance: human
i18n_output_hash: 7fdfdb0b0c80
---

# Markdown to Word {#markdown-to-word}

将 Markdown 文件转换为 Word 文档（DOCX），保留标题、列表、代码块及其他格式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-docx`

接受包含 Markdown 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传 Markdown 文件即可将其转换为 DOCX。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-docx \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@README.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/README.docx",
  "originalSize": 4500,
  "processedSize": 18200
}
```

## Notes {#notes}

- 接受的输入格式：`.md`、`.markdown`。
- 这是一个快速（同步）工具，直接返回结果。
- 标题、加粗、斜体、链接、代码块和列表会映射到 Word 样式。
- 转换由服务器上的 Pandoc 处理。
