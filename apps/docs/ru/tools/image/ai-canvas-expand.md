---
description: "Расширение холста изображения с помощью AI-аутпейнтинга, растягивая его в любом направлении и заполняя новые области в соответствии с оригиналом."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 74550d551857
---

# AI-расширение холста {#ai-canvas-expand}

Расширьте холст изображения с помощью заполнения на основе AI (аутпейнтинг). Растягивает изображение в любом направлении и заполняет новые области сгенерированным AI содержимым, соответствующим существующему изображению.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `object-eraser-colorize` (1–2 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| extendTop | integer | Нет | `0` | Пикселей для расширения сверху |
| extendRight | integer | Нет | `0` | Пикселей для расширения справа |
| extendBottom | integer | Нет | `0` | Пикселей для расширения снизу |
| extendLeft | integer | Нет | `0` | Пикселей для расширения слева |
| tier | string | Нет | `"balanced"` | Уровень качества: `fast`, `balanced`, `high` |
| format | string | Нет | `"auto"` | Выходной формат: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| quality | integer | Нет | `95` | Качество вывода (1–100) |

Хотя бы одно направление расширения должно быть больше 0.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## Ответ {#response}

### Первоначальный ответ (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогресс (SSE по адресу `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## Примечания {#notes}

- Требует установки пакета модели `object-eraser-colorize` (1–2 ГБ).
- Использует аутпейнтинг на основе LaMa для генерации содержимого расширенных областей.
- Параметр `tier` обменивает скорость на качество: `fast` быстро выдаёт результаты с возможными артефактами, `high` занимает больше времени, но даёт более плавное и связное заполнение.
- Значения расширения указываются в пикселях. Итоговые размеры изображения будут: исходная ширина + extendLeft + extendRight на исходную высоту + extendTop + extendBottom.
- Для выходных форматов, не поддерживающих предпросмотр в браузере (HEIC, JXL, TIFF), рядом с основным выводом создаётся предпросмотр WebP.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
