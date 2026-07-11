---
description: "用倍率加快或减慢音频播放速度。"
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: d92378e7556a
---

# 音频速度 {#audio-speed}

通过应用速度倍率加快或减慢音频播放速度。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `1.5` | 速度倍率（0.25 到 4）。低于 1 的值减慢；高于 1 的值加快。 |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## 说明 {#notes}

- 倍率 `0.25` 以四分之一速度播放（时长为 4 倍）。倍率 `4` 以四倍速度播放（时长为四分之一）。
- 速度改变时音高保持不变（时间伸缩）。若要单独调整音高，请使用变调。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
