---
description: "Bir videodan bir bölge kırpın."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: 380de9cf71d3
---

# Crop Video {#crop-video}

Bölgenin boyutunu ve konumunu belirterek bir videodan dikdörtgen bir bölge kırpın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | Piksel cinsinden kırpma bölgesi genişliği (en az 16) |
| height | integer | Yes | - | Piksel cinsinden kırpma bölgesi yüksekliği (en az 16) |
| x | integer | No | `0` | Sol üst köşeden yatay ofset |
| y | integer | No | `0` | Sol üst köşeden dikey ofset |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- Kırpma bölgesi video boyutlarına sığmalıdır. `x + width` veya `y + height` kaynak boyutunu aşarsa, istek 400 hatası döndürür.
- Minimum kırpma boyutu 16x16 pikseldir.
- Boyutlar, çoğu video codec'inin gerektirdiği gibi çift sayılara yuvarlanır.
