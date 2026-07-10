---
description: "Обрезка с учётом объекта, лиц и энтропии, интеллектуально кадрирующая изображения с помощью Sharp и ИИ-обнаружения лиц."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: beda0a54e972
---

# Умная обрезка {#smart-crop}

Умная обрезка с учётом объекта, лиц или подрезки. Использует стратегии attention/entropy от Sharp и ИИ-обнаружение лиц для интеллектуального кадрирования.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `face-detection` (200-300 МБ) - требуется только для режима `face`

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| mode | string | Нет | `"subject"` | Режим обрезки: `subject`, `face`, `trim`. (Устаревшие значения `attention` и `content` сопоставляются с `subject` и `trim`) |
| strategy | string | Нет | `"attention"` | Стратегия для режима объекта: `attention` или `entropy` |
| width | integer | Нет | - | Целевая ширина в пикселях |
| height | integer | Нет | - | Целевая высота в пикселях |
| padding | integer | Нет | `0` | Процент отступа вокруг объекта (0-50) |
| facePreset | string | Нет | `"head-shoulders"` | Предустановка кадрирования лица: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Нет | `0.5` | Чувствительность обнаружения лиц (0-1) |
| threshold | integer | Нет | `30` | Порог режима подрезки для обнаружения фона (0-255) |
| padToSquare | boolean | Нет | `false` | Дополнить обрезанный результат до квадрата |
| padColor | string | Нет | `"#ffffff"` | Цвет фона для отступов |
| targetSize | integer | Нет | - | Целевой размер для дополненного вывода (в пикселях) |
| quality | integer | Нет | - | Качество вывода (1-100) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Режимы {#modes}

### Режим объекта {#subject-mode}
Использует стратегию attention или entropy от Sharp для поиска наиболее визуально интересной области и обрезает вокруг неё.

### Режим лица {#face-mode}
Обнаруживает лица с помощью ИИ, затем кадрирует обрезку вокруг обнаруженных лиц с использованием заданного `facePreset`. Переходит к режиму объекта (стратегия attention), если лица не обнаружены.

### Режим подрезки {#trim-mode}
Удаляет однородные границы/фон с изображения. При желании дополняет результат до квадрата с заданным цветом фона и целевым размером.

## Примечания {#notes}

- Этот инструмент использует фабрику `createToolRoute` с `executionHint: "long"`, поэтому возвращает 202 с прогрессом через SSE.
- Режим лица требует пакет модели `face-detection` (200-300 МБ).
- Режимы объекта и подрезки работают без какого-либо пакета ИИ-модели.
- `facePreset` определяет, насколько плотно обрезка кадрирует обнаруженные лица: `closeup` самый плотный, `half-body` самый широкий.
- Если ширина/высота не заданы, по умолчанию используется 1080x1080.
