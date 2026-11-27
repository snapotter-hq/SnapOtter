---
description: "Перетворює набір зображень на відео-слайдшоу, анімований GIF або анімований WebP."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 057b715631cd
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Перетворює набір зображень на відео-слайдшоу з налаштовуваною тривалістю на зображення, роздільною здатністю та частотою кадрів, або на анімований GIF чи WebP із заданим часом на кадр і кількістю повторів.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Приймає дані форми multipart із двома або більше файлами зображень і полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Вихідний формат: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Лише MP4. Тривалість показу кожного зображення в секундах (0.5-10) |
| resolution | string | No | `"720p"` | Лише MP4. Вихідна роздільна здатність: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Лише MP4. Вихідна частота кадрів (10-60) |
| frameDelayMs | integer | No | `500` | Лише GIF і WebP. Час показу кожного зображення в мілісекундах (20-10000) |
| loop | integer | No | `0` | Лише GIF і WebP. Скільки разів відтворюється анімація; `0` означає нескінченний цикл (0-100) |

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

Щоб створити анімований GIF, який показує кожне зображення 200 мс:

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

- Приймає 2-60 файлів зображень на запит. Зображення з'являються у відео в порядку завантаження.
- Для MP4 зображення масштабуються й доповнюються полями, щоб вміститися в цільову роздільну здатність зі збереженням співвідношення сторін.
- Опція роздільної здатності `square` створює відео 1080x1080, зручне для соціальних мереж.
- Вивід MP4 кодується в H.264 і має назву `slideshow.mp4`.
- Вивід GIF і WebP використовує розмір першого зображення. Зображення інших розмірів масштабуються, щоб вміститися в нього, а залишена область прозора. Файл називається `slideshow.gif` або `slideshow.webp`.
- GIF зберігає час кадрів у соті частки секунди, тому `frameDelayMs` у GIF округлюється до найближчих 10 мс. WebP зберігає точне значення.
- Великі анімації відхиляються, а не будуються: розмір кадру, помножений на кількість зображень, має вкладатися в той самий піксельний ліміт, що й в інструментах GIF.
