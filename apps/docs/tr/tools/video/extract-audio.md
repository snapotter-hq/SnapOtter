---
description: "Ses parçasını bir videodan çıkarın."
i18n_source_hash: f5b8330a5f89
i18n_provenance: human
i18n_output_hash: 9e44015eddef
---

# Extract Audio {#extract-audio}

Bir video dosyasından ses parçasını çıkarın ve MP3, WAV, M4A veya OGG olarak kaydedin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-audio`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp3"` | Çıktı ses formatı: `mp3`, `wav`, `m4a`, `ogg` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "mp3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp3",
  "originalSize": 12500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Videoda ses parçası yoksa, istek 400 hatası döndürür.
- MP3 kayıplıdır ancak yaygın olarak uyumludur. WAV kayıpsızdır ancak büyüktür. M4A (AAC) kalite ile boyut arasında iyi bir denge sunar. OGG, açık codec iş akışları için mevcuttur.
- Kaynak ses zaten AAC olduğunda ve çıktı formatı M4A olduğunda, ses akışı yeniden kodlanmadan kopyalanır.
