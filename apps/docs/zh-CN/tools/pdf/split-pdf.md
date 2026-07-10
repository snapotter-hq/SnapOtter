---
description: "提取页面或将 PDF 拆分为多个部分。"
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 8ea95715d34d
---

# Split PDF {#split-pdf}

将某个页面范围提取到一个新的 PDF 中，或将文档拆分为每 N 页一块。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"range"` | 拆分模式：`range` 或 `every` |
| range | string | 当 mode 为 `range` 时 | - | 采用 qpdf 语法的页面范围，例如 `"1-5,8,10-z"` |
| everyN | integer | 当 mode 为 `every` 时 | - | 拆分为每 N 页一块（1-500） |

## Example Request {#example-request}

提取特定页面：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

拆分为每 10 页一块：

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- 在 `range` 模式下，返回一个包含选定页面的单个 PDF。
- 在 `every` 模式下，结果是一个包含各个部分的 ZIP 归档。
- 页面范围使用 qpdf 语法：`1-5` 表示第 1 到第 5 页，`z` 表示最后一页，用逗号组合多个范围（例如 `1-3,7,10-z`）。
