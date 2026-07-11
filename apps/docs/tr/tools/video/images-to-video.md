---
description: "Bir dizi görüntüyü slayt gösterisi videosuna dönüştürün."
i18n_source_hash: 2c6f183feb6d
i18n_provenance: human
i18n_output_hash: 0fb201ecee85
---

# Images to Video {#images-to-video}

Bir dizi görüntüyü, görüntü başına yapılandırılabilir süre, çözünürlük ve kare hızıyla bir slayt gösterisi videosuna dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

İki veya daha fazla görüntü dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| secondsPerImage | number | No | `2` | Saniye cinsinden görüntü başına görüntüleme süresi (0.5-10) |
| resolution | string | No | `"720p"` | Çıktı çözünürlüğü: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Çıktı kare hızı (10-60) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- İstek başına 2-60 görüntü dosyası kabul eder. Görüntüler videoda yükleme sırasına göre görünür.
- Görüntüler, en boy oranı korunarak hedef çözünürlüğe sığdırmak için yeniden boyutlandırılır ve doldurulur.
- `square` çözünürlük seçeneği, sosyal medya için kullanışlı bir 1080x1080 video üretir.
- Çıktı formatı her zaman MP4'tür (H.264).
