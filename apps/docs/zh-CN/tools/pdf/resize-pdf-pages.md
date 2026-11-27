---
description: "将 PDF 的每一页调整为 A4、Letter、4x6 in 快递面单或自定义尺寸。"
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 7c90525648c6
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

更改 PDF 中每一页的页面尺寸。内容会缩放以适应新页面并居中，因此文本、矢量图形和条形码都能保持清晰。可用它把快递面单转成适用于热敏打印机的 4x6 in 页面，或在 A4 与美国 Letter 之间转换文档。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

接受包含 PDF 文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | 目标尺寸：`4x6in`、`100x150mm`、`a4`、`a5`、`a6`、`letter`、`legal` 或 `custom` |
| width | number | No | `4` | 自定义页面宽度，在 `pageSize` 为 `custom` 时使用 |
| height | number | No | `6` | 自定义页面高度，在 `pageSize` 为 `custom` 时使用 |
| unit | string | No | `"in"` | 自定义尺寸的单位：`in` 或 `mm` |
| keepOrientation | boolean | No | `false` | 让目标尺寸随每页的方向旋转，而不是强制固定宽乘高 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- 页面按比例缩放以适应，不会被拉伸。长宽比不同时，多出的空间保持空白。
- 调整尺寸不会裁剪。印在 Letter 或 A4 页面四分之一区域的面单，在新页面上仍然只占四分之一。
- 自定义尺寸每边必须在 0.5-200 in（12.7-5080 mm）之间。
- 如果页面有裁剪框，则以裁剪框为基准调整尺寸，因此已裁剪的页面只保留裁剪后的区域。
