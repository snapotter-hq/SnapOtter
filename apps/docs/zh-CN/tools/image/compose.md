---
description: "使用位置、不透明度和混合模式对图片进行分层合成。"
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: e8457c20e348
---

# 图片合成 {#image-composition}

将叠加图片放在底图之上，并可配置位置、不透明度和混合模式。适用于合成 Logo、图形，或将多张图片组合在一起。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/compose`

接受 multipart 表单数据，包含**两个**图片文件和一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| x | number | 否 | `0` | 叠加图相对左上角的水平偏移，单位像素（最小 0） |
| y | number | 否 | `0` | 叠加图相对左上角的垂直偏移，单位像素（最小 0） |
| opacity | number | 否 | `100` | 叠加图不透明度百分比（0 至 100） |
| blendMode | string | 否 | `"over"` | 合成混合模式 |

### 混合模式 {#blend-modes}

| 值 | 说明 |
|-------|-------------|
| `over` | 普通叠加（默认） |
| `multiply` | 通过相乘像素值使画面变暗 |
| `screen` | 通过反相、相乘再反相使画面变亮 |
| `overlay` | 根据底图亮度结合正片叠底与滤色 |
| `darken` | 保留每一层中较暗的像素 |
| `lighten` | 保留每一层中较亮的像素 |
| `hard-light` | 强对比叠加 |
| `soft-light` | 柔和对比叠加 |
| `difference` | 各层之间的绝对差值 |
| `exclusion` | 类似差值，但对比度较低 |

### 文件字段 {#file-fields}

| 字段名 | 必填 | 说明 |
|------------|----------|-------------|
| file | 是 | 底图/背景图片 |
| overlay | 是 | 叠加图/前景图片 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

使用正片叠底混合模式：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## 注意事项 {#notes}

- 两张图片在合成前都会被验证并解码（支持 HEIC、RAW、PSD、SVG）。
- 叠加图会被放置在由 `x` 和 `y` 指定的精确像素坐标处。它不会被缩放以适配。
- 如果不透明度小于 100，在混合前会对叠加图应用一个 alpha 蒙版。
- 叠加图可以超出底图边界（超出部分会被裁剪）。
- 处理前会在两张图片上自动应用 EXIF 方向。
- 输出尺寸与底图尺寸一致。
