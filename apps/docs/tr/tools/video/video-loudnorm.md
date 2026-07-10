---
description: "Video ses seviyesini yayın standardına normalize edin."
i18n_source_hash: 078f1e819c9a
i18n_provenance: human
i18n_output_hash: c00465d6a4f0
---

# Normalize Audio {#normalize-audio}

Video ses seviyesini EBU R128 yayın ses yüksekliği standardına normalize edin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-loudnorm`

Bir video dosyası içeren multipart form data kabul eder. Bu aracın yapılandırılabilir ayarı yoktur.

## Parameters {#parameters}

Bu aracın parametresi yoktur. Ses parçasına EBU R128 ses yüksekliği normalizasyonu uygular.

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

- FFmpeg'in `loudnorm` filtresini kullanır; -16 LUFS entegre ses yüksekliği, -1.5 dBTP gerçek tepe ve 11 LU ses yüksekliği aralığını (EBU R128 yayın standardı) hedefler.
- Kaynak ses örnekleme hızı çıktıda korunur.
- Videoda ses parçası yoksa, istek 400 hatası döndürür.
