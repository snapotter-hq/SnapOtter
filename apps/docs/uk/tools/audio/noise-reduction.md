---
description: "Зменшуйте фоновий шум в аудіо за допомогою шумозаглушення на основі FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 66e0acd979f3
---

# Зменшення шуму {#noise-reduction}

Зменшуйте фоновий шум в аудіофайлі за допомогою шумозаглушення на основі FFT із вибираною силою.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| strength | string | Ні | `"medium"` | Сила шумозаглушення: `light`, `medium`, `strong` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Примітки {#notes}

- `light` зберігає більше деталей, але видаляє менше шуму. `strong` видаляє більше шуму, але може вносити ледь помітні артефакти.
- Найкращі результати на записах зі сталим фоновим шумом (гул вентилятора, кондиціонер, статика).
- Вихід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи лише для декодування переходять на MP3.
