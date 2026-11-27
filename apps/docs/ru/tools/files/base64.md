---
description: "Кодирование текста в Base64 или декодирование Base64 обратно в текст."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: acef52584a49
i18n_hash_version: 2
---

# Кодирование и декодирование Base64 {#base64}

Вставьте текст, чтобы получить Base64, или вставьте Base64, чтобы получить исходный текст, затем скопируйте результат. Текст отправляется только на ваш собственный сервер SnapOtter и больше никуда.

Чтобы превратить изображение в Base64, используйте вместо этого [Изображение в Base64](/ru/tools/image/image-to-base64).

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/files/base64`

Принимает тело JSON, а не multipart form data, и отвечает преобразованным текстом, а не файлом для загрузки.

## Параметры {#parameters}

| Имя | Тип | По умолчанию | Описание |
|------|------|---------|-------------|
| `text` | string | (обязательный) | Текст для кодирования или Base64 для декодирования. До 1 000 000 символов. |
| `mode` | string | (обязательный) | `encode` или `decode`. |
| `urlSafe` | boolean | `false` | При кодировании использовать URL-безопасный алфавит (`-` и `_`) и отбросить заполнение `=`. При декодировании игнорируется. |

## Пример запроса {#example-request}

Кодирование:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Декодирование:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Пример ответа {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Примечания {#notes}

- Текст кодируется в UTF-8, поэтому буквы с диакритикой, CJK и эмодзи проходят прямое и обратное преобразование без потерь.
- При декодировании пробелы и переносы строк игнорируются, поэтому Base64, разбитый на строки по 76 символов (электронная почта, тела PEM), декодируется в том виде, в каком вставлен.
- При декодировании допускается ввод с заполнением `=` или без него, в стандартном (`+`, `/`) или URL-безопасном (`-`, `_`) алфавите, но не смесь двух алфавитов.
- Ввод, который не является Base64, завершается ошибкой 400 с кодом `ENCODED_TEXT_INVALID`. Корректный Base64, который декодируется в двоичные данные (изображение, ZIP), а не в текст UTF-8, завершается ошибкой `DECODED_DATA_NOT_TEXT`.
