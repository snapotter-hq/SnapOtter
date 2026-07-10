---
description: "将徽标或图像作为水印叠加，可配置位置、不透明度和缩放。"
i18n_source_hash: c73ab0ef8ab9
i18n_provenance: human
i18n_output_hash: fcce0a92b138
---

# 图像水印 {#image-watermark}

将徽标或副图像作为水印叠加到基础图像上。水印相对于基础图像宽度进行缩放，并放置在角落或中心。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/watermark-image`

接受包含**两个**图像文件和 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| position | string | 否 | `"bottom-right"` | 水印位置：`center`、`top-left`、`top-right`、`bottom-left`、`bottom-right` |
| opacity | number | 否 | `50` | 水印不透明度百分比（0 到 100） |
| scale | number | 否 | `25` | 水印宽度占主图像宽度的百分比（1 到 100） |

### 文件字段 {#file-fields}

| 字段名 | 必填 | 说明 |
|------------|----------|-------------|
| file | 是 | 主图像/基础图像 |
| watermark | 是 | 水印/徽标图像 |

## 示例请求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "watermark=@logo.png" \
  -F 'settings={"position": "bottom-right", "opacity": 60, "scale": 20}'
```

## 示例响应 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2520000
}
```

## 说明 {#notes}

- 两张图像都会被验证和解码（支持 HEIC、RAW、PSD、SVG）。
- 水印会按比例调整大小，使其宽度等于主图像宽度的 `scale`%。
- 不透明度通过与 `dest-in` 混合合成的 alpha 蒙版应用。
- 角落位置距图像边缘使用 20px 的内边距。
- 如果水印图像带有透明度（例如 PNG 徽标），合成期间会保留透明度。
- 处理前会在两张图像上自动应用 EXIF 方向。
