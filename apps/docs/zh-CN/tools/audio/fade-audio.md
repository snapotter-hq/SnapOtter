---
description: "为音频添加淡入和淡出效果。"
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: 4ab7d398cde2
---

# 音频淡化 {#fade-audio}

在音频文件的开头和结尾添加淡入和淡出效果。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fadeInS | number | No | `1` | 淡入时长，单位秒（0 到 30） |
| fadeOutS | number | No | `1` | 淡出时长，单位秒（0 到 30） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- 将任一值设为 `0` 可跳过该方向的淡化。至少有一个值必须大于 0。
- 如果淡化时长超过音频长度，会被截断到音频长度。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
