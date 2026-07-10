---
description: "Kalite kontrolüyle video dosya boyutunu küçültün."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: 3f6d8c1890cc
---

# Compress Video {#compress-video}

Yapılandırılabilir sıkıştırma gücü ve isteğe bağlı çözünürlük küçültmesi kullanarak video dosya boyutunu küçültün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder. Bu asenkron bir uç noktadır; hemen `202 Accepted` döndürür ve ilerleme `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile aktarılır.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Sıkıştırma gücü: `light`, `balanced`, `strong` |
| resolution | string | No | `"original"` | Çıktı çözünürlüğü: `original`, `1080p`, `720p`, `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- `light` ön ayarı neredeyse orijinal kaliteyi korur. `strong` ön ayarı ise görsel doğruluk pahasına dosya boyutunu agresif şekilde azaltır.
- Çözünürlüğü küçültmek (örneğin 4K'dan 720p'ye) sıkıştırmayla birleşerek belirgin bir boyut azalması sağlar.
- İş tamamlanana kadar ilerleme güncellemeleri `GET /api/v1/jobs/{jobId}/progress` adresinde SSE ile sunulur.
