---
description: "将 Word、Markdown、HTML 或纯文本文件转换为 EPUB。"
i18n_source_hash: 63e1afa91c52
i18n_provenance: human
i18n_output_hash: 606045456618
---

# Convert to EPUB {#convert-to-epub}

将 Word 文档、Markdown、HTML 或纯文本文件转换为 EPUB 电子书格式。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/to-epub`

接受包含 Word/Markdown/HTML/TXT 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传一个文档即可将其转换为 EPUB。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/to-epub \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@manuscript.docx"
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

- 接受的输入格式：`.docx`、`.md`、`.html`、`.txt`。
- EPUB 输出遵循 EPUB 3 规范。
- 源文档中的标题用于生成目录。
- 转换由服务器上的 Pandoc 处理。
