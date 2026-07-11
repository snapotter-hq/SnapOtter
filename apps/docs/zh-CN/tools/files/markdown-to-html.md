---
description: "将 Markdown 文件转换为独立的 HTML 页面。"
i18n_source_hash: 3ef805e8fc8c
i18n_provenance: human
i18n_output_hash: cc97c8a1c089
---

# Markdown to HTML {#markdown-to-html}

将 Markdown 文件转换为独立的 HTML 页面。源文件中引用的远程图片在输出中保持原样。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-html`

接受包含 Markdown 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传 Markdown 文件即可将其转换为 HTML。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-html \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@notes.md"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/notes.html",
  "originalSize": 3200,
  "processedSize": 5800
}
```

## Notes {#notes}

- 接受的输入格式：`.md`、`.markdown`。
- 这是一个快速（同步）工具，直接返回结果。
- 输出是一个带内联样式的自包含 HTML 页面。
- Markdown 源文件中的远程图片 URL 保持原样，不会被获取。
