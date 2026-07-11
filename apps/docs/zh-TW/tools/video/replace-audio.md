---
description: "用另一個檔案替換影片的音訊軌。"
i18n_source_hash: fabc2a953103
i18n_provenance: human
i18n_output_hash: 1ce24d60f423
---

# Replace Audio {#replace-audio}

用一個音訊檔案替換影片的音訊軌。同時上傳一個影片和一個音訊檔案。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/replace-audio`

接受包含剛好兩個檔案的 multipart form data：一個影片檔案後接一個音訊檔案。

## Parameters {#parameters}

此工具沒有設定參數。以兩個 `file` 部分上傳一個影片檔案和一個音訊檔案。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/replace-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@voiceover.mp3"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 13100000
}
```

## Notes {#notes}

- 必須剛好上傳兩個檔案：第一個必須是影片，第二個必須是音訊檔案。
- 若音訊檔案比影片長，會被裁剪以符合影片時長。若較短，剩餘的影片則會以靜音播放。
- 影片串流會直接複製而不重新編碼，因此不會有影片品質損失。
