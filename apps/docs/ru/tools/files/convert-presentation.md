---
description: "Конвертация между форматами презентаций PowerPoint и OpenDocument."
i18n_source_hash: 08ba415d39ac
i18n_provenance: human
i18n_output_hash: 05816e87e646
---

# Конвертация презентации {#convert-presentation}

Конвертация презентаций между форматами PowerPoint (PPTX) и OpenDocument Presentation (ODP).

## Эндпоинт API {#api-endpoint}

`POST /api/v1/tools/files/convert-presentation`

Принимает multipart form data с файлом PowerPoint/ODP и JSON-полем `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| format | string | Да | - | Формат вывода: `pptx`, `odp` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-presentation \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slides.pptx" \
  -F 'settings={"format": "odp"}'
```

## Пример ответа {#example-response}

Возвращает `202 Accepted`. Отслеживайте прогресс через SSE по адресу `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Примечания {#notes}

- Принимаемые входные форматы: `.pptx`, `.ppt`, `.odp`.
- Конвертация выполняется LibreOffice, работающим в безголовом режиме на сервере.
- Анимации и эффекты переходов могут не сохраниться между форматами.
- Выходной формат должен отличаться от входного.
