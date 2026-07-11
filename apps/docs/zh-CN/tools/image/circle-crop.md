---
description: "将图像裁剪为居中的圆形，四角透明。"
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 5cbadfef92bf
---

# Circle Crop {#circle-crop}

将图像裁剪为居中的圆形，四角透明。支持可调的缩放、偏移、边框和输出尺寸。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

接受包含图像文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| zoom | number | 否 | `1` | 缩放系数（1-5）；值越高裁剪越紧 |
| offsetX | number | 否 | `0.5` | 水平中心位置（0-1） |
| offsetY | number | 否 | `0.5` | 垂直中心位置（0-1） |
| borderWidth | integer | 否 | `0` | 边框宽度（像素，0-200） |
| borderColor | string | 否 | `"#ffffff"` | 边框十六进制颜色 |
| background | string | 否 | `"transparent"` | 四角填充：`"transparent"` 或十六进制颜色 |
| outputSize | integer | 否 | - | 最终正方形尺寸（像素，16-4096） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Notes {#notes}

- 输出始终为 PNG 以保留透明的四角（除非 `background` 被设为纯色）。
- 圆形内切于图像较短的一边。使用 `zoom` 裁剪更紧，使用 `offsetX`/`offsetY` 平移可见区域。
- 当提供 `outputSize` 时，结果会在裁剪后调整为该正方形尺寸。
- HEIC、RAW、PSD 和 SVG 输入在处理前会自动解码。
