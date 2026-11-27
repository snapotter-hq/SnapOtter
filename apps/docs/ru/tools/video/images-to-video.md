---
description: "Превращение набора изображений в видео-слайдшоу, анимированный GIF или анимированный WebP."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: fcd669206731
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Превращение набора изображений в видео-слайдшоу с настраиваемой длительностью показа каждого изображения, разрешением и частотой кадров либо в анимированный GIF или WebP с заданным временем кадра и числом повторов.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Принимает multipart form data с двумя или более файлами изображений и полем JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | Выходной формат: `mp4`, `gif`, `webp` |
| secondsPerImage | number | No | `2` | Только MP4. Длительность показа одного изображения в секундах (0.5-10) |
| resolution | string | No | `"720p"` | Только MP4. Выходное разрешение: `1080p`, `720p`, `square` |
| fps | integer | No | `30` | Только MP4. Выходная частота кадров (10-60) |
| frameDelayMs | integer | No | `500` | Только GIF и WebP. Время показа каждого изображения в миллисекундах (20-10000) |
| loop | integer | No | `0` | Только GIF и WebP. Сколько раз проигрывается анимация; `0` означает бесконечный цикл (0-100) |

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

Чтобы собрать анимированный GIF, где каждое изображение показывается 200 мс:

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

- Принимает от 2 до 60 файлов изображений за запрос. Изображения появляются в видео в порядке загрузки.
- Для MP4 изображения масштабируются и дополняются полями, чтобы соответствовать целевому разрешению с сохранением соотношения сторон.
- Вариант разрешения `square` создаёт видео 1080x1080, удобное для социальных сетей.
- Вывод MP4 кодируется в H.264 и называется `slideshow.mp4`.
- Вывод GIF и WebP использует размер первого изображения. Изображения другого размера масштабируются так, чтобы поместиться внутри него, а оставшаяся область прозрачна. Файл называется `slideshow.gif` или `slideshow.webp`.
- GIF хранит время кадров в сотых долях секунды, поэтому `frameDelayMs` в GIF округляется до ближайших 10 мс. WebP сохраняет точное значение.
- Большие анимации отклоняются, а не собираются: размер кадра, умноженный на число изображений, должен укладываться в тот же лимит пикселей, что и для инструментов GIF.
