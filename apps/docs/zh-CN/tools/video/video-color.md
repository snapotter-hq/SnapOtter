---
description: "调整视频的亮度、对比度、饱和度和伽马。"
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 3adaee4befd8
---

# Video Color {#video-color}

调整视频的亮度、对比度、饱和度和伽马校正。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

接受包含视频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | 亮度调整（-1 到 1） |
| contrast | number | No | `1` | 对比度倍数（0-4） |
| saturation | number | No | `1` | 饱和度倍数（0-3）。设为 0 表示灰度 |
| gamma | number | No | `1` | 伽马校正（0.1-10） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- 所有值都为默认值（亮度 0，对比度 1，饱和度 1，伽马 1）时不会产生任何变化。
- 将饱和度设置为 `0` 会将视频转换为灰度。
- 伽马值低于 1 会提亮阴影，高于 1 会加深阴影。
