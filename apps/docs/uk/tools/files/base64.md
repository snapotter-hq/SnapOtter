---
description: "Кодує текст у Base64 або декодує Base64 назад у текст."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 3b9498270bd0
i18n_hash_version: 2
---

# Кодування й декодування Base64 {#base64}

Вставте текст, щоб отримати Base64, або вставте Base64, щоб отримати вихідний текст, а потім скопіюйте результат. Текст надсилається лише на ваш власний сервер SnapOtter і більше нікуди.

Щоб перетворити зображення на Base64, скористайтеся натомість [Зображення в Base64](/uk/tools/image/image-to-base64).

## Кінцева точка API {#api-endpoint}

`POST /api/v1/tools/files/base64`

Приймає тіло JSON, а не багаточастинні дані форми, і відповідає перетвореним текстом, а не файлом для завантаження.

## Параметри {#parameters}

| Назва | Тип | За замовчуванням | Опис |
|------|------|---------|-------------|
| `text` | string | (обов’язковий) | Текст для кодування або Base64 для декодування. До 1 000 000 символів. |
| `mode` | string | (обов’язковий) | `encode` або `decode`. |
| `urlSafe` | boolean | `false` | Під час кодування використовувати URL-безпечний алфавіт (`-` і `_`) та прибрати доповнення `=`. Під час декодування ігнорується. |

## Приклад запиту {#example-request}

Кодування:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Декодування:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Приклад відповіді {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Примітки {#notes}

- Текст кодується в UTF-8, тому літери з діакритикою, CJK та емодзі проходять пряме й зворотне перетворення без втрат.
- Під час декодування пробіли та розриви рядків ігноруються, тож Base64, розбитий на рядки по 76 символів (електронна пошта, тіла PEM), декодується в тому вигляді, в якому його вставлено.
- Під час декодування приймається ввід із доповненням `=` або без нього, у стандартному (`+`, `/`) або URL-безпечному (`-`, `_`) алфавіті, але не суміш двох алфавітів.
- Ввід, що не є Base64, завершується помилкою 400 із кодом `ENCODED_TEXT_INVALID`. Коректний Base64, який декодується в двійкові дані (зображення, ZIP), а не в текст UTF-8, завершується помилкою `DECODED_DATA_NOT_TEXT`.
