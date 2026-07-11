---
description: "Выравнивание громкости до вещательных стандартных уровней (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 0c340937911b
---

# Нормализация аудио {#normalize-audio}

Выровняйте громкость аудио до вещательных стандартных уровней с помощью нормализации EBU R128 (-16 LUFS).

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Принимает данные формы multipart с аудиофайлом и полем `settings` в формате JSON.

## Параметры {#parameters}

У этого инструмента нет настраиваемых параметров. Он автоматически применяет нормализацию громкости EBU R128.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- Использует стандарт громкости EBU R128 с целевым значением -16 LUFS.
- Идеально для подкастов, аудиокниг и вещательного контента, где важна постоянная громкость.
- Исходная частота дискретизации сохраняется в выводе.
- Вывод обычно сохраняет входной контейнер. Вход AAC записывается как M4A, а неподдерживаемые для декодирования входы откатываются к MP3.
