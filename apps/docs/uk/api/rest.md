---
description: "Повний довідник REST API. Кінцеві точки інструментів, пакетна обробка, конвеєри, бібліотека файлів, автентифікація, команди й адміністративні операції."
i18n_output_hash: 20d37040e8ea
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# Довідник REST API {#rest-api-reference}

Інтерактивна документація API з прикладами запитів і відповідей доступна за адресою [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Машиночитні специфікації:
- `/api/v1/openapi.yaml` - специфікація OpenAPI 3.1
- `/llms.txt` - зручне для LLM резюме
- `/llms-full.txt` - повна зручна для LLM документація

## Автентифікація {#authentication}

Усі кінцеві точки потребують автентифікації, окрім випадків, коли `AUTH_ENABLED=false`.

### Токен сесії {#session-token}

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

Сесії завершуються через 7 днів (налаштовується через `SESSION_DURATION_HOURS`).

### API-ключі {#api-keys}

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

Ключі мають префікс `si_` і зберігаються як хеші scrypt: неопрацьований ключ показується один раз і надалі його неможливо отримати.

### Кінцеві точки автентифікації {#auth-endpoints}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Публічний | Вхід, отримання токена сесії |
| `POST` | `/api/auth/logout` | Автентиф. | Знищення поточної сесії |
| `GET` | `/api/auth/session` | Автентиф. | Перевірка поточної сесії |
| `POST` | `/api/auth/change-password` | Автентиф. | Зміна власного пароля (робить недійсними всі інші сесії + API-ключі) |
| `GET` | `/api/auth/users` | Адмін | Список усіх користувачів |
| `POST` | `/api/auth/register` | Адмін | Створення нового користувача |
| `PUT` | `/api/auth/users/:id` | Адмін | Оновлення ролі або команди користувача |
| `POST` | `/api/auth/users/:id/reset-password` | Адмін | Скидання пароля користувача |
| `DELETE` | `/api/auth/users/:id` | Адмін | Видалення користувача |
| `GET` | `/api/v1/config/auth` | Публічний | Перевірка, чи ввімкнено автентифікацію (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Автентиф. | Початок реєстрації TOTP MFA. Потребує корпоративної можливості `mfa` |
| `POST` | `/api/auth/mfa/verify` | Автентиф. | Підтвердження реєстрації MFA кодом TOTP |
| `POST` | `/api/auth/mfa/complete` | Публічний | Завершення очікуваного виклику входу MFA |
| `POST` | `/api/auth/mfa/disable` | Автентиф. | Вимкнення MFA для поточного користувача |
| `POST` | `/api/auth/users/:id/mfa/reset` | Адмін (`users:manage`) | Скидання MFA для користувача |
| `GET` | `/api/auth/oidc/login` | Публічний | Початок входу OIDC, коли OIDC увімкнено |
| `GET` | `/api/auth/oidc/callback` | Публічний | Зворотний виклик авторизації OIDC |
| `GET` | `/api/auth/saml/metadata` | Публічний | XML метаданих SAML SP, коли SAML увімкнено |
| `GET` | `/api/auth/saml/login` | Публічний | Початок входу SAML |
| `POST` | `/api/auth/saml/callback` | Публічний | Служба споживача твердження SAML |

Коли для користувача ввімкнено MFA, `POST /api/auth/login` повертає `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` замість токена сесії. Надішліть цей `mfaToken` разом із кодом TOTP або кодом відновлення на `/api/auth/mfa/complete`.

### Дозволи {#permissions}

| Дозвіл | Адмін | Користувач |
|-----------|:-----:|:----:|
| Використання інструментів | ✓ | ✓ |
| Власні файли/конвеєри/API-ключі | ✓ | ✓ |
| Перегляд файлів/конвеєрів/ключів усіх користувачів | ✓ | - |
| Запис налаштувань | ✓ | - |
| Керування користувачами і командами | ✓ | - |
| Керування брендингом | ✓ | - |

## Перевірка стану {#health-check}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Публічний | Базова перевірка стану. Повертає `{"status":"healthy","version":"..."}` зі статусом 200 або `{"status":"unhealthy"}` зі статусом 503, якщо база даних недоступна. |
| `GET` | `/api/v1/readyz` | Публічний | Зонд готовності. Перевіряє PostgreSQL, Redis, дисковий простір і S3, якщо його налаштовано. Повертає 503, коли екземпляр не повинен приймати трафік. |
| `GET` | `/api/v1/admin/health` | Адмін (`system:health`) | Детальна діагностика, зокрема час безперервної роботи, режим сховища, стан бази даних, стан черги і доступність GPU. |

## Використання інструментів {#using-tools}

Кожен інструмент дотримується однакового шаблону:

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

`<section>` є одним з `image`, `video`, `audio`, `pdf` або `files`.

- Завантаження здійснюється через `multipart/form-data`.
- `settings` є JSON-рядком з опціями, специфічними для інструмента.
- `clientJobId` є необов'язковим полем форми для наданого викликачем співвіднесення прогресу.
- `fileId` є необов'язковим полем форми, що посилається на наявний елемент бібліотеки файлів. Коли воно присутнє, оброблений результат зберігається як нова версія, а відповідь містить `savedFileId`.
- **Швидкі інструменти** зазвичай повертають JSON зі статусом 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Отримайте оброблений файл з `downloadUrl`.
- **Будь-який поставлений у чергу інструмент** може повернути JSON зі статусом 202, якщо він тривалий або перевищує вікно синхронного очікування: `{"jobId":"...","async":true}`. Підключіться до SSE для відстеження прогресу, а потім завантажте результат після завершення (див. [Відстеження прогресу](#progress-tracking)).
- **Пакетні** маршрути повертають ZIP-архів, що передається напряму (із заголовком `X-Job-Id`), для інструментів, зареєстрованих у загальному пакетному реєстрі.

## Довідник інструментів {#tools-reference}

### Пресети конвертації {#conversion-presets}

Спільний каталог містить 83 виділені кінцеві точки пресетів конвертації, як-от `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` і `excel-to-csv`. Пресети є повноцінними маршрутами інструментів:

`POST /api/v1/tools/<section>/<presetId>`

Кожен пресет фіксує вихідний формат і делегує базовому інструменту, як-от `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` або `convert-spreadsheet`. Повну таблицю маршрутів і необов'язкові налаштування див. у [Пресети конвертації](/uk/tools/conversion-presets).

### Основне {#essentials}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `resize` | Зміна розміру | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, плюс 23 пресети для соцмереж |
| `crop` | Обрізання | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Обертання і віддзеркалення | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Конвертація | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Стиснення | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Оптимізація {#optimization}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `optimize-for-web` | Оптимізація для вебу | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Видалення метаданих | - |
| `edit-metadata` | Редагування метаданих | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Масове перейменування | `pattern` (підтримує `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Зображення в PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Генератор фавіконок | `padding`, `backgroundColor`, `borderRadius` - генерує всі стандартні розміри |

### Коригування {#adjustments}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `adjust-colors` | Коригування кольорів | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Різкість | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Заміна кольору | `sourceColor`, `targetColor` (замінник), `makeTransparent`, `tolerance` |
| `color-blindness` | Симуляція дальтонізму | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, за замовчуванням "deuteranomaly") |
| `duotone` | Дуотон | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Пікселізація | `blockSize` (2-128), `region` ({left, top, width, height} для часткової пікселізації) |
| `vignette` | Віньєтка | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### AI-інструменти {#ai-tools}

Усі AI-інструменти працюють на вашому обладнанні: CPU за замовчуванням або NVIDIA CUDA, коли доступний підтримуваний GPU NVIDIA. Прискорення на iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для AI-інференсу. Інтернет не потрібен.

| ID інструмента | Назва | AI-модель | Ключові налаштування |
|---------|------|---------|-------------|
| `remove-background` | Видалення фону | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Масштабування зображення | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Ластик об'єктів | LaMa (ONNX) | Маска надсилається як друга частина файлу (ім'я поля `mask`), `format`, `quality` |
| `ocr` | OCR / Вилучення тексту | Tesseract (швидкий); RapidOCR + PP-OCR ONNX (збалансований/найкращий) | `quality` (швидкий/збалансований/найкращий), `language`, `enhance` |
| `blur-faces` | Розмиття облич / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Розумне обрізання | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Покращення зображення | На основі аналізу | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Покращення облич | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI-розфарбовування | DDColor | `intensity`, `model` |
| `noise-removal` | Видалення шуму | Багаторівневе шумозаглушення | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Видалення ефекту червоних очей | Орієнтири обличчя + аналіз кольору | `sensitivity`, `strength` |
| `restore-photo` | Реставрація фото | Багатокроковий конвеєр | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Фото на паспорт | Орієнтири MediaPipe | Двофазний процес. Аналіз використовує multipart `file`; генерація використовує JSON з `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), орієнтирами, розмірами зображення |
| `content-aware-resize` | Зміна розміру з урахуванням вмісту | Виріз швів (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Виправлення прозорості PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Заміна фону | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Розмиття фону | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | AI-розширення полотна | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Водяні знаки й накладення {#watermark-overlay}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `watermark-text` | Текстовий водяний знак | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Водяний знак зображенням | `opacity`, `position`, `scale` - другий файл є водяним знаком |
| `text-overlay` | Накладення тексту | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Композиція зображень | `x`, `y`, `opacity`, `blend` - другий файл накладається зверху |
| `meme-generator` | Генератор мемів | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Підтримує режим шаблону (тіло JSON з `templateId`) або режим власного зображення (multipart з файлом). |

### Утиліти {#utilities}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `info` | Інформація про зображення | - (повертає width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Порівняння зображень | `mode` (side-by-side/overlay/diff), `diffThreshold` - другий файл є ціллю порівняння |
| `find-duplicates` | Пошук дублікатів | `threshold` (відстань перцептивного хешу, за замовчуванням 8) - багатофайловий |
| `color-palette` | Палітра кольорів | `count` (кількість домінантних кольорів), `format` (hex/rgb) |
| `qr-generate` | Генератор QR-коду | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (необов'язковий файл) |
| `barcode-read` | Зчитувач штрихкодів | - (автоматично розпізнає QR, EAN, Code128, DataMatrix тощо) |
| `image-to-base64` | Зображення в Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML у зображення | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Гістограма | `scale` (linear/log) - повертає діаграму RGB-гістограми + статистику по кожному каналу |
| `lqip-placeholder` | LQIP-заповнювач | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Генератор штрихкодів | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Тіло JSON, без завантаження файлу. |

### Компонування й композиція {#layout-composition}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `collage` | Колаж / Сітка | `template` (25+ макетів), `gap`, `backgroundColor`, `borderRadius` - багатофайловий |
| `stitch` | Зшивання / Об'єднання | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - багатофайловий |
| `split` | Розділення зображення | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Рамка й обрамлення | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Прикрашання скріншота | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Кругле обрізання | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Заповнення зображення | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Спрайт-лист | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - багатофайловий (2-64 зображення) |

### Формат і конвертація {#format-conversion}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `svg-to-raster` | SVG у растр | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Зображення в SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF-інструменти | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), параметри, специфічні для дії |
| `gif-webp` | Конвертер GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Відеоінструменти {#video-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `convert-video` | Конвертація відео | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Стиснення відео | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Обрізання відео | `startS`, `endS`, `precise` (bool, покадрово точний виріз) |
| `mute-video` | Вимкнення звуку відео | - |
| `video-to-gif` | Відео в GIF | `fps` (1-30), `width`, `startS`, `durationS` (макс. 60 с) |
| `resize-video` | Зміна розміру відео | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Обрізання відео за краями | `width`, `height`, `x`, `y` |
| `rotate-video` | Обертання відео | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Зміна FPS | `fps` (1-120) |
| `video-color` | Колір відео | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Швидкість відео | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Реверс відео | - (макс. 5 хвилин) |
| `video-loudnorm` | Нормалізація звуку | - (EBU R128) |
| `aspect-pad` | Заповнення за співвідношенням | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Заповнення розмиттям | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Водяний знак на відео | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Стабілізація відео | `smoothing` (5-60, у кадрах) |
| `gif-to-video` | GIF у відео | `format` (mp4/webm/mov) |
| `video-to-webp` | Відео в WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Відео в кадри | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Об'єднання відео | - (багатофайловий, нормалізовано до роздільної здатності першого відео) |
| `replace-audio` | Заміна звуку | - (відео + аудіофайл, два файли) |
| `burn-subtitles` | Вшивання субтитрів | `fontSize` (8-72) - відео + файл субтитрів |
| `embed-subtitles` | Вбудовування субтитрів | `language` (код ISO 639-2/B) - відео + файл субтитрів |
| `extract-subtitles` | Витяг субтитрів | - (виводить SRT) |
| `images-to-video` | Зображення у відео | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - багатофайловий |
| `video-metadata` | Очищення метаданих відео | - |
| `auto-subtitles` | Автосубтитри (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Витяг звуку | `format` (mp3/wav/m4a/ogg) |

### Аудіоінструменти {#audio-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `convert-audio` | Конвертація аудіо | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Обрізання аудіо | `startS`, `endS` |
| `volume-adjust` | Регулювання гучності | `gainDb` (-30 до 30) |
| `normalize-audio` | Нормалізація звуку | - (EBU R128, -16 LUFS) |
| `fade-audio` | Затухання аудіо | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Реверс аудіо | - |
| `audio-speed` | Швидкість аудіо | `factor` (0.25-4) |
| `pitch-shift` | Зсув висоти тону | `semitones` (-12 до 12) |
| `audio-channels` | Аудіоканали | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Видалення тиші | `thresholdDb` (-80 до -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Зменшення шуму | `strength` (light/medium/strong) |
| `merge-audio` | Об'єднання аудіо | `format` (mp3/wav/flac/m4a) - багатофайловий |
| `split-audio` | Розділення аудіо | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Створення рінгтона | `startS`, `durationS` (1-30) |
| `waveform-image` | Зображення хвилі | `width`, `height`, `color` (hex) |
| `audio-metadata` | Метадані аудіо | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Транскрибування аудіо (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Інструменти для документів {#document-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `merge-pdf` | Об'єднання PDF | - (багатофайловий, до 20 PDF) |
| `split-pdf` | Розділення PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Стиснення PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Обертання PDF | `angle` (90/180/270), `range` (діапазон сторінок) |
| `extract-pages` | Витяг сторінок | `range` (синтаксис qpdf, напр. "1-5,8,10-z") |
| `remove-pages` | Видалення сторінок | `pages` (діапазон qpdf для видалення) |
| `organize-pdf` | Упорядкування PDF | `order` (порядок сторінок qpdf, напр. "3,1,2,5-z") |
| `protect-pdf` | Захист PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Розблокування PDF | `password` |
| `repair-pdf` | Відновлення PDF | - |
| `linearize-pdf` | Веб-оптимізація PDF | - (лінеаризація для швидкого перегляду у вебі) |
| `grayscale-pdf` | PDF у відтінках сірого | - |
| `pdfa-convert` | Конвертація в PDF/A | - (архівний PDF/A-2) |
| `crop-pdf` | Обрізання PDF | `margin` (0-2000 пунктів) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Буклет PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Водяний знак PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Номери сторінок PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Зведення PDF | - (запікає форми й анотації) |
| `redact-pdf` | Редагування PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Підпис PDF | Власний multipart-маршрут з PDF `file`, файлами підписів `sig0`, `sig1` і JSON-масивом `placements` |
| `pdf-to-text` | PDF у текст | - |
| `pdf-to-word` | PDF у Word | - |
| `pdf-metadata` | Метадані PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Конвертація документа | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Конвертація презентації | `format` (pptx/odp) |
| `convert-spreadsheet` | Конвертація електронної таблиці | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel у PDF | - |
| `word-to-pdf` | Word у PDF | - |
| `powerpoint-to-pdf` | PowerPoint у PDF | - |
| `html-to-pdf` | HTML у PDF | - (віддалені ресурси вимкнено) |
| `markdown-to-docx` | Markdown у Word | - |
| `markdown-to-html` | Markdown у HTML | - |
| `markdown-to-pdf` | Markdown у PDF | - (віддалені ресурси вимкнено) |
| `epub-convert` | Конвертація EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Конвертація в EPUB | - (приймає .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF у зображення | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF у JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF у PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF у TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Файлові інструменти {#file-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `chart-maker` | Створення діаграм | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV у Excel | `sheet` (номер аркуша для вхідного XLSX) - двонапрямний |
| `csv-json` | CSV у JSON | `pretty` (bool) - двонапрямний |
| `json-xml` | JSON у XML | `pretty` (bool) - двонапрямний |
| `split-csv` | Розділення CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Об'єднання CSV | - (багатофайловий, збіжні стовпці) |
| `yaml-json` | YAML / JSON | - (двонапрямний) |
| `xml-to-csv` | XML у CSV | - (автоматично знаходить повторювані елементи) |
| `excel-to-csv` | Excel у CSV | виділений пресет конвертації на основі `convert-spreadsheet` |
| `create-zip` | Створення ZIP | - (багатофайловий, 2-50 файлів) |
| `extract-zip` | Витяг ZIP | - (захищено від zip-бомб) |

### HTML у зображення {#html-to-image}

Захоплення вебсторінки як зображення. На відміну від інших інструментів, ця кінцева точка приймає `application/json` замість multipart-даних форми (завантаження файлу не потрібне).

**Кінцева точка:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `url` | string | (обов'язковий) | URL для захоплення (лише http/https) |
| `format` | string | `"png"` | Вихідний формат: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Якість 1-100 (лише JPG/WebP) |
| `fullPage` | boolean | `false` | Захоплення всієї прокручуваної сторінки |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Власна ширина вікна перегляду 320-3840 |
| `viewportHeight` | number | `720` | Власна висота вікна перегляду 320-2160 |

**Приклад:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Відповідь:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Підмаршрути інструментів {#tool-sub-routes}

Деякі інструменти надають додаткові кінцеві точки понад стандартний `POST /api/v1/tools/<section>/<toolId>`:

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Повертає ID популярних інструментів, повертаючись до кураторського списку за замовчуванням, коли даних про використання мало |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Застосовує ефекти фону (color/gradient/blur/shadow) без повторного запуску AI. Використовує кешовану маску з початкового видалення. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Читає наявні метадані EXIF/IPTC/XMP із зображення |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Перевіряє поля метаданих перед видаленням |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Фаза 1: AI-виявлення облич + видалення фону. Повертає орієнтири обличчя і кешовані дані. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Фаза 2: Обрізання, зміна розміру і тайлинг з використанням кешованого аналізу. Без повторного запуску AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Отримати метадані GIF (кількість кадрів, розміри, тривалість) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Отримати метадані PDF (кількість сторінок, розміри) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Згенерувати попередній перегляд конкретної сторінки PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Отримати метадані PDF для виділеного пресета JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Згенерувати попередній перегляд сторінки PDF для пресета JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Отримати метадані PDF для виділеного пресета PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Згенерувати попередній перегляд сторінки PDF для пресета PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Отримати метадані PDF для виділеного пресета TIFF |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Згенерувати попередній перегляд сторінки PDF для пресета TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Пакетна конвертація кількох SVG у растр |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Проаналізувати якість зображення і повернути рекомендації щодо покращення |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Легкий попередній перегляд для живого налаштування параметрів. Повертає оптимізоване зображення із заголовками розміру. |

## Пакетна обробка {#batch-processing}

Застосуйте загальний пакетний інструмент до кількох файлів одночасно. Повертає ZIP-архів. Власні багатофайлові або багатокрокові маршрути, як-от підпис PDF і маршрути пресетів PDF-у-зображення, використовують власний контракт кінцевої точки замість загального маршруту `/batch`.

Інструмент `ocr-pdf` підтримує цей загальний маршрут `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Паралелізм контролюється `CONCURRENT_JOBS` (за замовчуванням: автоматично визначається за ядрами CPU). `MAX_BATCH_SIZE` обмежує кількість файлів на пакет (за замовчуванням: 100; встановіть 0 для необмеженої кількості).

## Конвеєри {#pipelines}

### Виконання конвеєра {#execute-a-pipeline}

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

Вихід кожного кроку є входом наступного кроку. Конвеєри дозволяють 20 кроків за замовчуванням, налаштовується через `MAX_PIPELINE_STEPS`. Встановіть `MAX_PIPELINE_STEPS=0`, щоб зняти обмеження.

### Збереження конвеєрів і керування ними {#save-and-manage-pipelines}

| Метод | Шлях | Опис |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Зберегти іменований конвеєр (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Список збережених конвеєрів (адміни бачать усі; користувачі бачать власні) |
| `DELETE` | `/api/v1/pipeline/:id` | Видалити (власник або адмін) |
| `GET` | `/api/v1/pipeline/tools` | Список ID інструментів, дійсних для кроків конвеєра |

## Відстеження прогресу {#progress-tracking}

Тривалі завдання, поставлені в чергу інструменти, пакетні завдання і конвеєри видають прогрес у реальному часі через Server-Sent Events. Потік прогресу є публічним і прив'язується за ID завдання, тож клієнтам не потрібно надсилати заголовок Authorization для його читання.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Формат події:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Ви можете запросити скасування поставленого в чергу або запущеного завдання за допомогою `POST /api/v1/jobs/:jobId/cancel`. Відповідь: `{"canceled":true|false}`.

## Бібліотека файлів {#file-library}

Постійне сховище файлів з історією версій.

| Метод | Шлях | Опис |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Завантажити файли в робочу область (тимчасова обробка) |
| `POST` | `/api/v1/files/upload` | Завантажити файли в постійну бібліотеку файлів |
| `POST` | `/api/v1/files/save-result` | Зберегти результат обробки інструментом як нову версію файлу |
| `GET` | `/api/v1/files` | Список збережених файлів (з розбивкою на сторінки, з пошуком) |
| `GET` | `/api/v1/files/:id` | Отримати метадані файлу + ланцюжок версій |
| `GET` | `/api/v1/files/:id/download` | Завантажити файл |
| `GET` | `/api/v1/files/:id/thumbnail` | Отримати мініатюру JPEG 300px |
| `DELETE` | `/api/v1/files` | Масове видалення файлів та їхніх ланцюжків версій (тіло: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Отримати віддалені URL у робочу область для імпорту на основі URL |
| `POST` | `/api/v1/preview` | Згенерувати сумісний з браузером попередній перегляд WebP (для форматів HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Передати кешований або згенерований сумісний з браузером попередній перегляд для збереженого PDF, офісного документа, відео чи аудіофайлу |
| `POST` | `/api/v1/preview/generate` | Згенерувати попередній перегляд MP4 або MP3 на вимогу для завантаженого медіафайлу без попереднього збереження |
| `GET` | `/api/v1/download/:jobId/:filename` | Завантажити оброблений файл з робочої області |

Щоб автоматично зберегти результат інструмента в бібліотеку, включіть `fileId` як поле multipart-форми, що посилається на наявний файл бібліотеки. Оброблений результат буде збережено як нову версію.

## Керування API-ключами {#api-key-management}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Автентиф. | Згенерувати новий ключ - показується один раз |
| `GET` | `/api/v1/api-keys` | Автентиф. | Список ключів (name, id, lastUsedAt - не неопрацьований ключ) |
| `DELETE` | `/api/v1/api-keys/:id` | Автентиф. | Видалити ключ |

## Команди {#teams}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Адмін (`teams:manage`) | Список команд |
| `POST` | `/api/v1/teams` | Адмін (`teams:manage`) | Створити команду |
| `PUT` | `/api/v1/teams/:id` | Адмін (`teams:manage`) | Перейменувати команду |
| `DELETE` | `/api/v1/teams/:id` | Адмін (`teams:manage`) | Видалити команду (не можна видалити команду за замовчуванням або команди з учасниками) |

## Налаштування {#settings}

Конфігурація середовища виконання використовує закритий набір розпізнаваних ключів. Для читання потрібен дозвіл `settings:read`, а для запису — `settings:write`; ключі безпеки та відповідності додатково вимагають `security:manage` або `compliance:manage`. Секретні налаштування вимагають повноважень повного адміністратора, а облікові дані та стан, якими керують спеціалізовані кінцеві точки, тут доступні лише для читання. Пакетні оновлення перевіряються до запису будь-якого значення.

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Отримати всі налаштування |
| `PUT` | `/api/v1/settings` | Масове оновлення налаштувань (тіло JSON з парами ключ-значення) |
| `GET` | `/api/v1/settings/:key` | Отримати конкретне налаштування за ключем |

Приклади ключів: `disabledTools` (JSON-масив ідентифікаторів інструментів), `enableExperimentalTools` (логічне значення), `loginAttemptLimit` (політика безпеки) та `auditRetentionDays` (політика відповідності). Невідомі ключі відхиляються.

## Уподобання {#preferences}

Уподобання окремих користувачів відокремлені від налаштувань екземпляра. Будь-який автентифікований користувач може читати й оновлювати власну карту уподобань.

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Отримати уподобання поточного користувача як `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Вставити або оновити один чи кілька ключів уподобань для поточного користувача |

## Ролі {#roles}

Керування власними ролями з детальними дозволами.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Адмін (`audit:read`) | Список усіх ролей з кількістю користувачів |
| `POST` | `/api/v1/roles` | Адмін (`security:manage`) | Створити власну роль (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Адмін (`security:manage`) | Оновити власну роль (не можна змінювати вбудовані ролі) |
| `DELETE` | `/api/v1/roles/:id` | Адмін (`security:manage`) | Видалити власну роль (не можна видаляти вбудовані ролі; постраждалі користувачі повертаються до ролі `user`) |

Доступні дозволи (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Журнал аудиту {#audit-log}

Кінцева точка лише для адміністраторів для перегляду дій, пов'язаних із безпекою.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Адмін (`audit:read`) | Журнал аудиту з розбивкою на сторінки з необов'язковими фільтрами |

Параметри запиту:

| Параметр | Опис |
|-----------|-------------|
| `page` | Номер сторінки (за замовчуванням: 1) |
| `limit` | Записів на сторінку (за замовчуванням: 50, макс.: 100) |
| `action` | Фільтр за типом дії (напр. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Фільтр за IP-адресою джерела |
| `from` | Фільтр записів після цієї дати ISO 8601 |
| `to` | Фільтр записів до цієї дати ISO 8601 |

## Аналітика {#analytics}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Публічний | Отримати фактичну конфігурацію аналітики (ключ PostHog, Sentry DSN, частота вибірки). Ключі, DSN і ID екземпляра порожні, коли аналітику вимкнено, або через запікання під час компіляції, або через налаштування екземпляра `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Автентиф. | Надіслати явний відгук користувача до налаштованого проєкту PostHog як `feedback_submitted`. Маршрут дотримується шлюзу аналітики, обмежує швидкість подань, видаляє контактні поля, якщо `contactOk` не є true, і ніколи не приймає вмісту файлів, імен файлів, шляхів завантаження чи неопрацьованого приватного тексту помилок. Коли аналітику вимкнено, повертає `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Адмін (`settings:write`) | Встановити відмову на рівні всього екземпляра. Надішліть тіло JSON `{ "analyticsEnabled": "false" }`, щоб вимкнути аналітику для всіх, або `"true"`, щоб знову її ввімкнути. |

## Можливості / AI-набори {#features-ai-bundles}

Керування наборами AI-можливостей (встановлення/видалення пакетів AI-моделей у середовищі Docker). Віддавайте перевагу кінцевій точці встановлення на рівні інструмента, коли вмикаєте інструмент з власної автоматизації: деякі AI-інструменти потребують більш ніж одного спільного набору, а ця кінцева точка пропускає вже встановлені набори, ставлячи в чергу лише відсутні.

OCR — це додаткове розширення, а не жорстка залежність. Його рівень `fast` Tesseract працює без пакета; `POST /api/v1/admin/features/ocr/install` встановлює підписаний пакет RapidOCR для `balanced` і `best` на Linux amd64 або arm64. Точне середовище виконання OCR використовує CPU на хостах лише з процесором і NVIDIA і вимагає принаймні 4 GiB ефективної пам’яті (ліміт налаштованого контейнера cgroup, інакше пам’ять хосту). SnapOtter повідомляє `requiredMemoryBytes`, `effectiveMemoryBytes` і причину сумісності `insufficient-memory` і відхиляє несумісне встановлення перед завантаженням. Ця вимога до пам’яті не стосується `fast`. Пакет містить близько 208-234 MiB для завантаження та 409-488 MiB для встановлення, залежно від цілі; підписаний індекс прив’язує точні розміри, які застосовуються під час встановлення.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Автентиф. | Список усіх наборів можливостей та їхнього статусу встановлення |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Адмін (`features:manage`) | Встановити набір можливостей (асинхронно, повертає `jobId` для відстеження прогресу) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Адмін (`features:manage`) | Встановити кожен набір, потрібний інструменту; повертає статус queued/skipped для кожного набору |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Адмін (`features:manage`) | Видалити набір можливостей і очистити файли моделей |
| `GET` | `/api/v1/admin/features/disk-usage` | Адмін (`features:manage`) | Отримати загальне використання диска AI-моделями |
| `POST` | `/api/v1/admin/features/import` | Адміністратор (`features:manage`) | Імпортуйте застарілий пакет штучного інтелекту (`file`) або підписаний автономний випуск OCR (`index` плюс `archive`) |

Імпорт OCR із повітряним проміжком має містити підписаний `ocr-runtime-index.json` випуску та відповідний архів платформи. SnapOtter застосовує ті самі перевірки підпису Ed25519, хешу артефакту, сумісності, вилучення та димового тесту, які використовуються під час онлайн-інсталяції:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

Використовуйте архів `linux-arm64-cpu-py311` на arm64. Підписаний артефакт для іншої цілі відхиляється, а не встановлюється.

## Адміністративні операції {#admin-operations}

Операційні кінцеві точки для спостережуваності, підтримки, звітності про використання і стану резервного копіювання.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Адмін (`settings:write`) | Прочитати поточний рівень журналювання середовища виконання |
| `POST` | `/api/v1/admin/log-level` | Адмін (`settings:write`) | Змінити рівень журналювання середовища виконання (`fatal`, `error`, `warn`, `info`, `debug`, `trace` або `silent`) |
| `GET` | `/api/v1/metrics` | Адмін (`system:health`) | Метрики Prometheus у текстовому форматі |
| `GET` | `/api/v1/admin/support-bundle` | Адмін (`system:health`) | Завантажити відредагований діагностичний ZIP-набір підтримки |
| `GET` | `/api/v1/admin/usage` | Адмін (`audit:read`) | Дані панелі використання, з необов'язковим параметром запиту `days` |
| `GET` | `/api/v1/admin/backup-status` | Адмін (`system:health`) | Прочитати метадані останнього резервного копіювання і статус свіжості |
| `POST` | `/api/v1/admin/backup-status` | Адмін (`system:health`) | Записати завершене резервне копіювання (`type`, необов'язково `sizeBytes`, необов'язково `notes`) |

## Корпоративні API {#enterprise-apis}

Ці маршрути ліцензійно обмежені пов'язаною корпоративною можливістю. Вони все одно потребують зазначеного дозволу SnapOtter.

**Вбудований адміністратор із повними правами** означає, що автентифікований суб’єкт має роль `admin` і повний набір фактичних дозволів адміністратора. Область дії ключа API, у якій відсутній хоча б один дозвіл адміністратора, не відповідає цій вимозі.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Адмін (`audit:read`) | Експортувати записи аудиту як JSON або CSV з фільтрами |
| `GET` | `/api/v1/enterprise/config/export` | Вбудований адміністратор із повними правами | Експортувати відредаговану конфігурацію екземпляра, власні ролі й команди |
| `POST` | `/api/v1/enterprise/config/import` | Вбудований адміністратор із повними правами | Імпортувати конфігурацію, з необов'язковим пробним запуском |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Адмін (`security:manage`) | Прочитати налаштований білий список CIDR |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Адмін (`security:manage`) | Оновити білий список CIDR із запобіганням самоблокуванню |
| `GET` | `/api/v1/enterprise/legal-hold` | Адмін (`compliance:manage`) | Список правових утримань користувачів і команд |
| `PUT` | `/api/v1/enterprise/legal-hold` | Адмін (`compliance:manage`) | Застосувати або зняти правове утримання для користувача чи команди |
| `POST` | `/api/v1/enterprise/scim/token` | Адмін (`users:manage`) | Згенерувати bearer-токен SCIM, повертається один раз |
| `DELETE` | `/api/v1/enterprise/scim/token` | Адмін (`users:manage`) | Відкликати поточний bearer-токен SCIM |
| `GET` | `/api/v1/enterprise/siem/config` | Адмін (`webhooks:manage`) | Прочитати конфігурацію пересилання SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Адмін (`webhooks:manage`) | Оновити конфігурацію пересилання SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Адмін (`webhooks:manage`) | Список призначень вебхуків |
| `POST` | `/api/v1/enterprise/webhooks` | Адмін (`webhooks:manage`) | Створити призначення вебхука |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Адмін (`webhooks:manage`) | Оновити призначення вебхука |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Адмін (`webhooks:manage`) | Видалити призначення вебхука |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Адмін (`webhooks:manage`) | Надіслати тестове корисне навантаження вебхука |
| `POST` | `/api/v1/enterprise/users/:id/export` | Адмін (`compliance:manage`) | Запустити завдання експорту користувача GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Адмін (`compliance:manage`) | Прочитати статус експорту GDPR і URL завантаження |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Адмін (`compliance:manage`) | Остаточно очистити дані користувача після підтвердження |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Адмін (`compliance:manage`) | Остаточно очистити дані команди після підтвердження |
| `GET` | `/api/v1/admin/version` | Адмін (`system:health`) | Прочитати метадані версії застосунку, збірки, Node і схеми |
| `GET` | `/api/v1/admin/migrations/pending` | Адмін (`system:health`) | Порівняти упаковані міграції із застосованими міграціями |
| `GET` | `/api/v1/admin/upgrade-check` | Адмін (`system:health`) | Запустити перевірки готовності до оновлення |

### SCIM 2.0 {#scim-2-0}

Кінцеві точки виявлення SCIM є публічними. Кінцеві точки користувачів і груп потребують bearer-токена SCIM, згенерованого вище.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Публічний | Можливості сервера SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Публічний | Виявлення схеми SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Публічний | Виявлення типів ресурсів SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Токен SCIM | Список користувачів, з необов'язковим фільтром SCIM |
| `POST` | `/api/v1/scim/v2/Users` | Токен SCIM | Створити користувача |
| `GET` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Отримати користувача |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Замінити користувача |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | М'яко деактивувати користувача |
| `GET` | `/api/v1/scim/v2/Groups` | Токен SCIM | Список команд як груп SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Токен SCIM | Створити команду |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Отримати команду |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Замінити команду і членство в групі |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Видалити команду |

## Шаблони мемів {#meme-templates}

Допоміжний API для інструмента генерації мемів.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Автентиф. | Список усіх доступних шаблонів мемів із позиціями текстових полів |
| `GET` | `/api/v1/meme-templates/full/:filename` | Автентиф. | Надати повнорозмірне зображення шаблону |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Автентиф. | Надати мініатюру шаблону |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Автентиф. | Надати файл шрифту, що використовується для рендерингу тексту мемів |

## Відповіді з помилками {#error-responses}

Усі помилки повертають JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Статус | Значення |
|--------|---------|
| 400 | Недійсний запит / помилка валідації |
| 401 | Не автентифіковано |
| 403 | Недостатньо дозволів |
| 404 | Ресурс не знайдено |
| 413 | Файл завеликий (див. `MAX_UPLOAD_SIZE_MB`) |
| 422 | Обробка не вдалася після валідації |
| 429 | Обмежено за швидкістю (див. `RATE_LIMIT_PER_MIN`) |
| 501 | Потрібний AI-набір можливостей не встановлено (`FEATURE_NOT_INSTALLED`) |
| 500 | Внутрішня помилка сервера |
