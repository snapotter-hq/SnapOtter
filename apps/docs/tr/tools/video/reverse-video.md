---
description: "Bir video klibini geri sarın."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 717183aae703
---

# Reverse Video {#reverse-video}

Bir video klibini geri sarın. Ses parçası da tersine çevrilir.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Bir video dosyası içeren multipart form data kabul eder. Bu aracın yapılandırılabilir ayarı yoktur.

## Parameters {#parameters}

Bu aracın parametresi yoktur. Videonun tamamını tersine çevirir.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- 5 dakikaya kadar olan kliplerle sınırlıdır. Daha uzun videolar 400 hatasıyla reddedilir.
- Hem video hem de ses parçaları tersine çevrilir. Videoyu sessiz olarak tersine çevirmek için önce sesini kapatın.
