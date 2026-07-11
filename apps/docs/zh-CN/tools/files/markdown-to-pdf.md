---
description: "将 Markdown 文件转换为带样式的 PDF。"
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: 2864ac73375f
---

# Markdown to PDF {#markdown-to-pdf}

将 Markdown 文件转换为带样式的 PDF 文档。出于隐私考虑，远程资源已被禁用。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

接受包含 Markdown 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传一个 Markdown 文件即可将其转换为 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Example Response {#example-response}

返回 `202 Accepted`。通过 `/api/v1/jobs/{jobId}/progress` 处的 SSE 跟踪进度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的输入格式：`.md`、`.markdown`。
- 出于隐私和安全考虑，不会获取远程资源（通过 URL 引用的图像、样式表）。
- Markdown 会先被渲染为 HTML，然后通过 WeasyPrint 转换为 PDF。
- 代码块、表格及其他 Markdown 元素在 PDF 输出中会带有样式。
