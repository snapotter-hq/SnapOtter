---
description: "Bir videoyu yeni bir çözünürlüğe veya ön ayar boyutuna ölçekleyin."
i18n_source_hash: bb1f67871fea
i18n_provenance: human
i18n_output_hash: e12f5786b02b
---

# Resize Video {#resize-video}

Bir videoyu özel piksel boyutları veya standart bir ön ayar kullanarak yeni bir çözünürlüğe ölçekleyin.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/resize-video`

Bir video dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Piksel cinsinden hedef genişlik (16-7680) |
| height | integer | No | - | Piksel cinsinden hedef yükseklik (16-4320) |
| preset | string | No | `"custom"` | Çözünürlük ön ayarı: `custom`, `2160p`, `1440p`, `1080p`, `720p`, `480p`, `360p` |

`preset` değeri `"custom"` olduğunda, `width` veya `height` değerlerinden en az biri sağlanmalıdır. Diğer boyut orantılı olarak ölçeklenir.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"preset": "720p"}'
```

Özel boyutlara yeniden boyutlandırma:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/resize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 1280, "height": 720}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 25000000,
  "processedSize": 8500000
}
```

## Notes {#notes}

- Ön ayar değerleri standart yüksekliklere eşlenir (örneğin `720p` = 1280x720, `1080p` = 1920x1080). Genişlik, kaynak en boy oranından orantılı olarak ölçeklenir.
- Boyutlar, çoğu video codec'inin gerektirdiği gibi çift sayılara yuvarlanır.
- Desteklenen maksimum çözünürlük 7680x4320'dir (8K UHD).
