---
description: "Videoları MP4, MOV, WebM, AVI ve MKV arasında dönüştürün."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 9f5e24a957ce
---

# Convert Video {#convert-video}

Videoları yapılandırılabilir kalite ön ayarlarıyla MP4, MOV, WebM, AVI ve MKV formatları arasında dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder. Bu asenkron bir uç noktadır; hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile aktarılır.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Çıktı formatı: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Kalite ön ayarı: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `high` kalite ön ayarı en iyi görsel doğruluğu üretir ancak daha büyük dosyalar oluşturur. `small` ön ayarı ise en küçük dosya boyutu için agresif şekilde sıkıştırır.
- WebM çıktısı VP9 kodlaması kullanır. MP4 ve MOV, H.264 kullanır. AVI ve MKV, eski veya arşivleme iş akışları için mevcuttur.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile sunulur.
