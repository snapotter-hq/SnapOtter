---
description: "透過指定開始和結束時間，從影片中剪出一個片段。"
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 10518c09d20f
i18n_hash_version: 2
---

# Trim Video {#trim-video}

從影片中剪出一個片段。可以保留開始與結束時間之間的部分，也可以從開頭和結尾各裁掉固定長度。另外也提供影格精準剪輯的選項。

在應用程式中，時間欄位可以直接填秒數（`90`），也可以填 `MM:SS`（`1:30`）或 `HH:MM:SS`（`1:02:03.5`）。API 只接受秒數。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

接受包含一個影片檔案和一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` 會保留 `startS` 到 `endS` 之間的部分。`ends` 會從開頭移除 `cutStartS`，並從結尾移除 `cutEndS` |
| startS | number | No | `0` | 範圍模式：開始時間（以秒為單位，必須 >= 0） |
| endS | number | Range mode | - | 範圍模式：結束時間（以秒為單位，必須晚於 startS） |
| cutStartS | number | No | `0` | 兩端模式：從開頭移除的秒數 |
| cutEndS | number | No | `0` | 兩端模式：從結尾移除的秒數 |
| precise | boolean | No | `false` | 重新編碼整個範圍，讓起訖影格都精準，而不是從下一個關鍵影格開始複製 |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

不論影片多長，都移除前 5 秒和最後 10 秒：

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- 當 `precise` 為 `false`（預設值）時，片段會從您指定的那個影格精準開始。只有該起點到下一個關鍵影格之間的影格會被重新編碼，其餘部分直接複製，因此速度依然很快。結尾可能會多出一個影格左右，因為複製的串流會保留前面影格所依賴的影格。無法安全接合的來源（10 位元或交錯式的 H.264、起點需要重新編碼的其他編解碼器，以及 AVI、FLV、MPEG 和 TS 檔案）則會改為整段重新編碼。
- 將 `precise` 設為 `true` 一律會重新編碼整個範圍，因此兩端都精準，但需要更長時間。
- 在範圍模式下，`endS` 必須大於 `startS`。如果 `endS` 超出影片結尾，片段會播放到結尾。
- 在兩端模式下，`cutStartS` 和 `cutEndS` 至少有一個必須大於零，而且兩者加起來必須留下一部分影片。由於裁切量是依每個檔案本身的長度計算，同一個設定可用於一批長度不同的影片。
