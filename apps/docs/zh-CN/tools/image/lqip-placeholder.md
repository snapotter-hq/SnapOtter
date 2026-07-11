---
description: "生成带 base64 data URI 的微型低质量图像占位符。"
i18n_source_hash: f8a27c8021f5
i18n_provenance: human
i18n_output_hash: 5f5934959b5e
---

# LQIP 占位符 {#lqip-placeholder}

从源图像生成微型低质量图像占位符（LQIP）。返回一个小的占位符文件，并附带 base64 data URI、即用型 HTML `<img>` 标签和 CSS `background-image` 代码片段，可立即嵌入使用。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/lqip-placeholder`

接受包含一个图像文件的 multipart 表单数据，以及一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| width | integer | 否 | `16` | 目标宽度（像素，4-64） |
| blur | number | 否 | `2` | 模糊策略的模糊半径（0-20） |
| strategy | string | 否 | `"blur"` | 占位符策略：`blur`、`pixelate` 或 `solid` |
| format | string | 否 | `"webp"` | 输出格式：`webp`、`png` 或 `jpeg` |
| quality | integer | 否 | `50` | 输出质量（1-100） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/lqip-placeholder \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 20, "strategy": "blur", "format": "webp"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 280,
  "dataUri": "data:image/webp;base64,UklGR...",
  "width": 20,
  "height": 13,
  "bytes": 280,
  "strategy": "blur",
  "html": "<img src=\"data:image/webp;base64,UklGR...\" />",
  "css": "background-image:url('data:image/webp;base64,UklGR...');background-size:cover;background-position:center;"
}
```

## 说明 {#notes}

- `dataUri` 字段包含完整的 data URI，可直接用于 `src` 属性或 CSS，无需任何额外请求。
- `html` 和 `css` 字段提供适用于常见场景的可复制粘贴代码片段。
- `blur` 策略生成柔和的模糊缩略图。`pixelate` 策略生成块状马赛克。`solid` 策略返回单一的平均色。
- 典型的占位符大小为 200-500 字节，适合直接内联到 HTML 中。
- 高度会自动计算，以保持源图像的宽高比。
- HEIC、RAW、PSD 和 SVG 输入会在处理前被自动解码。
