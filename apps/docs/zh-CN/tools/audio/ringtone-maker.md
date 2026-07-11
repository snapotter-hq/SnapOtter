---
description: "从任意音频文件制作铃声片段。"
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: f3535f1e8bb2
---

# 铃声制作器 {#ringtone-maker}

通过选择起始时间和时长，从任意音频文件制作铃声片段（.m4r）。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 起始时间，单位秒（最小 0） |
| durationS | number | No | `30` | 片段时长，单位秒（1 到 30） |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## 响应示例 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## 说明 {#notes}

- 输出始终为 M4R 格式，兼容 iPhone 铃声。
- 铃声最大时长为 30 秒（Apple 限制）。
- 任何音频格式都可用作输入。
