---
description: "Bir video klibini animasyonlu bir GIF'e dönüştürün."
i18n_source_hash: f729dde8cd55
i18n_provenance: human
i18n_output_hash: f55d64a10f0f
---

# Video to GIF {#video-to-gif}

Bir video klibini yapılandırılabilir kare hızı, genişlik, başlangıç zamanı ve süreyle animasyonlu bir GIF'e dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-gif`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder. Bu asenkron bir uç noktadır; hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile aktarılır.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | Çıktı kare hızı (1-30) |
| width | integer | No | `480` | Piksel cinsinden çıktı genişliği (64-1280). Yükseklik orantılı olarak ölçeklenir |
| startS | number | No | `0` | Saniye cinsinden başlangıç zamanı (>= 0 olmalıdır) |
| durationS | number | No | `5` | Saniye cinsinden süre (0'ın üstünde, en fazla 60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-gif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 320, "startS": 2, "durationS": 8}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Daha düşük `fps` ve `width` değerleri daha küçük GIF dosyaları üretir. 12 fps'de 480px genişliğinde bir GIF genellikle iyi bir dengedir.
- Maksimum süre 60 saniyedir. Daha uzun klipler çok büyük dosyalar üretir.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile sunulur.
