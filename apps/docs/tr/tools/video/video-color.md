---
description: "Bir videonun parlaklığını, kontrastını, doygunluğunu ve gama değerini ayarlayın."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 64d5e9c516a7
---

# Video Color {#video-color}

Bir videonun parlaklığını, kontrastını, doygunluğunu ve gama düzeltmesini ayarlayın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| brightness | number | No | `0` | Parlaklık ayarı (-1 ile 1 arası) |
| contrast | number | No | `1` | Kontrast çarpanı (0-4) |
| saturation | number | No | `1` | Doygunluk çarpanı (0-3). Gri tonlama için 0'a ayarlayın |
| gamma | number | No | `1` | Gama düzeltmesi (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Tüm değerler varsayılanlarında (parlaklık 0, kontrast 1, doygunluk 1, gama 1) hiçbir değişiklik üretmez.
- Doygunluğu `0` değerine ayarlamak videoyu gri tonlamaya dönüştürür.
- 1'in altındaki gama değerleri gölgeleri aydınlatır, 1'in üstündeki değerler ise onları koyulaştırır.
