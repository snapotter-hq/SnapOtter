---
description: "Преобразование речи в текст с помощью транскрипции на базе ИИ."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 835aa5b69c30
---

# Транскрипция аудио {#transcribe-audio}

Преобразование речи в текст с помощью транскрипции на базе ИИ (faster-whisper). Поддерживает вывод в форматах обычного текста, SRT и VTT с автоматическим или ручным выбором языка.

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Принимает multipart form data с аудиофайлом и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| language | string | Нет | `"auto"` | Язык: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | Нет | `"txt"` | Формат вывода: `txt`, `srt`, `vtt` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Пример ответа {#example-response}

Это асинхронный инструмент. API сразу возвращает `202 Accepted`:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Отслеживайте прогресс через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`. После завершения задачи поток SSE доставляет итоговый результат с `downloadUrl`.

## Примечания {#notes}

- Требует установки набора функций **transcription**. Возвращает `501` с кодом `FEATURE_NOT_INSTALLED`, отсутствующим `feature`, `featureName` и `estimatedSize`, если набор недоступен.
- Использует faster-whisper для транскрипции. Язык `auto` определяет произносимый язык автоматически.
- Форматы `srt` и `vtt` включают временные метки для каждого сегмента, что подходит для субтитров.
- Формат `txt` возвращает обычный текст без временных меток.
- Это долго выполняющийся инструмент ИИ; время обработки зависит от длины аудио и аппаратного обеспечения сервера.
