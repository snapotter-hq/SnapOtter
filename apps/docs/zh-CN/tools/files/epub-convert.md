---
description: "将 EPUB 转换为 PDF、DOCX、HTML 或 Markdown。"
i18n_source_hash: cb39f254ff2f
i18n_provenance: human
i18n_output_hash: 977c0caf49df
---

# 从 EPUB 转换 {#convert-epub}

将 EPUB 电子书转换为 PDF、Word（DOCX）、HTML 或 Markdown。不会获取书中的远程资源。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/epub-convert`

接受包含 EPUB 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | Yes | - | 输出格式：`pdf`、`docx`、`html`、`md` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/epub-convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@book.epub" \
  -F 'settings={"format": "pdf"}'
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

- 接受的输入格式：`.epub`。
- 出于安全考虑，不会获取 EPUB 中嵌入的远程资源（外部图片、字体）。
- 转换后输出的图像保真度可能因 EPUB 结构而异。
- 转换由服务器上的 Pandoc 处理。
