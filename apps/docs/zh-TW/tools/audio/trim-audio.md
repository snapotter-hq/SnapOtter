---
description: "透過指定開始與結束時間,從音訊檔案中裁切出一段。"
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 65bb34ead8c2
i18n_hash_version: 2
---

# 裁切音訊 {#trim-audio}

從音訊檔案中裁切出一段。可以保留開始與結束時間之間的部分,也可以從開頭與結尾各裁掉固定長度。

在應用程式中,時間欄位可輸入純秒數(`90`)、`MM:SS`(`1:30`)或 `HH:MM:SS`(`1:02:03.5`)。API 則使用秒數。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` 保留 `startS` 到 `endS` 的部分。`ends` 會從開頭移除 `cutStartS`,並從結尾移除 `cutEndS` |
| startS | number | No | `0` | 範圍模式:開始時間(秒)(最小值 0) |
| endS | number | Range mode | - | 範圍模式:結束時間(秒)(必須在開始時間之後) |
| cutStartS | number | No | `0` | 兩端模式:從開頭移除的秒數 |
| cutEndS | number | No | `0` | 兩端模式:從結尾移除的秒數 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

不論檔案長度,裁掉前 2 秒與最後 3 秒:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- 時間以秒為單位指定,並可包含小數(例如 `10.5`)。
- 在範圍模式中,`endS` 必須大於 `startS`。若 `endS` 超過音訊長度,檔案會裁切至結尾。
- 在兩端模式中,`cutStartS` 與 `cutEndS` 至少有一個必須大於零,且兩者合計後必須至少保留 0.1 秒的音訊。由於裁切量是依每個檔案自身的長度計算,同一組設定可套用到一批長度不同的檔案。
- 輸出通常會保留輸入的容器格式。AAC 輸入會寫成 M4A,而不支援的僅可解碼輸入則會退回為 MP3。
