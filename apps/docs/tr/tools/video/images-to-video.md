---
description: "Bir dizi görüntüyü slayt gösterisi videosuna, animasyonlu GIF'e veya animasyonlu WebP'ye dönüştürün."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 12d39baf6fb3
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Bir dizi görüntüyü, görüntü başına yapılandırılabilir süre, çözünürlük ve kare hızıyla bir slayt gösterisi videosuna ya da kare başına sabit süre ve döngü sayısıyla animasyonlu bir GIF veya WebP'ye dönüştürün.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

İki veya daha fazla görüntü dosyası ve bir JSON `settings` alanı içeren multipart form data kabul eder.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Çıktı biçimi: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Yalnızca MP4. Saniye cinsinden görüntü başına görüntüleme süresi (0.5-10) |
| resolution | string | No | `"720p"` | Yalnızca MP4. Çıktı çözünürlüğü: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Yalnızca MP4. Çıktı kare hızı (10-60) |
| frameDelayMs | integer | No | `500` | Yalnızca GIF ve WebP. Her görüntünün milisaniye cinsinden gösterilme süresi (20-10000) |
| loop | integer | No | `0` | Yalnızca GIF ve WebP. Animasyonun kaç kez oynatılacağı; `0` sonsuza kadar döngüye alır (0-100) |

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

Her görüntüyü 200 ms gösteren animasyonlu bir GIF oluşturmak için:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
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
- MP4 için görüntüler, en boy oranı korunarak hedef çözünürlüğe sığdırmak için yeniden boyutlandırılır ve doldurulur.
- `square` çözünürlük seçeneği, sosyal medya için kullanışlı bir 1080x1080 video üretir.
- MP4 çıktısı H.264'tür ve adı `slideshow.mp4` şeklindedir.
- GIF ve WebP çıktısı ilk görüntünün boyutunu kullanır. Diğer boyutlardaki görüntüler onun içine sığacak şekilde ölçeklenir ve kalan alan saydam olur. Dosyanın adı `slideshow.gif` veya `slideshow.webp` şeklindedir.
- GIF kare sürelerini saniyenin yüzde biri olarak saklar, bu yüzden `frameDelayMs` bir GIF'te en yakın 10 ms'ye yuvarlanır. WebP tam değeri korur.
- Büyük animasyonlar oluşturulmak yerine reddedilir: kare boyutu çarpı görüntü sayısı, GIF araçlarının kullandığı piksel sınırının altında kalmalıdır.
