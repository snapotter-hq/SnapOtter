---
description: "在动画 GIF 与 WebP 之间互相转换，保留所有帧。"
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: 7c7af582111a
---

# GIF/WebP 转换器 {#gif-webp-converter}

在动画 GIF 文件与 WebP 之间互相转换，保留所有帧和动画时序。WebP 动画通常比等效的 GIF 小 25-35%。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

接受包含一个 GIF 或 WebP 文件的 multipart 表单数据，以及一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 是否必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| quality | integer | 否 | `80` | WebP 编码的输出质量（1-100） |
| lossless | boolean | 否 | `false` | 使用无损 WebP 压缩 |
| resizePercent | integer | 否 | `100` | 按百分比缩放输出（10-100） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## 说明 {#notes}

- 仅接受 `.gif` 和 `.webp` 文件。此工具不支持其他图像格式。
- 转换方向是自动的：GIF 输入生成 WebP 输出，WebP 输入生成 GIF 输出。
- `quality` 和 `lossless` 选项仅在编码为 WebP 时适用。转换为 GIF 时，输出使用标准 GIF 调色板。
- 使用 `resizePercent` 来缩小大型动画的尺寸（以及文件大小）。
