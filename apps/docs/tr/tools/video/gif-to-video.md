---
description: "Animasyonlu bir GIF'i MP4, WebM veya MOV videoya dönüştürün."
i18n_source_hash: c3737b31146d
i18n_provenance: human
i18n_output_hash: 2febef4aae12
---

# GIF to Video {#gif-to-video}

Animasyonlu bir GIF'i kompakt bir MP4, WebM veya MOV video dosyasına dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/gif-to-video`

Bir GIF dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Çıktı formatı: `mp4`, `webm`, `mov` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/gif-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"format": "mp4"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.mp4",
  "originalSize": 8500000,
  "processedSize": 950000
}
```

## Notes {#notes}

- GIF'i videoya dönüştürmek, aynı görsel kaliteyi korurken dosya boyutunu genellikle %80-90 azaltır.
- Yalnızca animasyonlu GIF dosyaları kabul edilir. Statik görüntüler image Convert aracını kullanmalıdır.
- MP4 ve MOV, H.264 kodlaması kullanır; WebM, VP9 kullanır.
