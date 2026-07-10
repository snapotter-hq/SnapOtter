---
description: "Başlangıç ve bitiş zamanlarını belirterek bir videodan bir klip kesin."
i18n_source_hash: c84481641979
i18n_provenance: human
i18n_output_hash: 322514bad655
---

# Trim Video {#trim-video}

Başlangıç ve bitiş zamanlarını saniye cinsinden belirterek, kare hassasiyetli kesimler seçeneğiyle bir videodan bir klip kesin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Saniye cinsinden başlangıç zamanı (>= 0 olmalıdır) |
| endS | number | Yes | - | Saniye cinsinden bitiş zamanı (startS'den sonra olmalıdır) |
| precise | boolean | No | `false` | Anahtar kare arama yerine kare hassasiyetli kesimler için yeniden kodla |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- `precise` değeri `false` olduğunda (varsayılan), araç anahtar kare aramayı kullanır; bu hızlıdır ancak istenen zamandan birkaç kare önce başlayabilir.
- `precise` değerini `true` olarak ayarlamak, segmenti tam kare sınırları için yeniden kodlar ancak daha uzun sürer.
- `endS` değeri `startS` değerinden büyük olmalıdır.
