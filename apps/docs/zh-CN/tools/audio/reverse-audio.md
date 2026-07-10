---
description: "反转音频文件使其倒放。"
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: e64e84362bd1
---

# 反转音频 {#reverse-audio}

反转音频文件使其倒放。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

此工具没有可配置的参数。整个音频文件都会被反转。

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- 整条音频轨道会从末尾到开头反转。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
