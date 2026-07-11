---
description: "旋转或翻转视频。"
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 13f01d85fafe
---

# Rotate Video {#rotate-video}

将视频旋转 90、180 或 270 度，或水平/垂直翻转。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | 要应用的变换：`cw90`、`ccw90`、`180`、`hflip`、`vflip` |

### Transform Values {#transform-values}

- **cw90** - 顺时针旋转 90 度
- **ccw90** - 逆时针旋转 90 度
- **180** - 旋转 180 度
- **hflip** - 水平翻转（镜像）
- **vflip** - 垂直翻转

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/rotate-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"transform": "cw90"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- 旋转 90 或 270 度会交换视频的宽度和高度。
- 翻转操作（hflip、vflip）不会改变视频尺寸。
