---
description: "从 PDF 中提取纯文本。"
i18n_source_hash: 15a7bc1cdf8f
i18n_provenance: human
i18n_output_hash: 5d3bd018e6d3
---

# PDF to Text {#pdf-to-text}

将 PDF 文档中所有可读的纯文本提取到一个文本文件中。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-text`

接受包含一个 PDF 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置参数。上传 PDF，其文本内容将被提取。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.txt",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 这是一个快速（同步）工具，直接返回结果。
- 响应中的 `chars` 字段表示提取的字符数。
- 仅提取以数字方式嵌入的文本。对于扫描文档或基于图像的 PDF，请改用 [PDF OCR](./ocr-pdf) 工具。
