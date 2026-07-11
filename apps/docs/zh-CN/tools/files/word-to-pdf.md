---
description: "将 Word 文档转换为 PDF。"
i18n_source_hash: f814ba1a1a53
i18n_provenance: human
i18n_output_hash: 0e3f59d96990
---

# Word to PDF {#word-to-pdf}

将 Word 文档、OpenDocument 文本、RTF 或纯文本文件转换为 PDF。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/word-to-pdf`

接受包含 Word/ODT/RTF/TXT 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置的参数。上传一个文档即可将其转换为 PDF。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/word-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.docx"
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
- 有可用的嵌入字体时会使用文档中嵌入的字体；否则用系统字体替代。
- 页眉、页脚、表格和图像在 PDF 输出中会保留。
