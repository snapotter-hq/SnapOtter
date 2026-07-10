---
description: "從任何音訊檔案製作鈴聲片段。"
i18n_source_hash: 8fcdcc545fbc
i18n_provenance: human
i18n_output_hash: ca2d92ccd760
---

# 鈴聲製作器 {#ringtone-maker}

透過選擇起始時間與時長，從任何音訊檔案製作鈴聲片段（.m4r）。

## API 端點 {#api-endpoint}

`POST /api/v1/tools/audio/ringtone-maker`

接受包含一個音訊檔案與一個 JSON `settings` 欄位的 multipart form data。

## 參數 {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | 起始時間（秒）（最小為 0） |
| durationS | number | No | `30` | 片段時長（秒）（1 至 30） |

## 範例請求 {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/ringtone-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 15, "durationS": 20}'
```

## 範例回應 {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.m4r",
  "originalSize": 4500000,
  "processedSize": 620000
}
```

## 附註 {#notes}

- 輸出永遠是 M4R 格式，相容於 iPhone 鈴聲。
- 鈴聲時長上限為 30 秒（Apple 限制）。
- 任何音訊格式都可作為輸入。
