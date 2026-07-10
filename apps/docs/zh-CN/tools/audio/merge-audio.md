---
description: "将多个音频文件合并为一条顺序轨道。"
i18n_source_hash: defa993d3f87
i18n_provenance: human
i18n_output_hash: dec36c80bc5a
---

# 合并音频 {#merge-audio}

将两个或更多音频文件合并为单条顺序轨道，按上传顺序拼接。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/merge-audio`

接受包含多个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | 输出格式：`mp3`、`wav`、`flac`、`m4a` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/merge-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp3" \
  -F "file=@main.mp3" \
  -F "file=@outro.mp3" \
  -F 'settings={"format": "mp3"}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.mp3",
  "originalSize": 9500000,
  "processedSize": 9200000
}
```

## 说明 {#notes}

- 每个请求接受 2 到 10 个音频文件。
- 文件按上传顺序拼接。
- 所有输入文件都会被重新编码为所选的输出格式和采样率，以实现无缝拼接。
- 支持混合的输入格式（例如一个 WAV 和一个 MP3）。
