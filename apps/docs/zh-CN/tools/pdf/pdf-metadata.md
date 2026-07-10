---
description: "读取和写入 PDF 文档元数据。"
i18n_source_hash: b2eaebf7467f
i18n_provenance: human
i18n_output_hash: 32460477a093
---

# PDF Metadata {#pdf-metadata}

读取和更新 PDF 文档的元数据字段，例如标题、作者、主题和关键字。当未提供任何设置时，将返回现有元数据而不做修改。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

接受包含一个 PDF 文件和一个可选的 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | 文档标题（最多 500 个字符） |
| author | string | No | - | 文档作者（最多 500 个字符） |
| subject | string | No | - | 文档主题（最多 500 个字符） |
| keywords | string | No | - | 文档关键字（最多 500 个字符） |

所有参数都是可选的。省略的字段保持不变。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 这是一个快速（同步）工具，直接返回结果。
- 响应中的 `metadata` 字段包含任何更新之后得到的元数据。
- 若要在不修改的情况下读取元数据，请省略 `settings` 字段或发送一个空对象。
- 每个元数据字段限制为 500 个字符。
