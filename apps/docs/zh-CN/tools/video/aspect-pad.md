---
description: "添加纯色条以适应目标宽高比。"
i18n_source_hash: b8e17dffc341
i18n_provenance: human
i18n_output_hash: d73866ab6253
---

# Aspect Pad {#aspect-pad}

添加纯色的信箱或邮筒式条框，使视频在不裁剪的情况下适应目标宽高比。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/aspect-pad`

接受包含一个视频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| target | string | No | `"9:16"` | 目标宽高比：`16:9`、`9:16`、`1:1`、`4:3`、`3:4` |
| color | string | No | `"#000000"` | 填充条的十六进制颜色（例如 `"#000000"` 表示黑色） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/aspect-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "1:1", "color": "#ffffff"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13200000
}
```

## Notes {#notes}

- 如果视频已经匹配目标宽高比，则文件将原样返回。
- 竖屏/纵向社交媒体格式（TikTok、Reels、Shorts）请使用 `9:16`。
- 若要使用模糊填充而不是纯色，请使用 Blur Pad 工具。
