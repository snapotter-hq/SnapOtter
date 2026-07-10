---
description: "將影片音訊音量正規化為廣播標準。"
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: 6bfd06fe9eb2
---

# Normalize Audio {#normalize-audio}

將影片音訊音量正規化為 EBU R128 廣播響度標準。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

接受包含一個影片檔案的 multipart form data。此工具沒有可設定的選項。

## Parameters {#parameters}

此工具沒有參數。它會對音訊軌套用 EBU R128 響度正規化。

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-loudnorm \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12500000
}
```

## Notes {#notes}

- 使用 FFmpeg 的 `loudnorm` 濾鏡，以 -16 LUFS 整合響度、-1.5 dBTP 真實峰值和 11 LU 響度範圍（EBU R128 廣播標準）為目標。
- 來源音訊取樣率會在輸出中保留。
- 若影片沒有音訊軌，請求會回傳 400 錯誤。
