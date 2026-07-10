---
description: "Додавайте ефекти наростання та згасання до аудіо."
i18n_source_hash: 86856451ecb8
i18n_provenance: human
i18n_output_hash: e2bdb9adda1a
---

# Наростання та згасання аудіо {#fade-audio}

Додавайте ефекти наростання та згасання до початку й кінця аудіофайлу.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/audio/fade-audio`

Приймає багаточастинні дані форми з аудіофайлом та JSON-полем `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| fadeInS | number | Ні | `1` | Тривалість наростання в секундах (0 до 30) |
| fadeOutS | number | Ні | `1` | Тривалість згасання в секундах (0 до 30) |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/fade-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"fadeInS": 2, "fadeOutS": 3}'
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

- Задайте будь-яке значення `0`, щоб пропустити цей напрямок згасання. Принаймні одне має бути більшим за 0.
- Тривалість згасання обмежується довжиною аудіо, якщо перевищує її.
- Вихід зазвичай зберігає вхідний контейнер. Вхід AAC записується як M4A, а непідтримувані входи лише для декодування переходять на MP3.
