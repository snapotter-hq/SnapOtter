---
description: "使用 AI 驱动的 OCR 从 PDF 文档中提取文本。"
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 3bb9f4bd9334
---

# PDF OCR {#pdf-ocr}

使用 AI 驱动的光学字符识别从 PDF 文档中提取文本。支持多种质量层级和语言。需要安装 OCR 功能包。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

接受包含一个 PDF 文件和一个可选的 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | OCR 质量层级：`fast`、`balanced`、`best` |
| language | string | No | `"auto"` | 文档语言：`auto`、`en`、`de`、`fr`、`es`、`zh`、`ja`、`ko` |
| pages | string | No | `"all"` | 页面选择，例如 `"all"`、`"1-3"`、`"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

返回 `202 Accepted`。通过 SSE 在 `/api/v1/jobs/{jobId}/progress` 跟踪进度。

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- 接受的输入格式：`.pdf`。
- 这是一个 AI 工具，需要安装 **OCR 功能包**。如果未安装该功能包，API 将返回 `501 Not Implemented`。
- `fast` 质量层级使用较轻量的模型以加快处理速度；`best` 使用更精确的模型，但以速度为代价。
- `auto` 语言设置会尝试自动检测文档语言。
- 你可以使用范围（`"1-3"`）、逗号分隔的列表（`"1,3,5"`）或 `"all"` 来针对特定页面处理所有页面。
- 对于已经包含可选择文本的 PDF，请考虑改用更快的 [PDF to Text](./pdf-to-text) 工具。
