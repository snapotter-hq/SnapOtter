---
description: "按质量级别或目标文件大小减小图片文件体积。"
i18n_source_hash: af4685da7e64
i18n_provenance: human
i18n_output_hash: e50a856e4af0
---

# 压缩 {#compress}

通过指定质量级别或以千字节为单位的目标文件大小来减小图片文件体积。该工具使用迭代二分搜索来精确命中目标大小。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/image/compress`

接受 multipart 表单数据，包含一个图片文件和一个 JSON `settings` 字段。

## 参数 {#parameters}

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|-----------|------|----------|---------|-------------|
| mode | string | 否 | `"quality"` | 压缩模式：`quality` 或 `targetSize` |
| quality | number | 否 | `80` | 质量级别（1-100）。在 mode 为 `quality` 时使用。 |
| targetSizeKb | number | 否 | - | 目标文件大小，单位千字节。在 mode 为 `targetSize` 时使用。 |

## 请求示例 {#example-request}

压缩到质量 60：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

压缩到目标大小 200 KB：

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## 注意事项 {#notes}

- 在 `quality` 模式下，较低的值会产生更小的文件，但压缩伪影更多。值为 80 对网页用途来说是一个不错的默认值。
- 在 `targetSize` 模式下，引擎会执行迭代压缩，在不超过目标的前提下尽可能接近目标大小。
- 输出格式与输入格式一致。压缩应用于该格式的原生编码（例如 JPEG 文件使用 JPEG 质量，WebP 文件使用 WebP 质量）。
- 如果默认质量（80）可以接受，你可以完全省略 `quality` 参数。
