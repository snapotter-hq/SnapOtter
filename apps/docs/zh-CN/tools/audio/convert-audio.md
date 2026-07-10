---
description: "在 MP3、WAV、OGG、FLAC 和 M4A 格式之间转换音频。"
i18n_source_hash: fd02c059e6a9
i18n_provenance: human
i18n_output_hash: b158d5872091
---

# 转换音频 {#convert-audio}

在包括 MP3、WAV、OGG、FLAC 和 M4A 在内的常见格式之间转换音频文件，并可配置输出比特率。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 输出格式：`mp3`、`wav`、`ogg`、`flac`、`m4a` |
| bitrateKbps | integer | No | `192` | 输出比特率，单位 kbps（32 到 320） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "flac", "bitrateKbps": 256}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.flac",
  "originalSize": 4500000,
  "processedSize": 8200000
}
```

## 说明 {#notes}

- 支持的输入格式包括 MP3、WAV、OGG、FLAC、AAC、M4A、WMA、AIFF 和 OPUS。
- 比特率仅适用于有损格式（MP3、OGG、M4A）。像 WAV 和 FLAC 这样的无损格式会忽略此设置。
- 输出文件名保留原始名称，仅更换扩展名。
