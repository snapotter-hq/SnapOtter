---
description: "将 PDF 中的页面旋转 90、180 或 270 度。"
i18n_source_hash: cc2acd091427
i18n_provenance: human
i18n_output_hash: 87beaf484a08
---

# Rotate PDF {#rotate-pdf}

将 PDF 中的所有页面或选定页面旋转指定角度。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/rotate-pdf`

接受包含一个 PDF 文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | integer | No | `90` | 旋转角度：`90`、`180` 或 `270` |
| range | string | No | `"1-z"` | 采用 qpdf 语法的页面范围，例如 `"1-5,8"`（`"1-z"` = 所有页面） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/rotate-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"angle": 90, "range": "1-3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- 旋转为顺时针方向。
- 页面范围使用 qpdf 语法：`1-5` 表示第 1 到第 5 页，`z` 表示最后一页，用逗号组合多个范围。
- 默认范围 `"1-z"` 会旋转所有页面。
