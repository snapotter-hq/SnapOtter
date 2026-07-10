---
description: "从音频文件生成波形可视化的 PNG 图片。"
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: bab1cdd0c8ea
---

# Waveform Image {#waveform-image}

从音频文件生成波形可视化的 PNG 图片，尺寸和颜色可配置。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

接受包含音频文件和 JSON `settings` 字段的 multipart 表单数据。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | 图片宽度（单位像素，256 到 3840） |
| height | integer | No | `256` | 图片高度（单位像素，64 到 1080） |
| color | string | No | `"#4f46e5"` | 波形的十六进制颜色（例如 `"#4f46e5"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- 无论输入音频格式如何，输出始终是 PNG 图片。
- 波形在透明背景上渲染。
- 适合用作缩略图、社交媒体预览或嵌入网页。
