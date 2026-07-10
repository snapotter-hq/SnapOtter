---
description: "按像素、百分比或使用适配模式调整图片尺寸。"
i18n_source_hash: 00d1bffa4d38
i18n_provenance: human
i18n_output_hash: 0a8f45ef34da
---

# 调整尺寸 {#resize}

通过指定精确的像素尺寸、百分比缩放系数，或控制图片如何适配目标尺寸的适配模式来调整图片尺寸。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/resize`

接受包含一个图片文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | - | 目标宽度（像素，最大 16383） |
| height | integer | 否 | - | 目标高度（像素，最大 16383） |
| fit | string | 否 | `"contain"` | 图片如何适配尺寸：`contain`、`cover`、`fill`、`inside`、`outside` |
| withoutEnlargement | boolean | 否 | `false` | 若图片小于目标尺寸则阻止放大 |
| percentage | number | 否 | - | 按百分比缩放（例如 50 表示缩至一半） |

必须至少提供 `width`、`height` 或 `percentage` 之一。

### 适配模式 {#fit-modes}

- **contain** - 调整尺寸以适配于给定尺寸之内，保持宽高比（可能留有空白）
- **cover** - 调整尺寸以覆盖给定尺寸，保持宽高比（可能裁剪）
- **fill** - 拉伸以精确匹配尺寸（忽略宽高比）
- **inside** - 类似 `contain`，但只缩小，绝不放大
- **outside** - 类似 `cover`，但只缩小，绝不放大

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

按百分比调整尺寸：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## 说明 {#notes}

- 任一轴向的最大尺寸为 16383 像素（Sharp/libvips 限制）。
- 输出格式与输入格式一致。HEIC、RAW、PSD 和 SVG 输入会在处理前自动解码。
- 调整尺寸前会自动应用 EXIF 方向。
- `withoutEnlargement` 标志对于批处理很有用，因为其中某些图片可能已经小于目标尺寸。
