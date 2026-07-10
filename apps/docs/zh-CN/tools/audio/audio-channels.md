---
description: "在单声道和立体声之间转换，或交换左右声道。"
i18n_source_hash: 4f5cd6b38c83
i18n_provenance: human
i18n_output_hash: e59e20ee2873
---

# 音频声道 {#audio-channels}

在单声道和立体声布局之间转换音频，或交换立体声文件的左右声道。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/audio-channels`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | Yes | - | 声道操作：`stereo-to-mono`、`mono-to-stereo`、`swap` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-channels \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "stereo-to-mono"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2300000
}
```

## 说明 {#notes}

- `stereo-to-mono` 将两个声道混合为单个单声道轨道。
- `mono-to-stereo` 将单声道声道复制到左右两个声道。
- `swap` 交换立体声文件的左右声道。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
