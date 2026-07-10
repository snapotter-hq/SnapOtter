---
description: "将响度调整到广播标准电平（EBU R128）。"
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 07e2719028af
---

# 归一化音频 {#normalize-audio}

使用 EBU R128 归一化（-16 LUFS）将音频响度调整到广播标准电平。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

此工具没有可配置的参数。它会自动应用 EBU R128 响度归一化。

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- 使用 EBU R128 响度标准，目标为 -16 LUFS。
- 适用于播客、有声书以及对一致响度有要求的广播内容。
- 输出中会保留源采样率。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
