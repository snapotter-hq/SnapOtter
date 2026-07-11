---
description: "Исправление поддельно прозрачных PNG с помощью ИИ-маттинга (BiRefNet) для получения истинного альфа-канала, плюс очистка краёв от бахромы."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 29349bf69097
---

# Исправление прозрачности PNG {#png-transparency-fixer}

Исправьте поддельно прозрачные PNG одним кликом. Использует ИИ-маттинг (модель BiRefNet HR Matting) для получения истинной альфа-прозрачности, с постобработкой удаления бахромы для очистки краёв.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Обработка:** асинхронная (возвращает 202, опрашивайте `/api/v1/jobs/{jobId}/progress` для получения статуса через SSE)

**Пакет модели:** `background-removal` (4-5 ГБ)

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| file | file | Да | - | Файл изображения (multipart) |
| defringe | number | Нет | `30` | Интенсивность удаления бахромы (0-100). Удаляет полупрозрачные пиксели бахромы вокруг краёв |
| outputFormat | string | Нет | `"png"` | Формат вывода: `png` или `webp` |
| removeWatermark | boolean | Нет | `false` | Применить предварительную обработку удаления водяного знака (медианный фильтр) |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
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
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Итоговый результат (через SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/fake-transparent_fixed.png",
    "originalSize": 180000,
    "processedSize": 150000,
    "filename": "fake-transparent.png"
  }
}
```

## Примечания {#notes}

- Требуется установка пакета модели `background-removal` (4-5 ГБ).
- Использует `birefnet-hr-matting` в качестве основной модели для высококачественного альфа-маттинга. Переходит к `birefnet-general`, если HR-модели не хватает памяти.
- Опция `defringe` удаляет полупрозрачные пиксели бахромы, которые ИИ-маттинг иногда оставляет вокруг волос, меха и мелких краёв. Она работает, размывая альфа-канал и обнуляя пиксели с низкой уверенностью.
- Опция `removeWatermark` применяет шаг предварительной обработки медианным фильтром. Это базовое уменьшение водяного знака, а не специализированный инструмент удаления водяных знаков.
- Выводит только PNG или PNG без потерь WebP (оба поддерживают альфа-прозрачность).
- Поддерживает входные форматы HEIC/HEIF, RAW, TGA, PSD, EXR и HDR через автоматическое декодирование.
