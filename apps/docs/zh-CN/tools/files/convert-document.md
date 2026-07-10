---
description: "在 Word、OpenDocument、RTF 和纯文本格式之间转换。"
i18n_source_hash: 89771292569d
i18n_provenance: human
i18n_output_hash: 3c8b42693a30
---

# Convert Document {#convert-document}

使用 LibreOffice 在 Word（DOCX）、OpenDocument（ODT）、RTF 和纯文本格式之间转换文档。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/convert-document`

接受包含 Word/ODT/RTF/TXT 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 输出格式：`docx`、`odt`、`rtf`、`txt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-document \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx" \
  -F 'settings={"format": "odt"}'
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

- 接受的输入格式：`.docx`、`.doc`、`.odt`、`.rtf`、`.txt`。
- 转换由服务器上以无头模式运行的 LibreOffice 处理。
- 复杂格式（宏、嵌入对象）在格式之间转换时可能无法保留。
- 输出格式必须与输入格式不同。
