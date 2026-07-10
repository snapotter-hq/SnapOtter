---
description: "Bir videodan meta verileri temizleyin ve neler bulunduğunu raporlayın."
i18n_source_hash: 69621bfb98ca
i18n_provenance: human
i18n_output_hash: 2fb96b378c62
---

# Clean Video Metadata {#clean-video-metadata}

Bir videodan meta verileri (oluşturma tarihi, GPS koordinatları, kamera modeli, yazılım etiketleri vb.) temizleyin ve nelerin kaldırıldığını raporlayın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-metadata`

Bir video dosyası içeren multipart form data kabul eder. Bu aracın yapılandırılabilir ayarı yoktur.

## Parameters {#parameters}

Bu aracın parametresi yoktur. Video konteynerinden tüm meta verileri temizler.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip_clean.mp4",
  "originalSize": 12500000,
  "processedSize": 12480000,
  "metadata": {
    "container": "mov,mp4,m4a,3gp,3g2,mj2",
    "durationS": 42.5,
    "bitrateKbps": 2350,
    "streams": [
      { "type": "video", "codec": "h264", "width": 1920, "height": 1080 },
      { "type": "audio", "codec": "aac", "sampleRate": 48000 }
    ]
  }
}
```

## Notes {#notes}

- Temizlenen meta veriler; oluşturma zaman damgalarını, GPS/konum verilerini, kamera/cihaz bilgilerini ve yazılım etiketlerini içerir.
- Video ve ses akışları yeniden kodlanmadan kopyalanır, bu yüzden kalite kaybı olmaz.
- Videoları herkese açık paylaşmadan önce gizlilik için kullanışlıdır.
