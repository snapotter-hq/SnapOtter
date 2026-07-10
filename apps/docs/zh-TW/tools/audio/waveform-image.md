---
description: "從音訊檔案產生波形視覺化的 PNG 影像。"
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: c3b9a8688acb
---

# 波形影像 {#waveform-image}

從音訊檔案產生波形視覺化的 PNG 影像，並可設定尺寸與顏色。

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

接受包含一個音訊檔案以及一個 JSON `settings` 欄位的 multipart form data。

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | `1024` | 影像寬度（像素）（256 至 3840） |
| height | integer | No | `256` | 影像高度（像素）（64 至 1080） |
| color | string | No | `"#4f46e5"` | 波形十六進位顏色（例如 `"#4f46e5"`） |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- 無論輸入音訊格式為何，輸出一律為 PNG 影像。
- 波形會繪製在透明背景上。
- 適合用於縮圖、社群媒體預覽，或嵌入網頁。
