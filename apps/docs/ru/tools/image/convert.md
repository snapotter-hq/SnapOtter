---
description: "Преобразование изображений между форматами, включая современные форматы, такие как AVIF, JXL и HEIC."
i18n_source_hash: 2639f333073f
i18n_provenance: human
i18n_output_hash: 43553b7ef94f
---

# Конвертация изображения {#convert}

Преобразуйте изображения между форматами. Поддерживает распространённые веб-форматы, а также специализированные форматы, такие как HEIC, JXL, BMP, ICO, JP2, QOI и PSD.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/convert`

Принимает multipart-данные формы с файлом изображения и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Да | - | Целевой формат: `jpg`, `png`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl`, `bmp`, `ico`, `jp2`, `qoi`, `psd`, `ppm`, `eps`, `tga` |
| quality | number | Нет | - | Качество вывода (1-100). Применяется к форматам с потерями, таким как jpg, webp, avif, heic. |

## Поддерживаемые выходные форматы {#supported-output-formats}

| Формат | Тип | Примечания |
|--------|------|-------|
| jpg | С потерями | JPEG, наилучшая совместимость |
| png | Без потерь | Поддерживает прозрачность |
| webp | Оба | Современный веб-формат, хорошее сжатие |
| avif | С потерями | Формат нового поколения, отличное сжатие |
| tiff | Оба | Рабочие процессы печати/публикации |
| gif | Без потерь | Ограничен 256 цветами |
| heic / heif | С потерями | Формат экосистемы Apple |
| jxl | Оба | JPEG XL, формат нового поколения |
| bmp | Без потерь | Несжатый растр |
| ico | Без потерь | Формат иконок Windows |
| jp2 | С потерями | JPEG 2000 |
| qoi | Без потерь | Формат Quite OK Image |
| psd | Слоистый | Adobe Photoshop (требует ImageMagick) |
| ppm | Без потерь | Portable Pixmap (PPM/PGM/PBM) |
| eps | Векторный | Encapsulated PostScript |
| tga | Без потерь | Формат изображений Targa |

## Пример запроса {#example-request}

Преобразование в WebP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 85}'
```

Преобразование в PNG (без потерь):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/convert \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "png"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 2450000,
  "processedSize": 680000
}
```

## Примечания {#notes}

- Расширение имени выходного файла автоматически обновляется в соответствии с целевым форматом.
- Входные данные SVG растрируются при 300 DPI перед преобразованием.
- Преобразование PSD требует установки ImageMagick на сервере.
- BMP, EPS, ICO, JP2, JXL, PPM, QOI и TGA используют специализированные CLI-кодировщики и обходят обработку Sharp.
- Кодирование HEIC/HEIF использует системную библиотеку кодировщика HEIC.
- Входные форматы обширны: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW (CR2, NEF, ARW и др.), PSD, SVG, BMP и другие.
