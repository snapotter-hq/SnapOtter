---
description: "Снижение фонового шума в аудио с помощью шумоподавления на основе FFT."
i18n_source_hash: 57cbdbd449aa
i18n_provenance: human
i18n_output_hash: 38916b2fdd66
---

# Шумоподавление {#noise-reduction}

Снижайте фоновый шум в аудиофайле с помощью шумоподавления на основе FFT с выбираемой силой.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/noise-reduction`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| strength | string | Нет | `"medium"` | Сила шумоподавления: `light`, `medium`, `strong` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/noise-reduction \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strength": "strong"}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Примечания {#notes}

- `light` сохраняет больше деталей, но удаляет меньше шума. `strong` удаляет больше шума, но может вносить малозаметные артефакты.
- Лучшие результаты на записях с постоянным фоновым шумом (гул вентилятора, кондиционер, статический шум).
- Вывод обычно сохраняет входной контейнер. Вход AAC записывается как M4A, а неподдерживаемые для декодирования входы откатываются к MP3.
