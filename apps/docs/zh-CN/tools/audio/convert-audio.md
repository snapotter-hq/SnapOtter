---
description: "在 MP3、WAV、OGG、FLAC 和 M4A 格式之间转换音频。"
i18n_source_hash: 27fd2f49f472
i18n_provenance: human
i18n_output_hash: b158d5872091
---

# 转换音频 {#convert-audio}

在包括 MP3、WAV、OGG、FLAC 和 M4A 在内的常见格式之间转换音频文件，并可配置输出比特率和采样率。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/convert-audio`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 输出格式：`mp3`、`wav`、`ogg`、`flac`、`m4a` |
| bitrateKbps | integer | No | `192` | 输出比特率，单位 kbps（32 到 320） |
| sampleRate | integer | No | 源采样率 | 输出采样率，单位 Hz：`8000`、`16000`、`22050`、`32000`、`44100`、`48000` 或 `96000`。省略则保留源采样率 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/convert-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"format": "mp3", "bitrateKbps": 192, "sampleRate": 44100}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2800000
}
```

## 说明 {#notes}

- 支持的输入格式包括 MP3、WAV、OGG、FLAC、AAC、M4A、WMA、AIFF 和 OPUS。
- 比特率仅适用于有损格式（MP3、OGG、M4A）。像 WAV 和 FLAC 这样的无损格式会忽略此设置。
- MP3 输出支持的采样率最高为 48000 Hz。96000 Hz 选项仅适用于 WAV、OGG、FLAC 和 M4A。
- MP3 比特率受采样率限制：8000 Hz 时最高为 64 kbps，16000 或 22050 Hz 时最高为 160 kbps。超出上限的请求会被拒绝，而不会被静默降低。
- 输出文件名保留原始名称，仅更换扩展名。
