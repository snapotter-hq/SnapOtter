---
description: "读取和写入 PDF 文档元数据。"
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 754c97cfc42d
i18n_hash_version: 2
---

# PDF Metadata {#pdf-metadata}

读取和更新 PDF 文档的元数据字段，例如标题、作者、主题和关键字，或者彻底移除文档的元数据。当未提供任何设置时，将返回现有元数据而不做修改。

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
| stripAll | boolean | No | false | 移除整个 Info 字典（日期、Creator、Producer、自定义键）、所有 XMP 流（文档、页面、图像）以及全部 PieceInfo 应用数据，然后写入上面给出的字段 |
| removeAttachments | boolean | No | false | 同时移除嵌入文件：文档的附件列表、文件附件注释和关联文件（`/AF`）。需要 `stripAll` |

所有参数都是可选的。除非设置了 `stripAll`，否则省略的字段保持不变。

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
- 使用 `stripAll` 时，响应还会包含 `stripped`：被移除的 Info 键（`removed`）、文档 XMP 流是否已移除（`xmpRemoved`）、输入声明的 PDF/A 级别（`pdfa`，或 `null`）、从页面、图像和其他对象上移除的 XMP 流数量（`objectXmpRemoved`）、被移除的 PieceInfo 字典数量（`pieceInfoRemoved`），以及被移除的嵌入文件数量（`attachmentsRemoved`，没有 `removeAttachments` 时始终为 `0`）。移除 XMP 会破坏 PDF/A 合规性。
- 单独使用 `stripAll` 会保留嵌入的文件附件，因为移除它们会改变文档内容。加上 `removeAttachments` 才会一并删除。这会移除 ZUGFeRD 和 Factur-X 电子发票中附带的 XML，并破坏 PDF/A-3 合规性。
- 发送 `removeAttachments` 而不带 `stripAll` 会返回 400。
