---
description: "Переименование нескольких файлов по шаблону и скачивание в виде ZIP."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: a373c9cdebd6
---

# Массовое переименование {#bulk-rename}

Переименовывайте несколько файлов по шаблону с заполнителями для индекса, индекса с дополнением нулями и исходного имени файла. Возвращает ZIP-архив со всеми переименованными файлами.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Принимает multipart form data с несколькими файлами и полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| pattern | string | Нет | `"image-{{index}}"` | Шаблон именования с заполнителями (макс. 1000 символов) |
| startIndex | number | Нет | `1` | Начальный номер индекса |

### Заполнители шаблона {#pattern-placeholders}

| Заполнитель | Описание | Пример |
|-------------|-------------|---------|
| `{{index}}` | Последовательный номер, начиная с `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Последовательный номер с дополнением нулями | `01`, `02`, `03` |
| `{{original}}` | Исходное имя файла без расширения | `photo`, `IMG_001` |

Исходное расширение файла всегда сохраняется.

## Пример запроса {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Это даёт: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Использование исходного имени файла:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Это даёт: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Пример ответа {#example-response}

Ответ представляет собой файл ZIP, передаваемый напрямую (не ответ JSON). Заголовки ответа:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Примечания {#notes}

- Этот инструмент не обрабатывает изображения. Он только переименовывает файлы и упаковывает их в ZIP-архив.
- Ширина дополнения нулями для `{{padded}}` определяется автоматически на основе общего количества файлов (например, для 100 файлов будет использоваться 3-значное дополнение: `001`, `002` и т. д.).
- Расширения файлов сохраняются из исходных имён файлов.
- Имена файлов очищаются от небезопасных символов.
- Необходимо предоставить хотя бы один файл.
