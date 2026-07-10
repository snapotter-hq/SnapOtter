---
description: "将 HTML 文件转换为 PDF。"
i18n_source_hash: 20b9ae147db5
i18n_provenance: human
i18n_output_hash: 536955781218
---

# HTML to PDF {#html-to-pdf}

将 HTML 文件转换为带样式的 PDF 文档。出于隐私考虑，远程资源（外部图片、样式表、脚本）会被禁用。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/html-to-pdf`

接受包含 HTML 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传 HTML 文件即可将其转换为 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/html-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page.html"
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

- 接受的输入格式：`.html`、`.htm`。
- 出于隐私和安全考虑，不会获取远程资源（通过 URL 引用的图片、样式表、脚本）。
- 内联样式和嵌入图片（data URI）会被保留。
- 转换由服务器上的 WeasyPrint 处理。
