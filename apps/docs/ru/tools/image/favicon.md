---
description: "Генерация всех стандартных размеров favicon и иконок приложения из исходного изображения."
i18n_source_hash: 3a6451a94b7a
i18n_provenance: human
i18n_output_hash: 1ce9b4effe40
---

# Генератор favicon {#favicon-generator}

Создаёт полный набор файлов favicon и иконок приложения из исходного изображения. Формирует все стандартные размеры, необходимые для браузеров, устройств Apple и Android, вместе с веб-манифестом и HTML-фрагментом.

## Конечная точка API {#api-endpoint}

`POST /api/v1/tools/image/favicon`

Принимает данные формы multipart с одним или несколькими файлами изображений и необязательным полем JSON `settings`.

## Параметры {#parameters}

| Параметр | Тип | Обязательный | По умолчанию | Описание |
|-----------|------|----------|---------|-------------|
| background | string | Нет | - | Фоновый цвет в hex (например, `"#ffffff"`). Если задан, иконка сводится на этот цвет. |
| padding | integer | Нет | `0` | Процент отступа вокруг содержимого иконки (от 0 до 40) |
| radius | integer | Нет | `0` | Процент радиуса скругления углов для округлённых иконок (от 0 до 50) |
| sizes | integer[] | Нет | - | Ограничить вывод конкретными размерами в пикселях (например, `[16, 32, 180]`). Опустите, чтобы сгенерировать все стандартные размеры. |
| themeColor | string | Нет | `"#ffffff"` | Цвет темы в hex для веб-манифеста |

## Сгенерированные файлы {#generated-files}

Для каждого входного изображения создаются следующие файлы:

| Файл | Размер | Назначение |
|------|------|---------|
| `favicon-16x16.png` | 16x16 | Иконка вкладки браузера |
| `favicon-32x32.png` | 32x32 | Иконка вкладки браузера (HiDPI) |
| `favicon-48x48.png` | 48x48 | Ярлык на рабочем столе |
| `apple-touch-icon.png` | 180x180 | Домашний экран iOS |
| `android-chrome-192x192.png` | 192x192 | Домашний экран Android |
| `android-chrome-512x512.png` | 512x512 | Заставка Android |
| `favicon.ico` | 32x32 | Устаревший формат ICO |
| `manifest.json` | - | Манифест веб-приложения со ссылками на иконки |
| `favicon-snippet.html` | - | Готовые к использованию HTML-теги link |

## Пример запроса {#example-request}

Одно исходное изображение со скруглёнными углами и отступом:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo.png" \
  -F 'settings={"padding": 10, "radius": 20, "themeColor": "#0a0a0a"}'
```

Несколько исходных изображений (каждое получает свой набор в подпапке):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/favicon \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@logo-light.png" \
  -F "file=@logo-dark.png"
```

## Пример ответа {#example-response}

Ответ представляет собой ZIP-файл, передаваемый напрямую. Заголовки ответа:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="favicons-a1b2c3d4.zip"
```

## Включённый HTML-фрагмент {#html-snippet-included}

ZIP содержит файл `favicon-snippet.html`, который можно вставить в HTML `<head>`:

```html
<!-- Favicons -->
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
```

## Примечания {#notes}

- Исходные изображения масштабируются в режиме `cover`, то есть обрезаются под каждый квадратный размер. Для наилучшего результата используйте квадратное исходное изображение.
- При загрузке нескольких файлов каждый получает свою подпапку в ZIP (названную по имени исходного файла).
- При загрузке одного файла все результаты находятся в корне ZIP без подпапки.
- Файлы, не прошедшие проверку или декодирование, пропускаются, а в ZIP включается `skipped-files.txt` с описанием проблем.
- Поддерживаемые входные форматы: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, SVG, RAW, PSD и другие.
- Ориентация EXIF применяется автоматически перед масштабированием.
