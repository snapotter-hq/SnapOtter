---
description: "Заміна фону зображення суцільним кольором або градієнтом за допомогою ШІ."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 6732f77d11df
---

# Заміна фону {#background-replace}

Заміна фону зображення суцільним кольором або градієнтом. Модель ШІ виявляє об'єкт, видаляє початковий фон і компонує об'єкт на обраному вами фоні.

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Приймає дані форми у форматі multipart із файлом зображення та полем JSON `settings`.

## Параметри {#parameters}

| Параметр | Тип | Обов'язковий | Типове значення | Опис |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Ні | `"color"` | Режим фону: `color` або `gradient` |
| color | string | Ні | `"#ffffff"` | Шістнадцятковий колір фону (коли backgroundType має значення `color`) |
| gradientColor1 | string | Ні | - | Перший шістнадцятковий колір градієнта |
| gradientColor2 | string | Ні | - | Другий шістнадцятковий колір градієнта |
| gradientAngle | integer | Ні | `180` | Кут градієнта у градусах (0-360) |
| feather | integer | Ні | `0` | Радіус розмиття країв (0-20) |
| format | string | Ні | `"png"` | Вихідний формат: `png` або `webp` |

## Приклад запиту {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Приклад відповіді {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Відстежуйте перебіг через SSE за адресою `GET /api/v1/jobs/{jobId}/progress`. Після завершення завдання потік SSE видає подію `completed` з URL для завантаження.

## Примітки {#notes}

- Це інструмент на основі ШІ, який повертає `202 Accepted` і обробляється асинхронно. Підключіться до кінцевої точки SSE, щоб отримувати оновлення перебігу та кінцевий результат.
- Потребує встановлення пакета функцій **background-removal**. Повертає `501`, якщо пакет недоступний.
- Вхідні дані HEIC, RAW, PSD та SVG автоматично декодуються перед обробкою.
- Вихідний формат за замовчуванням PNG для збереження прозорості навколо об'єкта.
