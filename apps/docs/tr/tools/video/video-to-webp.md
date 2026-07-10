---
description: "Bir video klibini animasyonlu bir WebP görüntüsüne dönüştürün."
i18n_source_hash: 7b1a22459bd1
i18n_provenance: human
i18n_output_hash: e858c06e8dcb
---

# Video to WebP {#video-to-webp}

Bir video klibini yapılandırılabilir kare hızı, genişlik ve kaliteyle animasyonlu bir WebP görüntüsüne dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-webp`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Çıktı kare hızı (1-30) |
| width | integer | No | `480` | Piksel cinsinden çıktı genişliği (16-1920). Yükseklik orantılı olarak ölçeklenir |
| quality | integer | No | `75` | WebP sıkıştırma kalitesi (1-100) |
| loop | boolean | No | `true` | Animasyonu döngüye al |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "quality": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.webp",
  "originalSize": 12500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Animasyonlu WebP, GIF'ten daha küçük dosyalar üretir ve daha iyi renk desteği sunar (24 bit'e karşı 8 bit palet).
- Daha düşük `quality` değerleri görsel doğruluk pahasına daha küçük dosyalar üretir.
- Bir kez oynatılıp durması gereken animasyonlar için `loop` değerini `false` olarak ayarlayın.
