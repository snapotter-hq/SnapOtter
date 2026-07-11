---
description: "Замена фона изображения на сплошной цвет или градиент с помощью AI."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 29e24f3ace82
---

# Замена фона {#background-replace}

Замените фон изображения на сплошной цвет или градиент. Модель AI обнаруживает объект, удаляет исходный фон и накладывает объект на выбранный вами фон.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Принимает multipart form data с файлом изображения и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Нет | `"color"` | Режим фона: `color` или `gradient` |
| color | string | Нет | `"#ffffff"` | Hex-цвет фона (когда backgroundType равен `color`) |
| gradientColor1 | string | Нет | - | Первый hex-цвет градиента |
| gradientColor2 | string | Нет | - | Второй hex-цвет градиента |
| gradientAngle | integer | Нет | `180` | Угол градиента в градусах (0–360) |
| feather | integer | Нет | `0` | Радиус растушёвки краёв (0–20) |
| format | string | Нет | `"png"` | Выходной формат: `png` или `webp` |

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Пример ответа {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Отслеживайте прогресс через SSE по адресу `GET /api/v1/jobs/{jobId}/progress`. По завершении задания поток SSE отправляет событие `completed` с URL для скачивания.

## Примечания {#notes}

- Это инструмент на основе AI, который возвращает `202 Accepted` и обрабатывается асинхронно. Подключитесь к конечной точке SSE, чтобы получать обновления прогресса и итоговый результат.
- Требует установки пакета функций **background-removal**. Возвращает `501`, если пакет недоступен.
- Входные данные HEIC, RAW, PSD и SVG автоматически декодируются перед обработкой.
- По умолчанию вывод в формате PNG для сохранения прозрачности вокруг объекта.
