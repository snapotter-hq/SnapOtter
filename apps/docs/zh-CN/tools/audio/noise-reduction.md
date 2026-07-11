---
description: "使用基于 FFT 的降噪从音频中减少背景噪声。"
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 97072baf3d73
---

# 降噪 {#noise-reduction}

使用基于 FFT 的降噪，以可选强度减少音频文件中的背景噪声。

## API 端点 {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

接受包含一个音频文件和一个 JSON `settings` 字段的 multipart 表单数据。

## 参数 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| strength | string | No | `"medium"` | 降噪强度：`light`、`medium`、`strong` |

## 请求示例 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
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

- `light` 保留更多细节但去除的噪声较少。`strong` 去除更多噪声但可能引入细微的伪影。
- 在具有稳定背景噪声（风扇嗡鸣、空调、静电噪声）的录音上效果最佳。
- 输出通常保留输入容器。AAC 输入会写为 M4A，不支持的仅解码输入会回退为 MP3。
