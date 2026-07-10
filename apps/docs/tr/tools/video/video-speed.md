---
description: "Bir videoyu hızlandırın veya yavaşlatın."
i18n_source_hash: 98dfc75c0507
i18n_provenance: human
i18n_output_hash: d3dc5ff985a9
---

# Video Speed {#video-speed}

Ses perdesini koruma seçeneğiyle bir videoyu hızlandırın veya yavaşlatın.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-speed`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| factor | number | No | `2` | Hız çarpanı (0.25-4). 1'in üstündeki değerler hızlandırır, altındakiler yavaşlatır |
| keepPitch | boolean | No | `true` | Hız değişirken ses perdesini koru |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"factor": 0.5, "keepPitch": true}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 24800000
}
```

## Notes {#notes}

- `2` değerinde bir çarpan oynatma hızını iki katına çıkarır (süreyi yarıya indirir). `0.5` değerinde bir çarpan oynatma hızını yarıya indirir (süreyi iki katına çıkarır).
- `keepPitch` değeri `true` olduğunda, ses zamanda gerilir, böylece sesler doğal duyulur. `false` olduğunda, perde hızla orantılı olarak kayar.
- Geçerli aralık 0.25x ile 4x arasıdır.
