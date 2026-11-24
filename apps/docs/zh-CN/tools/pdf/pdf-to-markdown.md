---
description: "将 PDF 转换为 Markdown，并保留 PDF 中的标题、列表和表格。"
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: b495fea0d569
i18n_hash_version: 2
---

# PDF to Markdown {#pdf-to-markdown}

将 PDF 转换为 Markdown 文件，可直接放入 wiki、静态站点或 LLM 流水线。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

接受包含一个 PDF 文件的 multipart 表单数据。

## Parameters {#parameters}

此工具没有可配置参数。上传 PDF，即可得到一个 `.md` 文件。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

较大的 PDF 可能超出同步等待窗口。此时 API 会返回 `202` 和 `jobId`，你可以通过 `/api/v1/jobs/{jobId}/progress` 跟踪进度。

## What gets kept {#what-gets-kept}

PDF 存储的是带位置的文本，而不是结构，因此转换器需要自行推断：

- **标题。** 明显大于正文的短行会成为 `#` 到 `######` 级标题，按整个文档中的字号排序。
- **列表。** 以项目符号或数字开头的行会成为列表项。
- **粗体、斜体和链接。** 以行内形式保留。只有 `http`、`https` 和 `mailto` 链接会保留。
- **表格。** 用框线绘制的表格会输出为 Markdown 表格。仅靠空格排版的表格通常会变成普通段落。

图片会被丢弃。多栏版式和特殊的页面设计只能尽力处理，使用前请检查输出。

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 响应中的 `chars` 字段是 Markdown 输出的长度。
- 扫描版 PDF 没有可转换的文本层。工具会以 `422` 和错误码 `NO_TEXT_LAYER` 拒绝它，而不是返回空文件。请改用 [PDF OCR](./ocr-pdf) 工具。
- 如需往返转换，[Markdown to PDF](../files/markdown-to-pdf)、[Markdown to DOCX](../files/markdown-to-docx) 和 [Markdown to HTML](../files/markdown-to-html) 可读取 `.md` 文件。
