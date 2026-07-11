---
description: "旋轉或翻轉影片。"
i18n_source_hash: cf9620ca62c7
i18n_provenance: human
i18n_output_hash: 9d645dee841f
---

# Rotate Video {#rotate-video}

將影片旋轉 90、180 或 270 度，或進行水平或垂直翻轉。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/rotate-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| transform | string | Yes | - | 要套用的變換：`cw90`、`ccw90`、`180`、`hflip`、`vflip` |

### Transform Values {#transform-values}

- **cw90** - 順時針旋轉 90 度
- **ccw90** - 逆時針旋轉 90 度
- **180** - 旋轉 180 度
- **hflip** - 水平翻轉（鏡像）
- **vflip** - 垂直翻轉

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

- 旋轉 90 或 270 度會交換影片的寬度和高度。
- 翻轉操作（hflip、vflip）不會改變影片尺寸。
