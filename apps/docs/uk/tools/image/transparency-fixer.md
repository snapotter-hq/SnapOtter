---
description: "Виправлення фейкових прозорих PNG за допомогою ШІ-матування (BiRefNet) для отримання справжньої альфи, а також очищення країв методом дефринджу."
i18n_source_hash: 7eb748b80f93
i18n_provenance: human
i18n_output_hash: 7f0b6f87571e
---

# Виправлення прозорості PNG {#png-transparency-fixer}

Виправте фейкові прозорі PNG одним кліком. Використовує ШІ-матування (модель BiRefNet HR Matting) для отримання справжньої альфа-прозорості, з постобробкою дефринджу для очищення країв.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/transparency-fixer`

**Обробка:** Асинхронна (повертає 202, опитуйте `/api/v1/jobs/{jobId}/progress` щодо стану через SSE)

**Пакет моделі:** `background-removal` (4-5 ГБ)

## Параметри {#parameters}

| Параметр | Тип | Обов’язковий | За замовчуванням | Опис |
|-----------|------|----------|---------|-------------|
| file | file | Так | - | Файл зображення (багаточастинний) |
| defringe | number | Ні | `30` | Інтенсивність дефринджу (0-100). Видаляє напівпрозорі бахромисті пікселі навколо країв |
| outputFormat | string | Ні | `"png"` | Формат виводу: `png` або `webp` |
| removeWatermark | boolean | Ні | `false` | Застосувати попередню обробку видалення водяного знака (медіанний фільтр) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":40,"outputFormat":"png"}'
```

## Відповідь {#response}

### Початкова відповідь (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Прогрес (SSE на `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Processing transparency...","percent":50}
```

### Кінцевий результат (через SSE) {#final-result-via-sse}

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

## Примітки {#notes}

- Потребує встановленого пакета моделі `background-removal` (4-5 ГБ).
- Використовує `birefnet-hr-matting` як основну модель для високоякісного альфа-матування. Повертається до `birefnet-general`, якщо HR-моделі бракує пам’яті.
- Опція `defringe` видаляє напівпрозорі бахромисті пікселі, які ШІ-матування іноді залишає навколо волосся, хутра та тонких країв. Вона працює шляхом розмиття альфа-каналу та обнулення пікселів із низькою впевненістю.
- Опція `removeWatermark` застосовує крок попередньої обробки медіанним фільтром. Це базове зменшення водяного знака, а не спеціалізований інструмент видалення водяних знаків.
- Виводить лише PNG або WebP без втрат (обидва підтримують альфа-прозорість).
- Підтримує вхідні формати HEIC/HEIF, RAW, TGA, PSD, EXR та HDR через автоматичне декодування.
