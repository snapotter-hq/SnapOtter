---
description: "Bir videodan kareleri görüntülerden oluşan bir ZIP olarak çıkarın."
i18n_source_hash: b06f038dafb3
i18n_provenance: human
i18n_output_hash: a622be5da8ce
---

# Video to Frames {#video-to-frames}

Bir videodan tek tek kareleri çıkarın ve bunları PNG veya JPG görüntülerinden oluşan bir ZIP arşivi olarak indirin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-frames`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"all"` | Çıkarma modu: `all`, `nth`, `timestamps` |
| n | integer | No | `10` | Her N'inci kareyi çıkar (2-1000). Yalnızca mode `"nth"` olduğunda kullanılır |
| timestamps | string | No | `""` | Saniye cinsinden virgülle ayrılmış zaman damgaları. mode `"timestamps"` olduğunda gereklidir |
| format | string | No | `"png"` | Çıkarılan kareler için görüntü formatı: `png`, `jpg` |

## Example Request {#example-request}

Her 30. kareyi JPG olarak çıkar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "nth", "n": 30, "format": "jpg"}'
```

Belirli zaman damgalarında kareleri çıkar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-frames \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "timestamps", "timestamps": "1.5,5,12.3"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip-frames.zip",
  "originalSize": 12500000,
  "processedSize": 45000000
}
```

## Notes {#notes}

- `all` modu her kareyi çıkarır ve uzun videolar için çok büyük ZIP dosyaları üretebilir. Seçici çıkarma için `nth` veya `timestamps` modunu kullanın.
- PNG tam kaliteyi korur ancak daha büyük dosyalar üretir. JPG daha küçüktür ancak kayıplıdır.
- Yanıt, sıralı olarak numaralandırılmış görüntü dosyaları içeren bir ZIP arşivi olarak indirilir.
