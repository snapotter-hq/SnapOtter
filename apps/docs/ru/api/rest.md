---
description: "Полный справочник по REST API. Эндпоинты инструментов, пакетная обработка, конвейеры, файловая библиотека, аутентификация, команды и административные операции."
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: a840793765eb
---

# Справочник по REST API {#rest-api-reference}

Интерактивная документация API с примерами запросов и ответов доступна по адресу [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Машиночитаемые спецификации:
- `/api/v1/openapi.yaml` - спецификация OpenAPI 3.1
- `/llms.txt` - краткое описание, удобное для LLM
- `/llms-full.txt` - полная документация, удобная для LLM

## Аутентификация {#authentication}

Все эндпоинты требуют аутентификации, если только `AUTH_ENABLED=false`.

### Токен сессии {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

Сессии истекают через 7 дней (настраивается через `SESSION_DURATION_HOURS`).

### Ключи API {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Ключи имеют префикс `si_` и хранятся в виде хешей scrypt: необработанный ключ показывается один раз и больше никогда не может быть получен.

### Эндпоинты аутентификации {#auth-endpoints}

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Публичный | Вход, получение токена сессии |
| `POST` | `/api/auth/logout` | Auth | Уничтожение текущей сессии |
| `GET` | `/api/auth/session` | Auth | Проверка текущей сессии |
| `POST` | `/api/auth/change-password` | Auth | Смена собственного пароля (аннулирует все остальные сессии и ключи API) |
| `GET` | `/api/auth/users` | Admin | Список всех пользователей |
| `POST` | `/api/auth/register` | Admin | Создание нового пользователя |
| `PUT` | `/api/auth/users/:id` | Admin | Обновление роли или команды пользователя |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Сброс пароля пользователя |
| `DELETE` | `/api/auth/users/:id` | Admin | Удаление пользователя |
| `GET` | `/api/v1/config/auth` | Публичный | Проверка, включена ли аутентификация (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Запуск регистрации TOTP MFA. Требует корпоративной функции `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Подтверждение регистрации MFA с помощью кода TOTP |
| `POST` | `/api/auth/mfa/complete` | Публичный | Завершение ожидающего входа с MFA |
| `POST` | `/api/auth/mfa/disable` | Auth | Отключение MFA для текущего пользователя |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Сброс MFA для пользователя |
| `GET` | `/api/auth/oidc/login` | Публичный | Запуск входа через OIDC, когда OIDC включён |
| `GET` | `/api/auth/oidc/callback` | Публичный | Обратный вызов авторизации OIDC |
| `GET` | `/api/auth/saml/metadata` | Публичный | XML-метаданные SAML SP, когда SAML включён |
| `GET` | `/api/auth/saml/login` | Публичный | Запуск входа через SAML |
| `POST` | `/api/auth/saml/callback` | Публичный | Служба обработки утверждений SAML |

Когда для пользователя включён MFA, `POST /api/auth/login` возвращает `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` вместо токена сессии. Отправьте этот `mfaToken` вместе с кодом TOTP или кодом восстановления на `/api/auth/mfa/complete`.

### Разрешения {#permissions}

| Разрешение | Admin | User |
|-----------|:-----:|:----:|
| Использование инструментов | ✓ | ✓ |
| Собственные файлы/конвейеры/ключи API | ✓ | ✓ |
| Просмотр файлов/конвейеров/ключей всех пользователей | ✓ | - |
| Запись настроек | ✓ | - |
| Управление пользователями и командами | ✓ | - |
| Управление брендингом | ✓ | - |

## Проверка работоспособности {#health-check}

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Публичный | Базовая проверка работоспособности. Возвращает `{"status":"healthy","version":"..."}` с кодом 200 или `{"status":"unhealthy"}` с кодом 503, если база данных недоступна. |
| `GET` | `/api/v1/readyz` | Публичный | Проба готовности. Проверяет PostgreSQL, Redis, дисковое пространство и S3, если он настроен. Возвращает 503, когда экземпляр не должен принимать трафик. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Подробная диагностика, включая время работы, режим хранилища, состояние базы данных, состояние очереди и доступность GPU. |

## Использование инструментов {#using-tools}

Каждый инструмент следует одному и тому же шаблону:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` является одним из `image`, `video`, `audio`, `pdf` или `files`.

- Загрузка выполняется через `multipart/form-data`.
- `settings` - это строка JSON с опциями, специфичными для инструмента.
- `clientJobId` - это необязательное поле формы для сопоставления прогресса, предоставляемого вызывающей стороной.
- `fileId` - это необязательное поле формы, ссылающееся на существующий элемент файловой библиотеки. Если оно присутствует, обработанный результат сохраняется как новая версия, а ответ включает `savedFileId`.
- **Быстрые инструменты** обычно возвращают JSON с кодом 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Получите обработанный файл из `downloadUrl`.
- **Любой поставленный в очередь инструмент** может вернуть JSON с кодом 202, если он долго выполняется или превышает окно синхронного ожидания: `{"jobId":"...","async":true}`. Подключитесь к SSE для отслеживания прогресса, затем скачайте по завершении (см. [Отслеживание прогресса](#progress-tracking)).
- **Пакетные** маршруты возвращают ZIP-архив, передаваемый напрямую (с заголовком `X-Job-Id`), для инструментов, зарегистрированных в общем реестре пакетной обработки.

## Справочник по инструментам {#tools-reference}

### Пресеты конвертации {#conversion-presets}

Общий каталог включает 83 выделенных эндпоинта пресетов конвертации, таких как `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` и `excel-to-csv`. Пресеты являются полноценными маршрутами инструментов:

`POST /api/v1/tools/<section>/<presetId>`

Каждый пресет фиксирует выходной формат и делегирует базовому инструменту, такому как `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` или `convert-spreadsheet`. См. [Пресеты конвертации](/ru/tools/conversion-presets) для полной таблицы маршрутов и необязательных настроек.

### Основы {#essentials}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `resize` | Изменение размера | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, плюс 23 пресета для социальных сетей |
| `crop` | Обрезка | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Поворот и отражение | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Конвертация | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Сжатие | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Оптимизация {#optimization}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `optimize-for-web` | Оптимизация для веба | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Удаление метаданных | - |
| `edit-metadata` | Редактирование метаданных | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Массовое переименование | `pattern` (поддерживает `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Изображение в PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Генератор фавиконок | `padding`, `backgroundColor`, `borderRadius` - генерирует все стандартные размеры |

### Корректировки {#adjustments}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `adjust-colors` | Настройка цветов | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Резкость | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Замена цвета | `sourceColor`, `targetColor` (замена), `makeTransparent`, `tolerance` |
| `color-blindness` | Симуляция дальтонизма | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, по умолчанию "deuteranomaly") |
| `duotone` | Дуотон | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Пикселизация | `blockSize` (2-128), `region` ({left, top, width, height} для частичной пикселизации) |
| `vignette` | Виньетка | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Инструменты ИИ {#ai-tools}

Все инструменты ИИ работают на вашем оборудовании: по умолчанию на CPU или на NVIDIA CUDA, когда доступен поддерживаемый GPU NVIDIA. Ускорение через iGPU Intel/AMD посредством VA-API, Quick Sync или OpenCL сегодня не поддерживается для вывода ИИ. Подключение к интернету не требуется.

| ID инструмента | Название | Модель ИИ | Ключевые настройки |
|---------|------|---------|-------------|
| `remove-background` | Удаление фона | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Апскейлинг изображений | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Ластик объектов | LaMa (ONNX) | Маска отправляется вторым файловым фрагментом (имя поля `mask`), `format`, `quality` |
| `ocr` | OCR / извлечение текста | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Размытие лиц / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Умная обрезка | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Улучшение изображений | На основе анализа | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Улучшение лиц | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | ИИ-колоризация | DDColor | `intensity`, `model` |
| `noise-removal` | Удаление шума | Многоуровневое шумоподавление | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Удаление красных глаз | Ориентиры лица + анализ цвета | `sensitivity`, `strength` |
| `restore-photo` | Реставрация фото | Многошаговый конвейер | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Фото на паспорт | Ориентиры MediaPipe | Двухфазный процесс. Анализ использует multipart `file`; генерация использует JSON с `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), ориентирами, размерами изображения |
| `content-aware-resize` | Изменение размера с учётом содержимого | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Исправление прозрачности PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Замена фона | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Размытие фона | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | ИИ-расширение холста | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Водяные знаки и наложения {#watermark-overlay}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `watermark-text` | Текстовый водяной знак | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Водяной знак изображением | `opacity`, `position`, `scale` - второй файл является водяным знаком |
| `text-overlay` | Наложение текста | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Композиция изображений | `x`, `y`, `opacity`, `blend` - второй файл накладывается сверху |
| `meme-generator` | Генератор мемов | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Поддерживает режим шаблона (тело JSON с `templateId`) или режим пользовательского изображения (multipart с файлом). |

### Утилиты {#utilities}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `info` | Информация об изображении | - (возвращает ширину, высоту, формат, размер, каналы, hasAlpha, DPI, EXIF) |
| `compare` | Сравнение изображений | `mode` (side-by-side/overlay/diff), `diffThreshold` - второй файл является целью сравнения |
| `find-duplicates` | Поиск дубликатов | `threshold` (расстояние перцептивного хеша, по умолчанию 8) - многофайловый |
| `color-palette` | Цветовая палитра | `count` (количество доминирующих цветов), `format` (hex/rgb) |
| `qr-generate` | Генератор QR-кодов | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (необязательный файл) |
| `barcode-read` | Считыватель штрихкодов | - (автоматически определяет QR, EAN, Code128, DataMatrix и т. д.) |
| `image-to-base64` | Изображение в Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML в изображение | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Гистограмма | `scale` (linear/log) - возвращает график RGB-гистограммы + статистику по каждому каналу |
| `lqip-placeholder` | Заглушка LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Генератор штрихкодов | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Тело JSON, без загрузки файла. |

### Макет и композиция {#layout-composition}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `collage` | Коллаж / сетка | `template` (25+ макетов), `gap`, `backgroundColor`, `borderRadius` - многофайловый |
| `stitch` | Сшивание / объединение | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - многофайловый |
| `split` | Разделение изображения | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Рамка и обрамление | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Оформление скриншота | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Круглая обрезка | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Дополнение изображения | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Спрайт-лист | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - многофайловый (2-64 изображения) |

### Формат и конвертация {#format-conversion}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `svg-to-raster` | SVG в растр | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Изображение в SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Инструменты GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), параметры, специфичные для действия |
| `gif-webp` | Конвертер GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Инструменты для видео {#video-tools}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `convert-video` | Конвертация видео | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Сжатие видео | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Обрезка видео | `startS`, `endS`, `precise` (bool, покадрово точная нарезка) |
| `mute-video` | Отключение звука видео | - |
| `video-to-gif` | Видео в GIF | `fps` (1-30), `width`, `startS`, `durationS` (макс. 60 с) |
| `resize-video` | Изменение размера видео | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Обрезка кадра видео | `width`, `height`, `x`, `y` |
| `rotate-video` | Поворот видео | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Изменение FPS | `fps` (1-120) |
| `video-color` | Цвет видео | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Скорость видео | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Реверс видео | - (макс. 5 минут) |
| `video-loudnorm` | Нормализация звука | - (EBU R128) |
| `aspect-pad` | Дополнение под пропорции | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Дополнение размытием | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Водяной знак на видео | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Стабилизация видео | `smoothing` (5-60, в кадрах) |
| `gif-to-video` | GIF в видео | `format` (mp4/webm/mov) |
| `video-to-webp` | Видео в WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Видео в кадры | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Объединение видео | - (многофайловый, нормализуется под разрешение первого видео) |
| `replace-audio` | Замена звука | - (видео + аудиофайл, два файла) |
| `burn-subtitles` | Впечатывание субтитров | `fontSize` (8-72) - видео + файл субтитров |
| `embed-subtitles` | Встраивание субтитров | `language` (код ISO 639-2/B) - видео + файл субтитров |
| `extract-subtitles` | Извлечение субтитров | - (выводит SRT) |
| `images-to-video` | Изображения в видео | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - многофайловый |
| `video-metadata` | Очистка метаданных видео | - |
| `auto-subtitles` | Авто-субтитры (ИИ) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Извлечение звука | `format` (mp3/wav/m4a/ogg) |

### Инструменты для аудио {#audio-tools}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `convert-audio` | Конвертация аудио | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Обрезка аудио | `startS`, `endS` |
| `volume-adjust` | Регулировка громкости | `gainDb` (от -30 до 30) |
| `normalize-audio` | Нормализация звука | - (EBU R128, -16 LUFS) |
| `fade-audio` | Затухание звука | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Реверс аудио | - |
| `audio-speed` | Скорость аудио | `factor` (0.25-4) |
| `pitch-shift` | Сдвиг высоты тона | `semitones` (от -12 до 12) |
| `audio-channels` | Аудиоканалы | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Удаление тишины | `thresholdDb` (от -80 до -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Шумоподавление | `strength` (light/medium/strong) |
| `merge-audio` | Объединение аудио | `format` (mp3/wav/flac/m4a) - многофайловый |
| `split-audio` | Разделение аудио | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Создание рингтонов | `startS`, `durationS` (1-30) |
| `waveform-image` | Изображение волновой формы | `width`, `height`, `color` (hex) |
| `audio-metadata` | Метаданные аудио | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Транскрибация аудио (ИИ) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Инструменты для документов {#document-tools}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `merge-pdf` | Объединение PDF | - (многофайловый, до 20 PDF) |
| `split-pdf` | Разделение PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Сжатие PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Поворот PDF | `angle` (90/180/270), `range` (диапазон страниц) |
| `extract-pages` | Извлечение страниц | `range` (синтаксис qpdf, например "1-5,8,10-z") |
| `remove-pages` | Удаление страниц | `pages` (диапазон qpdf для удаления) |
| `organize-pdf` | Упорядочивание PDF | `order` (порядок страниц qpdf, например "3,1,2,5-z") |
| `protect-pdf` | Защита PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Разблокировка PDF | `password` |
| `repair-pdf` | Восстановление PDF | - |
| `linearize-pdf` | Веб-оптимизация PDF | - (линеаризация для быстрого просмотра в вебе) |
| `grayscale-pdf` | PDF в оттенки серого | - |
| `pdfa-convert` | Конвертация в PDF/A | - (архивный PDF/A-2) |
| `crop-pdf` | Обрезка PDF | `margin` (0-2000 пунктов) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Буклет PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Водяной знак на PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Нумерация страниц PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Сведение PDF | - (запекает формы и аннотации) |
| `redact-pdf` | Редактирование PDF (редактура) | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Подпись PDF | Пользовательский маршрут multipart с PDF `file`, файлами подписи `sig0`, `sig1` и JSON-массивом `placements` |
| `pdf-to-text` | PDF в текст | - |
| `pdf-to-word` | PDF в Word | - |
| `pdf-metadata` | Метаданные PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Конвертация документа | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Конвертация презентации | `format` (pptx/odp) |
| `convert-spreadsheet` | Конвертация таблицы | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel в PDF | - |
| `word-to-pdf` | Word в PDF | - |
| `powerpoint-to-pdf` | PowerPoint в PDF | - |
| `html-to-pdf` | HTML в PDF | - (удалённые ресурсы отключены) |
| `markdown-to-docx` | Markdown в Word | - |
| `markdown-to-html` | Markdown в HTML | - |
| `markdown-to-pdf` | Markdown в PDF | - (удалённые ресурсы отключены) |
| `epub-convert` | Конвертация EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Конвертация в EPUB | - (принимает .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR для PDF (ИИ) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF в изображение | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF в JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF в PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF в TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Инструменты для файлов {#file-tools}

| ID инструмента | Название | Ключевые настройки |
|---------|------|-------------|
| `chart-maker` | Создание диаграмм | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV в Excel | `sheet` (номер листа для ввода XLSX) - двунаправленный |
| `csv-json` | CSV в JSON | `pretty` (bool) - двунаправленный |
| `json-xml` | JSON в XML | `pretty` (bool) - двунаправленный |
| `split-csv` | Разделение CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Объединение CSV | - (многофайловый, совпадающие столбцы) |
| `yaml-json` | YAML / JSON | - (двунаправленный) |
| `xml-to-csv` | XML в CSV | - (автоматически находит повторяющиеся элементы) |
| `excel-to-csv` | Excel в CSV | выделенный пресет конвертации на основе `convert-spreadsheet` |
| `create-zip` | Создание ZIP | - (многофайловый, 2-50 файлов) |
| `extract-zip` | Извлечение ZIP | - (защита от бомб) |

### HTML в изображение {#html-to-image}

Захват веб-страницы как изображения. В отличие от других инструментов, этот эндпоинт принимает `application/json` вместо multipart-данных формы (загрузка файла не требуется).

**Эндпоинт:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `url` | string | (обязательный) | URL для захвата (только http/https) |
| `format` | string | `"png"` | Выходной формат: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Качество 1-100 (только JPG/WebP) |
| `fullPage` | boolean | `false` | Захват всей прокручиваемой страницы |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Пользовательская ширина области просмотра 320-3840 |
| `viewportHeight` | number | `720` | Пользовательская высота области просмотра 320-2160 |

**Пример:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Ответ:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Дополнительные маршруты инструментов {#tool-sub-routes}

Некоторые инструменты предоставляют дополнительные эндпоинты помимо стандартного `POST /api/v1/tools/<section>/<toolId>`:

| Метод | Путь | Описание |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Возвращает ID популярных инструментов, откатываясь на курируемый список по умолчанию, когда данных об использовании недостаточно |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Применение фоновых эффектов (color/gradient/blur/shadow) без повторного запуска ИИ. Использует кешированную маску из первоначального удаления. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Чтение существующих метаданных EXIF/IPTC/XMP из изображения |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Проверка полей метаданных перед удалением |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Фаза 1: ИИ-обнаружение лиц + удаление фона. Возвращает ориентиры лица и кешированные данные. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Фаза 2: обрезка, изменение размера и разбиение на плитки с использованием кешированного анализа. Без повторного запуска ИИ. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Получение метаданных GIF (количество кадров, размеры, длительность) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Получение метаданных PDF (количество страниц, размеры) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Генерация предпросмотра определённой страницы PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Получение метаданных PDF для выделенного пресета JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Генерация предпросмотра страницы PDF для пресета JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Получение метаданных PDF для выделенного пресета PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Генерация предпросмотра страницы PDF для пресета PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Получение метаданных PDF для выделенного пресета TIFF |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Генерация предпросмотра страницы PDF для пресета TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Пакетная конвертация нескольких SVG в растр |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Анализ качества изображения и возврат рекомендаций по улучшению |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Облегчённый предпросмотр для настройки параметров в реальном времени. Возвращает оптимизированное изображение с заголовками размера. |

## Пакетная обработка {#batch-processing}

Применение общего инструмента с поддержкой пакетной обработки к нескольким файлам одновременно. Возвращает ZIP-архив. Пользовательские многофайловые или многошаговые маршруты, такие как подписание PDF, OCR для PDF и маршруты пресетов PDF-в-изображение, используют собственный контракт эндпоинта вместо общего маршрута `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Параллелизм управляется через `CONCURRENT_JOBS` (по умолчанию: автоматически определяется по ядрам CPU). `MAX_BATCH_SIZE` ограничивает количество файлов в пакете (по умолчанию: 100; установите 0 для снятия ограничения).

## Конвейеры {#pipelines}

### Выполнение конвейера {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

Выход каждого шага является входом для следующего шага. Конвейеры допускают 20 шагов по умолчанию, настраивается через `MAX_PIPELINE_STEPS`. Установите `MAX_PIPELINE_STEPS=0` для снятия ограничения.

### Сохранение конвейеров и управление ими {#save-and-manage-pipelines}

| Метод | Путь | Описание |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Сохранение именованного конвейера (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Список сохранённых конвейеров (администраторы видят все; пользователи видят свои) |
| `DELETE` | `/api/v1/pipeline/:id` | Удаление (владелец или администратор) |
| `GET` | `/api/v1/pipeline/tools` | Список ID инструментов, допустимых для шагов конвейера |

## Отслеживание прогресса {#progress-tracking}

Длительные задания, поставленные в очередь инструменты, пакетные задания и конвейеры выдают прогресс в реальном времени через Server-Sent Events. Поток прогресса является публичным и привязан к ID задания, поэтому клиентам не нужно отправлять заголовок Authorization для его чтения.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Формат события:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Вы можете запросить отмену поставленного в очередь или выполняющегося задания через `POST /api/v1/jobs/:jobId/cancel`. Ответом является `{"canceled":true|false}`.

## Файловая библиотека {#file-library}

Постоянное хранилище файлов с историей версий.

| Метод | Путь | Описание |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Загрузка файлов в рабочее пространство (временная обработка) |
| `POST` | `/api/v1/files/upload` | Загрузка файлов в постоянную файловую библиотеку |
| `POST` | `/api/v1/files/save-result` | Сохранение результата обработки инструмента как новой версии файла |
| `GET` | `/api/v1/files` | Список сохранённых файлов (с постраничной разбивкой и поиском) |
| `GET` | `/api/v1/files/:id` | Получение метаданных файла + цепочки версий |
| `GET` | `/api/v1/files/:id/download` | Скачивание файла |
| `GET` | `/api/v1/files/:id/thumbnail` | Получение миниатюры JPEG 300px |
| `DELETE` | `/api/v1/files` | Массовое удаление файлов и их цепочек версий (тело: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Загрузка удалённых URL в рабочее пространство для импорта на основе URL |
| `POST` | `/api/v1/preview` | Генерация совместимого с браузером предпросмотра WebP (для форматов HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Потоковая передача кешированного или сгенерированного совместимого с браузером предпросмотра для сохранённого PDF, офисного документа, видео- или аудиофайла |
| `POST` | `/api/v1/preview/generate` | Генерация предпросмотра MP4 или MP3 по требованию для загруженного медиафайла без предварительного сохранения |
| `GET` | `/api/v1/download/:jobId/:filename` | Скачивание обработанного файла из рабочего пространства |

Чтобы автоматически сохранить результат инструмента в библиотеку, включите `fileId` как поле multipart-формы, ссылающееся на существующий файл библиотеки. Обработанный результат будет сохранён как новая версия.

## Управление ключами API {#api-key-management}

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Генерация нового ключа - показывается один раз |
| `GET` | `/api/v1/api-keys` | Auth | Список ключей (name, id, lastUsedAt - не необработанный ключ) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Удаление ключа |

## Команды {#teams}

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Список команд |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Создание команды |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Переименование команды |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Удаление команды (нельзя удалить команду по умолчанию или команды с участниками) |

## Настройки {#settings}

Конфигурация «ключ-значение» во время выполнения (чтение любым аутентифицированным пользователем, запись только администратором).

| Метод | Путь | Описание |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Получение всех настроек |
| `PUT` | `/api/v1/settings` | Массовое обновление настроек (тело JSON с парами «ключ-значение») |
| `GET` | `/api/v1/settings/:key` | Получение конкретной настройки по ключу |

Известные ключи: `disabledTools` (JSON-массив ID инструментов), `enableExperimentalTools` (bool-строка), `loginAttemptLimit` (число).

## Предпочтения {#preferences}

Предпочтения отдельных пользователей отделены от настроек экземпляра. Любой аутентифицированный пользователь может читать и обновлять собственную карту предпочтений.

| Метод | Путь | Описание |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Получение предпочтений текущего пользователя в виде `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Вставка или обновление одного или нескольких ключей предпочтений для текущего пользователя |

## Роли {#roles}

Управление пользовательскими ролями с гранулярными разрешениями.

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Список всех ролей с количеством пользователей |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Создание пользовательской роли (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Обновление пользовательской роли (нельзя изменять встроенные роли) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Удаление пользовательской роли (нельзя удалять встроенные роли; затронутые пользователи возвращаются к роли `user`) |

Доступные разрешения (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Журнал аудита {#audit-log}

Эндпоинт только для администраторов для просмотра действий, значимых для безопасности.

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Журнал аудита с постраничной разбивкой и необязательными фильтрами |

Параметры запроса:

| Параметр | Описание |
|-----------|-------------|
| `page` | Номер страницы (по умолчанию: 1) |
| `limit` | Записей на страницу (по умолчанию: 50, макс.: 100) |
| `action` | Фильтр по типу действия (например, `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Фильтр по IP-адресу источника |
| `from` | Фильтр записей после этой даты в формате ISO 8601 |
| `to` | Фильтр записей до этой даты в формате ISO 8601 |

## Аналитика {#analytics}

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Публичный | Получение действующей конфигурации аналитики (ключ PostHog, DSN Sentry, частота выборки). Ключи, DSN и ID экземпляра пусты, когда аналитика выключена, либо из-за запекания на этапе компиляции, либо из-за настройки экземпляра `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Отправка явной обратной связи пользователя в настроенный проект PostHog как `feedback_submitted`. Маршрут учитывает шлюз аналитики, ограничивает частоту отправок, удаляет контактные поля, если `contactOk` не равно true, и никогда не принимает содержимое файлов, имена файлов, пути загрузки или необработанный текст приватных ошибок. Когда аналитика отключена, он возвращает `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Установка отказа в масштабе всего экземпляра. Отправьте тело JSON `{ "analyticsEnabled": "false" }`, чтобы выключить аналитику для всех, или `"true"`, чтобы снова её включить. |

## Функции / ИИ-пакеты {#features-ai-bundles}

Управление пакетами ИИ-функций (установка/удаление пакетов моделей ИИ в среде Docker).

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Список всех пакетов функций и их статуса установки |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Установка пакета функций (асинхронно, возвращает `jobId` для отслеживания прогресса) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Удаление пакета функций и очистка файлов моделей |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Получение общего использования диска моделями ИИ |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Импорт офлайн-архива ИИ-пакета |

## Административные операции {#admin-operations}

Операционные эндпоинты для наблюдаемости, поддержки, отчётности об использовании и статуса резервного копирования.

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Чтение текущего уровня логирования во время выполнения |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Изменение уровня логирования во время выполнения (`fatal`, `error`, `warn`, `info`, `debug`, `trace` или `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Метрики Prometheus в текстовом формате |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Скачивание отредактированного диагностического пакета поддержки в формате ZIP |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Данные панели использования, с необязательным параметром запроса `days` |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Чтение метаданных последнего резервного копирования и статуса актуальности |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Запись о завершённом резервном копировании (`type`, необязательно `sizeBytes`, необязательно `notes`) |

## Корпоративные API {#enterprise-apis}

Эти маршруты ограничены лицензией по связанной с ними корпоративной функцией. Они по-прежнему требуют указанного разрешения SnapOtter.

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Экспорт записей аудита в виде JSON или CSV с фильтрами |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Экспорт отредактированной конфигурации экземпляра, пользовательских ролей и команд |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Импорт конфигурации, с необязательным пробным запуском |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Чтение настроенного списка разрешённых CIDR |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Обновление списка разрешённых CIDR с предотвращением самоблокировки |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Список юридических блокировок пользователей и команд |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Применение или снятие юридической блокировки для пользователя или команды |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Генерация bearer-токена SCIM, возвращается один раз |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Отзыв текущего bearer-токена SCIM |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Чтение конфигурации пересылки SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Обновление конфигурации пересылки SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Список назначений веб-хуков |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Создание назначения веб-хука |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Обновление назначения веб-хука |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Удаление назначения веб-хука |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Отправка тестовой полезной нагрузки веб-хука |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Запуск задания экспорта пользователя GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Чтение статуса экспорта GDPR и URL для скачивания |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Окончательная очистка данных пользователя после подтверждения |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Окончательная очистка данных команды после подтверждения |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Чтение метаданных версий приложения, сборки, Node и схемы |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Сравнение упакованных миграций с применёнными миграциями |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Запуск проверок готовности к обновлению |

### SCIM 2.0 {#scim-2-0}

Эндпоинты обнаружения SCIM являются публичными. Эндпоинты пользователей и групп требуют bearer-токена SCIM, сгенерированного выше.

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Публичный | Возможности сервера SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Публичный | Обнаружение схемы SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Публичный | Обнаружение типов ресурсов SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Токен SCIM | Список пользователей, с необязательным фильтром SCIM |
| `POST` | `/api/v1/scim/v2/Users` | Токен SCIM | Создание пользователя |
| `GET` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Получение пользователя |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Замена пользователя |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Мягкая деактивация пользователя |
| `GET` | `/api/v1/scim/v2/Groups` | Токен SCIM | Список команд как групп SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Токен SCIM | Создание команды |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Получение команды |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Замена команды и членства в группе |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Удаление команды |

## Шаблоны мемов {#meme-templates}

Вспомогательный API для инструмента генерации мемов.

| Метод | Путь | Доступ | Описание |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Список всех доступных шаблонов мемов с позициями текстовых блоков |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Отдача полноразмерного изображения шаблона |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Отдача миниатюры шаблона |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Отдача файла шрифта, используемого для отрисовки текста мема |

## Ответы с ошибками {#error-responses}

Все ошибки возвращают JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Статус | Значение |
|--------|---------|
| 400 | Некорректный запрос / валидация не пройдена |
| 401 | Не аутентифицирован |
| 403 | Недостаточно разрешений |
| 404 | Ресурс не найден |
| 413 | Файл слишком большой (см. `MAX_UPLOAD_SIZE_MB`) |
| 422 | Обработка не удалась после валидации |
| 429 | Ограничение частоты запросов (см. `RATE_LIMIT_PER_MIN`) |
| 501 | Необходимый ИИ-пакет функций не установлен (`FEATURE_NOT_INSTALLED`) |
| 500 | Внутренняя ошибка сервера |
