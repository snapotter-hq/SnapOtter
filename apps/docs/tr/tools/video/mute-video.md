---
description: "Ses parçasını bir videodan kaldırın."
i18n_source_hash: 9a0c60bbcaa3
i18n_provenance: human
i18n_output_hash: 58452a1cca33
---

# Mute Video {#mute-video}

Ses parçasını bir videodan kaldırarak yalnızca görsel akışı bırakın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/mute-video`

Bir video dosyası içeren multipart form data kabul eder. Bu aracın yapılandırılabilir ayarı yoktur.

## Parameters {#parameters}

Bu aracın parametresi yoktur. Yüklenen videodan ses parçasını çıkarır.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/mute-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 8900000
}
```

## Notes {#notes}

- Video akışı yeniden kodlanmadan kopyalanır, bu yüzden kalite kaybı olmaz.
- Girdi videosunda ses parçası yoksa, dosya değiştirilmeden döndürülür.
