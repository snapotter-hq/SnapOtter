---
description: "Автоулучшение в один клик, которое анализирует изображение и корректирует экспозицию, контраст, баланс белого, насыщенность и резкость."
i18n_source_hash: 42b6ab956f91
i18n_provenance: human
i18n_output_hash: 3c66b37d8c08
---

# Улучшение изображения {#image-enhancement}

Автоулучшение в один клик с умным анализом. Анализирует изображение и применяет коррекции экспозиции, контраста, баланса белого, насыщенности, резкости и шумоподавления.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/image-enhancement`

**Обработка:** синхронная (использует фабрику `createToolRoute`, возвращает результат напрямую)

**Пакет модели:** для базового улучшения не требуется. Пакет `upscale-enhance` (5-6 ГБ) используется только при включённом `deepEnhance` (для ИИ-шумоподавления через SCUNet).

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| mode | string | Нет | `"auto"` | Режим улучшения: `auto`, `portrait`, `landscape`, `low-light`, `food`, `document` |
| intensity | number | Нет | `50` | Общая интенсивность улучшения (0-100) |
| corrections | object | Нет | все `true` | Выборочные коррекции для применения (см. ниже) |
| deepEnhance | boolean | Нет | `false` | Включить ИИ-шумоподавление (требует установленного инструмента `noise-removal`) |

### Объект corrections {#corrections-object}

| Поле | Тип | По умолчанию | Описание |
|-------|------|---------|-------------|
| exposure | boolean | `true` | Автокоррекция экспозиции |
| contrast | boolean | `true` | Автокоррекция контраста |
| whiteBalance | boolean | `true` | Автокоррекция баланса белого |
| saturation | boolean | `true` | Автокоррекция насыщенности |
| sharpness | boolean | `true` | Автоповышение резкости |
| denoise | boolean | `true` | Лёгкое шумоподавление |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement \
  -F "file=@photo.jpg" \
  -F 'settings={"mode":"portrait","intensity":70,"corrections":{"exposure":true,"contrast":true,"sharpness":false}}'
```

## Ответ (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/photo.jpg",
  "originalSize": 300000,
  "processedSize": 310000
}
```

## Конечная точка Analyze {#analyze-endpoint}

`POST /api/v1/tools/image/image-enhancement/analyze`

Анализирует изображение и возвращает рекомендации по коррекции, не применяя их.

### Параметры {#parameters-1}

| Параметр | Тип | Обязательный | Описание |
|-----------|------|----------|-------------|
| file | file | Да | Файл изображения (multipart) |

### Пример запроса {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-enhancement/analyze \
  -F "file=@photo.jpg"
```

### Ответ (200 OK) {#response-200-ok-1}

```json
{
  "corrections": {
    "exposure": { "value": 0.3, "direction": "brighten" },
    "contrast": { "value": 0.2, "direction": "increase" },
    "whiteBalance": { "value": 200, "direction": "warmer" },
    "saturation": { "value": 0.1, "direction": "increase" },
    "sharpness": { "value": 0.4, "direction": "sharpen" }
  }
}
```

## Примечания {#notes}

- Этот инструмент использует синхронную фабрику `createToolRoute`, поэтому возвращает стандартный ответ (а не 202 async).
- Параметр `mode` регулирует то, как взвешиваются коррекции (например, портретный режим бережнее относится к тонам кожи, пейзажный режим усиливает насыщенность).
- Когда `deepEnhance` включён и установлен инструмент `noise-removal` (SCUNet), после стандартных коррекций применяется дополнительный проход ИИ-шумоподавления.
- Конечная точка analyze полезна для предпросмотра того, какие коррекции будут применены, перед их подтверждением.
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
