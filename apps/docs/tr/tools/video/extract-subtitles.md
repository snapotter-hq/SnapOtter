---
description: "Altyazı parçasını bir videodan SRT dosyası olarak çıkarın."
i18n_source_hash: 48db860f6676
i18n_provenance: human
i18n_output_hash: 7ea979b25a45
---

# Extract Subtitles {#extract-subtitles}

Gömülü altyazı parçasını bir video konteynerinden çıkarın ve SRT dosyası olarak indirin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Bir video dosyası içeren multipart form data kabul eder. Bu aracın yapılandırılabilir ayarı yoktur.

## Parameters {#parameters}

Bu aracın parametresi yoktur. Video konteynerinde bulunan ilk altyazı parçasını çıkarır.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.srt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Video, gömülü bir altyazı parçası içermelidir. Altyazı parçası bulunamazsa, istek 400 hatası döndürür.
- Videoda birden fazla altyazı parçası varsa, ilki çıkarılır.
- Konteynerdeki orijinal altyazı formatından bağımsız olarak çıktı formatı SRT'dir.
