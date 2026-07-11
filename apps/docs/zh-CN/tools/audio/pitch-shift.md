---
description: "以半音为单位升高或降低音频音高，而不改变速度。"
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: 0e04a5b3b2e8
---

# 变调 {#pitch-shift}

以若干半音为单位升高或降低音频文件的音高，而不改变其播放速度。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| semitones | integer | No | `3` | 要移动的半音数（-12 到 12）。必须为非零值。 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## 说明 {#notes}

- 正值升高音高；负值降低音高。
- 移动 12 个半音等于升高一个八度；-12 等于降低一个八度。
- 无论移动量为多少，播放时长都保持不变。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
