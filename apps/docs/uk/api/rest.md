---
description: "Повний довідник REST API. Кінцеві точки інструментів, пакетна обробка, конвеєри, бібліотека файлів, автентифікація, команди та адміністративні операції."
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: 9b772864dec4
---

# Довідник REST API {#rest-api-reference}

Інтерактивна документація API з прикладами запитів та відповідей доступна за адресою [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Машиночитні специфікації:
- `/api/v1/openapi.yaml` - специфікація OpenAPI 3.1
- `/llms.txt` - зручне для LLM резюме
- `/llms-full.txt` - повна зручна для LLM документація

## Автентифікація {#authentication}

Усі кінцеві точки потребують автентифікації, якщо не `AUTH_ENABLED=false`.

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

Сесії спливають через 7 днів (налаштовується через `SESSION_DURATION_HOURS`).

### Ключі API {#api-keys}

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

Ключі мають префікс `si_` та зберігаються як хеші scrypt - необроблений ключ показується один раз і його вже неможливо отримати знову.

### Кінцеві точки автентифікації {#auth-endpoints}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Публічний | Вхід, отримання токена сесії |
| `POST` | `/api/auth/logout` | Auth | Знищити поточну сесію |
| `GET` | `/api/auth/session` | Auth | Перевірити поточну сесію |
| `POST` | `/api/auth/change-password` | Auth | Змінити власний пароль (робить недійсними всі інші сесії + ключі API) |
| `GET` | `/api/auth/users` | Admin | Список усіх користувачів |
| `POST` | `/api/auth/register` | Admin | Створити нового користувача |
| `PUT` | `/api/auth/users/:id` | Admin | Оновити роль або команду користувача |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Скинути пароль користувача |
| `DELETE` | `/api/auth/users/:id` | Admin | Видалити користувача |
| `GET` | `/api/v1/config/auth` | Публічний | Перевірити, чи ввімкнена автентифікація (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Розпочати реєстрацію TOTP MFA. Потребує корпоративну функцію `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Підтвердити реєстрацію MFA кодом TOTP |
| `POST` | `/api/auth/mfa/complete` | Публічний | Завершити очікуваний виклик входу MFA |
| `POST` | `/api/auth/mfa/disable` | Auth | Вимкнути MFA для поточного користувача |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Скинути MFA для користувача |
| `GET` | `/api/auth/oidc/login` | Публічний | Розпочати вхід OIDC, коли OIDC увімкнено |
| `GET` | `/api/auth/oidc/callback` | Публічний | Зворотний виклик авторизації OIDC |
| `GET` | `/api/auth/saml/metadata` | Публічний | XML метаданих SAML SP, коли SAML увімкнено |
| `GET` | `/api/auth/saml/login` | Публічний | Розпочати вхід SAML |
| `POST` | `/api/auth/saml/callback` | Публічний | Служба обробки твердження SAML |

Коли для користувача ввімкнено MFA, `POST /api/auth/login` повертає `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` замість токена сесії. Надішліть цей `mfaToken` разом із кодом TOTP або кодом відновлення на `/api/auth/mfa/complete`.

### Дозволи {#permissions}

| Дозвіл | Admin | User |
|-----------|:-----:|:----:|
| Використання інструментів | ✓ | ✓ |
| Власні файли/конвеєри/ключі API | ✓ | ✓ |
| Перегляд файлів/конвеєрів/ключів усіх користувачів | ✓ | - |
| Запис налаштувань | ✓ | - |
| Керування користувачами та командами | ✓ | - |
| Керування брендингом | ✓ | - |

## Перевірка стану {#health-check}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Публічний | Базова перевірка стану. Повертає `{"status":"healthy","version":"..."}` зі статусом 200 або `{"status":"unhealthy"}` зі статусом 503, якщо база даних недоступна. |
| `GET` | `/api/v1/readyz` | Публічний | Проба готовності. Перевіряє PostgreSQL, Redis, дисковий простір та S3, коли налаштовано. Повертає 503, коли екземпляр не повинен приймати трафік. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Детальна діагностика, включаючи час безперервної роботи, режим сховища, стан бази даних, стан черги та доступність GPU. |

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

- Завантаження - `multipart/form-data`.
- `settings` - це рядок JSON з опціями, специфічними для інструмента.
- `clientJobId` - це необов'язкове поле форми для наданої викликаючою стороною кореляції прогресу.
- `fileId` - це необов'язкове поле форми, що посилається на наявний елемент бібліотеки файлів. Коли воно присутнє, оброблений результат зберігається як нова версія, а відповідь включає `savedFileId`.
- **Швидкі інструменти** зазвичай повертають 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Отримайте оброблений файл з `downloadUrl`.
- **Будь-який інструмент у черзі** може повернути 202 JSON, якщо він тривалий або перевищує вікно синхронного очікування: `{"jobId":"...","async":true}`. Підключіться до SSE для відстеження прогресу, а потім завантажте після завершення (див. [Відстеження прогресу](#progress-tracking)).
- **Пакетні** маршрути повертають архів ZIP, який передається напряму (із заголовком `X-Job-Id`) для інструментів, зареєстрованих у загальному реєстрі пакетів.

## Довідник інструментів {#tools-reference}

### Пресети конвертації {#conversion-presets}

Спільний каталог включає 83 спеціальні кінцеві точки пресетів конвертації, такі як `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` та `excel-to-csv`. Пресети - це повноцінні маршрути інструментів:

`POST /api/v1/tools/<section>/<presetId>`

Кожен пресет фіксує вихідний формат та делегує базовому інструменту, такому як `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` або `convert-spreadsheet`. Див. [Пресети конвертації](/uk/tools/conversion-presets) для повної таблиці маршрутів та необов'язкових налаштувань.

### Основне {#essentials}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `resize` | Змінити розмір | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, плюс 23 пресети соціальних мереж |
| `crop` | Обрізати | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Обертати та віддзеркалити | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Конвертувати | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Стиснути | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Оптимізація {#optimization}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `optimize-for-web` | Оптимізувати для вебу | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Видалити метадані | - |
| `edit-metadata` | Редагувати метадані | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Масове перейменування | `pattern` (підтримує `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Зображення в PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Генератор фавіконок | `padding`, `backgroundColor`, `borderRadius` - генерує всі стандартні розміри |

### Коригування {#adjustments}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `adjust-colors` | Налаштувати кольори | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Різкість | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Замінити колір | `sourceColor`, `targetColor` (заміна), `makeTransparent`, `tolerance` |
| `color-blindness` | Симуляція дальтонізму | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, за замовчуванням "deuteranomaly") |
| `duotone` | Дуотон | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Пікселізація | `blockSize` (2-128), `region` ({left, top, width, height} для часткової пікселізації) |
| `vignette` | Віньєтка | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Інструменти ШІ {#ai-tools}

Усі інструменти ШІ працюють на вашому обладнанні: CPU за замовчуванням або NVIDIA CUDA, коли доступний підтримуваний GPU NVIDIA. Прискорення на iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для інференсу ШІ. Інтернет не потрібен.

| ID інструмента | Назва | Модель ШІ | Ключові налаштування |
|---------|------|---------|-------------|
| `remove-background` | Видалити фон | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Масштабування зображення | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Ластик об'єктів | LaMa (ONNX) | Маска надсилається як друга частина файлу (ім'я поля `mask`), `format`, `quality` |
| `ocr` | OCR / Витяг тексту | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Розмиття облич / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Розумне обрізання | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Покращення зображення | На основі аналізу | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Покращення облич | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Колоризація ШІ | DDColor | `intensity`, `model` |
| `noise-removal` | Видалення шуму | Багаторівневе шумозаглушення | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Видалення червоних очей | Орієнтири обличчя + аналіз кольору | `sensitivity`, `strength` |
| `restore-photo` | Реставрація фото | Багатокроковий конвеєр | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Фото на паспорт | Орієнтири MediaPipe | Двофазний потік. Аналіз використовує multipart `file`; генерація використовує JSON з `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), орієнтирами, розмірами зображення |
| `content-aware-resize` | Змінити розмір з урахуванням вмісту | Викроювання швів (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Виправлення прозорості PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Замінити фон | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Розмити фон | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Розширення полотна ШІ | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Водяний знак та накладання {#watermark-overlay}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `watermark-text` | Текстовий водяний знак | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Водяний знак зображенням | `opacity`, `position`, `scale` - другий файл є водяним знаком |
| `text-overlay` | Накладання тексту | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Композиція зображення | `x`, `y`, `opacity`, `blend` - другий файл накладається зверху |
| `meme-generator` | Генератор мемів | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Підтримує режим шаблону (тіло JSON з `templateId`) або режим власного зображення (multipart з файлом). |

### Утиліти {#utilities}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `info` | Інформація про зображення | - (повертає width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Порівняння зображень | `mode` (side-by-side/overlay/diff), `diffThreshold` - другий файл є ціллю порівняння |
| `find-duplicates` | Знайти дублікати | `threshold` (відстань перцептуального хешу, за замовчуванням 8) - багатофайловий |
| `color-palette` | Палітра кольорів | `count` (кількість домінантних кольорів), `format` (hex/rgb) |
| `qr-generate` | Генератор QR-кодів | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (необов'язковий файл) |
| `barcode-read` | Зчитувач штрих-кодів | - (автоматично визначає QR, EAN, Code128, DataMatrix тощо) |
| `image-to-base64` | Зображення в Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML в зображення | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Гістограма | `scale` (linear/log) - повертає гістограму RGB + статистику по каналах |
| `lqip-placeholder` | Заповнювач LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Генератор штрих-кодів | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Тіло JSON, без завантаження файлу. |

### Компонування та композиція {#layout-composition}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `collage` | Колаж / Сітка | `template` (25+ макетів), `gap`, `backgroundColor`, `borderRadius` - багатофайловий |
| `stitch` | Зшити / Об'єднати | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - багатофайловий |
| `split` | Розділення зображення | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Рамка та обрамлення | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Прикрасити знімок екрана | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Обрізати по колу | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Доповнення зображення | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Спрайт-лист | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - багатофайловий (2-64 зображення) |

### Формат та конвертація {#format-conversion}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `svg-to-raster` | SVG в растр | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Зображення в SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Інструменти GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), параметри, специфічні для дії |
| `gif-webp` | Конвертер GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Відеоінструменти {#video-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `convert-video` | Конвертувати відео | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Стиснути відео | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Обрізати відео | `startS`, `endS`, `precise` (bool, покадрове обрізання) |
| `mute-video` | Вимкнути звук відео | - |
| `video-to-gif` | Відео в GIF | `fps` (1-30), `width`, `startS`, `durationS` (макс. 60с) |
| `resize-video` | Змінити розмір відео | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Обрізати відео (кадрування) | `width`, `height`, `x`, `y` |
| `rotate-video` | Обертати відео | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Змінити FPS | `fps` (1-120) |
| `video-color` | Колір відео | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Швидкість відео | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Реверс відео | - (макс. 5 хвилин) |
| `video-loudnorm` | Нормалізувати звук | - (EBU R128) |
| `aspect-pad` | Доповнення співвідношення сторін | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Доповнення розмиттям | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Водяний знак на відео | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Стабілізувати відео | `smoothing` (5-60, у кадрах) |
| `gif-to-video` | GIF у відео | `format` (mp4/webm/mov) |
| `video-to-webp` | Відео в WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Відео в кадри | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Об'єднати відео | - (багатофайловий, нормалізується до роздільної здатності першого відео) |
| `replace-audio` | Замінити звук | - (відео + аудіофайл, два файли) |
| `burn-subtitles` | Впаяти субтитри | `fontSize` (8-72) - відео + файл субтитрів |
| `embed-subtitles` | Вбудувати субтитри | `language` (код ISO 639-2/B) - відео + файл субтитрів |
| `extract-subtitles` | Витягти субтитри | - (виводить SRT) |
| `images-to-video` | Зображення у відео | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - багатофайловий |
| `video-metadata` | Очистити метадані відео | - |
| `auto-subtitles` | Автосубтитри (ШІ) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Витягти звук | `format` (mp3/wav/m4a/ogg) |

### Аудіоінструменти {#audio-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `convert-audio` | Конвертувати аудіо | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Обрізати аудіо | `startS`, `endS` |
| `volume-adjust` | Регулювання гучності | `gainDb` (-30 до 30) |
| `normalize-audio` | Нормалізувати аудіо | - (EBU R128, -16 LUFS) |
| `fade-audio` | Затухання аудіо | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Реверс аудіо | - |
| `audio-speed` | Швидкість аудіо | `factor` (0.25-4) |
| `pitch-shift` | Зсув тону | `semitones` (-12 до 12) |
| `audio-channels` | Аудіоканали | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Видалення тиші | `thresholdDb` (-80 до -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Зменшення шуму | `strength` (light/medium/strong) |
| `merge-audio` | Об'єднати аудіо | `format` (mp3/wav/flac/m4a) - багатофайловий |
| `split-audio` | Розділити аудіо | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Створення рінгтонів | `startS`, `durationS` (1-30) |
| `waveform-image` | Зображення форми хвилі | `width`, `height`, `color` (hex) |
| `audio-metadata` | Метадані аудіо | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Транскрибувати аудіо (ШІ) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Інструменти для документів {#document-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `merge-pdf` | Об'єднати PDF | - (багатофайловий, до 20 PDF) |
| `split-pdf` | Розділити PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Стиснути PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Обертати PDF | `angle` (90/180/270), `range` (діапазон сторінок) |
| `extract-pages` | Витягти сторінки | `range` (синтаксис qpdf, напр. "1-5,8,10-z") |
| `remove-pages` | Видалити сторінки | `pages` (діапазон qpdf для видалення) |
| `organize-pdf` | Упорядкувати PDF | `order` (порядок сторінок qpdf, напр. "3,1,2,5-z") |
| `protect-pdf` | Захистити PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Розблокувати PDF | `password` |
| `repair-pdf` | Відновити PDF | - |
| `linearize-pdf` | Веб-оптимізація PDF | - (лінеаризація для швидкого перегляду у вебі) |
| `grayscale-pdf` | PDF у відтінках сірого | - |
| `pdfa-convert` | Конвертувати в PDF/A | - (архівний PDF/A-2) |
| `crop-pdf` | Обрізати PDF | `margin` (0-2000 пунктів) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Буклет PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Водяний знак на PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Номери сторінок PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Звести PDF | - (запікає форми та анотації) |
| `redact-pdf` | Редагувати (Redact) PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Підписати PDF | Власний маршрут multipart з PDF `file`, файлами підпису `sig0`, `sig1` та масивом JSON `placements` |
| `pdf-to-text` | PDF у текст | - |
| `pdf-to-word` | PDF у Word | - |
| `pdf-metadata` | Метадані PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Конвертувати документ | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Конвертувати презентацію | `format` (pptx/odp) |
| `convert-spreadsheet` | Конвертувати таблицю | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel у PDF | - |
| `word-to-pdf` | Word у PDF | - |
| `powerpoint-to-pdf` | PowerPoint у PDF | - |
| `html-to-pdf` | HTML у PDF | - (віддалені ресурси вимкнено) |
| `markdown-to-docx` | Markdown у Word | - |
| `markdown-to-html` | Markdown у HTML | - |
| `markdown-to-pdf` | Markdown у PDF | - (віддалені ресурси вимкнено) |
| `epub-convert` | Конвертувати EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Конвертувати в EPUB | - (приймає .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (ШІ) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF у зображення | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF у JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF у PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF у TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Файлові інструменти {#file-tools}

| ID інструмента | Назва | Ключові налаштування |
|---------|------|-------------|
| `chart-maker` | Конструктор діаграм | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV у Excel | `sheet` (номер аркуша для вхідних даних XLSX) - двонаправлений |
| `csv-json` | CSV у JSON | `pretty` (bool) - двонаправлений |
| `json-xml` | JSON у XML | `pretty` (bool) - двонаправлений |
| `split-csv` | Розділити CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Об'єднати CSV | - (багатофайловий, зі співпадінням стовпців) |
| `yaml-json` | YAML / JSON | - (двонаправлений) |
| `xml-to-csv` | XML у CSV | - (автоматично знаходить повторювані елементи) |
| `excel-to-csv` | Excel у CSV | спеціальний пресет конвертації на основі `convert-spreadsheet` |
| `create-zip` | Створити ZIP | - (багатофайловий, 2-50 файлів) |
| `extract-zip` | Витягти ZIP | - (захищений від бомб) |

### HTML у зображення {#html-to-image}

Захоплення вебсторінки як зображення. На відміну від інших інструментів, ця кінцева точка приймає `application/json` замість даних форми multipart (завантаження файлу не потрібне).

**Кінцева точка:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `url` | string | (обов'язковий) | URL для захоплення (лише http/https) |
| `format` | string | `"png"` | Вихідний формат: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Якість 1-100 (лише JPG/WebP) |
| `fullPage` | boolean | `false` | Захопити повну прокручувану сторінку |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Власна ширина viewport 320-3840 |
| `viewportHeight` | number | `720` | Власна висота viewport 320-2160 |

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

Деякі інструменти надають додаткові кінцеві точки, окрім стандартної `POST /api/v1/tools/<section>/<toolId>`:

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Повертає ID популярних інструментів, повертаючись до кураторського списку за замовчуванням, коли дані про використання розріджені |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Застосовує фонові ефекти (color/gradient/blur/shadow) без повторного запуску ШІ. Використовує кешовану маску з початкового видалення. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Читає наявні метадані EXIF/IPTC/XMP із зображення |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Перевіряє поля метаданих перед видаленням |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Фаза 1: виявлення облич ШІ + видалення фону. Повертає орієнтири облич та кешовані дані. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Фаза 2: обрізання, зміна розміру та розкладка з використанням кешованого аналізу. Без повторного запуску ШІ. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Отримати метадані GIF (кількість кадрів, розміри, тривалість) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Отримати метадані PDF (кількість сторінок, розміри) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Згенерувати попередній перегляд конкретної сторінки PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Отримати метадані PDF для спеціального пресету JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Згенерувати попередній перегляд сторінки PDF для пресету JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Отримати метадані PDF для спеціального пресету PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Згенерувати попередній перегляд сторінки PDF для пресету PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Отримати метадані PDF для спеціального пресету TIFF |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Згенерувати попередній перегляд сторінки PDF для пресету TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Пакетна конвертація кількох SVG у растр |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Проаналізувати якість зображення та повернути рекомендації щодо покращення |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Легкий попередній перегляд для живого налаштування параметрів. Повертає оптимізоване зображення із заголовками розміру. |

## Пакетна обробка {#batch-processing}

Застосуйте загальний інструмент із підтримкою пакетів до кількох файлів одночасно. Повертає архів ZIP. Власні багатофайлові або багатокрокові маршрути, такі як підписання PDF, PDF OCR та маршрути пресетів PDF-у-зображення, використовують власний контракт кінцевої точки замість загального маршруту `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Паралелізм контролюється через `CONCURRENT_JOBS` (за замовчуванням: автоматично визначається з ядер CPU). `MAX_BATCH_SIZE` обмежує кількість файлів у пакеті (за замовчуванням: 100; встановіть 0 для необмеженої кількості).

## Конвеєри {#pipelines}

### Виконати конвеєр {#execute-a-pipeline}

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

Вихід кожного кроку є входом наступного кроку. Конвеєри дозволяють 20 кроків за замовчуванням, що налаштовується через `MAX_PIPELINE_STEPS`. Встановіть `MAX_PIPELINE_STEPS=0`, щоб зняти обмеження.

### Зберігати та керувати конвеєрами {#save-and-manage-pipelines}

| Метод | Шлях | Опис |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Зберегти іменований конвеєр (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Список збережених конвеєрів (адміністратори бачать усі; користувачі бачать власні) |
| `DELETE` | `/api/v1/pipeline/:id` | Видалити (власник або адміністратор) |
| `GET` | `/api/v1/pipeline/tools` | Список ID інструментів, дійсних для кроків конвеєра |

## Відстеження прогресу {#progress-tracking}

Тривалі завдання, інструменти в черзі, пакетні завдання та конвеєри передають прогрес у реальному часі через Server-Sent Events. Потік прогресу є публічним та ключується за ID завдання, тому клієнтам не потрібно надсилати заголовок Authorization для його читання.

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

Ви можете запросити скасування завдання в черзі або запущеного завдання через `POST /api/v1/jobs/:jobId/cancel`. Відповідь - `{"canceled":true|false}`.

## Бібліотека файлів {#file-library}

Постійне зберігання файлів з історією версій.

| Метод | Шлях | Опис |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Завантажити файли до робочого простору (тимчасова обробка) |
| `POST` | `/api/v1/files/upload` | Завантажити файли до постійної бібліотеки файлів |
| `POST` | `/api/v1/files/save-result` | Зберегти результат обробки інструмента як нову версію файлу |
| `GET` | `/api/v1/files` | Список збережених файлів (з розбивкою на сторінки та пошуком) |
| `GET` | `/api/v1/files/:id` | Отримати метадані файлу + ланцюг версій |
| `GET` | `/api/v1/files/:id/download` | Завантажити файл |
| `GET` | `/api/v1/files/:id/thumbnail` | Отримати мініатюру JPEG 300px |
| `DELETE` | `/api/v1/files` | Масове видалення файлів та їхніх ланцюгів версій (тіло: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Отримати віддалені URL до робочого простору для імпортів на основі URL |
| `POST` | `/api/v1/preview` | Згенерувати сумісний з браузером попередній перегляд WebP (для форматів HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Передати кешований або згенерований сумісний з браузером попередній перегляд для збереженого PDF, офісного документа, відео або аудіофайлу |
| `POST` | `/api/v1/preview/generate` | Згенерувати попередній перегляд MP4 або MP3 на вимогу для завантаженого медіафайлу без попереднього збереження |
| `GET` | `/api/v1/download/:jobId/:filename` | Завантажити оброблений файл з робочого простору |

Щоб автоматично зберегти результат інструмента до бібліотеки, включіть `fileId` як поле форми multipart, що посилається на наявний файл бібліотеки. Оброблений результат буде збережено як нову версію.

## Керування ключами API {#api-key-management}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Згенерувати новий ключ - показується один раз |
| `GET` | `/api/v1/api-keys` | Auth | Список ключів (name, id, lastUsedAt - не необроблений ключ) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Видалити ключ |

## Команди {#teams}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Список команд |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Створити команду |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Перейменувати команду |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Видалити команду (не можна видалити команду за замовчуванням або команди з учасниками) |

## Налаштування {#settings}

Конфігурація ключ-значення під час виконання (читається будь-яким автентифікованим користувачем, запис лише адміністратором).

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Отримати всі налаштування |
| `PUT` | `/api/v1/settings` | Масове оновлення налаштувань (тіло JSON з парами ключ-значення) |
| `GET` | `/api/v1/settings/:key` | Отримати конкретне налаштування за ключем |

Відомі ключі: `disabledTools` (масив JSON ID інструментів), `enableExperimentalTools` (рядок bool), `loginAttemptLimit` (число).

## Уподобання {#preferences}

Уподобання окремого користувача відділені від налаштувань екземпляра. Будь-який автентифікований користувач може читати та оновлювати власну карту уподобань.

| Метод | Шлях | Опис |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Отримати уподобання поточного користувача як `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Вставити або оновити один чи більше ключів уподобань для поточного користувача |

## Ролі {#roles}

Керування власними ролями з детальними дозволами.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Список усіх ролей з кількістю користувачів |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Створити власну роль (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Оновити власну роль (не можна змінити вбудовані ролі) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Видалити власну роль (не можна видалити вбудовані ролі; постраждалі користувачі повертаються до ролі `user`) |

Доступні дозволи (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Журнал аудиту {#audit-log}

Кінцева точка лише для адміністраторів для перегляду дій, важливих для безпеки.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Журнал аудиту з розбивкою на сторінки та необов'язковими фільтрами |

Параметри запиту:

| Параметр | Опис |
|-----------|-------------|
| `page` | Номер сторінки (за замовчуванням: 1) |
| `limit` | Записів на сторінку (за замовчуванням: 50, макс.: 100) |
| `action` | Фільтрувати за типом дії (напр. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Фільтрувати за IP-адресою джерела |
| `from` | Фільтрувати записи після цієї дати ISO 8601 |
| `to` | Фільтрувати записи до цієї дати ISO 8601 |

## Аналітика {#analytics}

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Публічний | Отримати ефективну конфігурацію аналітики (ключ PostHog, DSN Sentry, частота вибірки). Ключі, DSN та ID екземпляра порожні, коли аналітика вимкнена, чи то через запікання під час компіляції, чи то через налаштування екземпляра `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Надіслати явний відгук користувача до налаштованого проекту PostHog як `feedback_submitted`. Маршрут поважає шлюз аналітики, обмежує частоту надсилань, видаляє контактні поля, якщо `contactOk` не має значення true, та ніколи не приймає вміст файлів, імена файлів, шляхи завантаження чи необроблений текст приватної помилки. Коли аналітика вимкнена, повертає `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Встановити відмову від аналітики на рівні екземпляра. Надішліть тіло JSON `{ "analyticsEnabled": "false" }`, щоб вимкнути аналітику для всіх, або `"true"`, щоб знову ввімкнути її. |

## Функції / Пакети ШІ {#features-ai-bundles}

Керування пакетами функцій ШІ (встановлення/видалення пакетів моделей ШІ у середовищі Docker).

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Список усіх пакетів функцій та їхнього статусу встановлення |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Встановити пакет функцій (асинхронно, повертає `jobId` для відстеження прогресу) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Видалити пакет функцій та очистити файли моделей |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Отримати загальне використання диска моделями ШІ |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Імпортувати офлайн-архів пакета ШІ |

## Адміністративні операції {#admin-operations}

Операційні кінцеві точки для спостережуваності, підтримки, звітності про використання та статусу резервного копіювання.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Прочитати поточний рівень логування під час виконання |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Змінити рівень логування під час виконання (`fatal`, `error`, `warn`, `info`, `debug`, `trace` або `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Метрики Prometheus у текстовому форматі |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Завантажити відредагований діагностичний пакет підтримки ZIP |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Дані панелі використання, з необов'язковим параметром запиту `days` |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Прочитати метадані останнього резервного копіювання та статус актуальності |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Записати завершене резервне копіювання (`type`, необов'язково `sizeBytes`, необов'язково `notes`) |

## Корпоративні API {#enterprise-apis}

Ці маршрути обмежені ліцензією через пов'язану з ними корпоративну функцію. Вони все ще потребують зазначеного дозволу SnapOtter.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Експортувати записи аудиту як JSON або CSV з фільтрами |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Експортувати відредаговану конфігурацію екземпляра, власні ролі та команди |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Імпортувати конфігурацію, з необов'язковим пробним запуском |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Прочитати налаштований список дозволених CIDR |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Оновити список дозволених CIDR із запобіганням самоблокуванню |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Список юридичних утримань користувачів та команд |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Застосувати або зняти юридичне утримання для користувача чи команди |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Згенерувати bearer-токен SCIM, повертається один раз |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Відкликати поточний bearer-токен SCIM |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Прочитати конфігурацію переадресації SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Оновити конфігурацію переадресації SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Список призначень webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Створити призначення webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Оновити призначення webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Видалити призначення webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Надіслати тестове корисне навантаження webhook |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Розпочати завдання експорту користувача GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Прочитати статус експорту GDPR та URL завантаження |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Остаточно очистити дані користувача після підтвердження |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Остаточно очистити дані команди після підтвердження |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Прочитати метадані версій застосунку, збірки, Node та схеми |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Порівняти запаковані міграції із застосованими міграціями |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Запустити перевірки готовності до оновлення |

### SCIM 2.0 {#scim-2-0}

Кінцеві точки виявлення SCIM є публічними. Кінцеві точки користувачів та груп потребують bearer-токена SCIM, згенерованого вище.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Публічний | Можливості сервера SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Публічний | Виявлення схеми SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Публічний | Виявлення типу ресурсу SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Токен SCIM | Список користувачів, з необов'язковим фільтром SCIM |
| `POST` | `/api/v1/scim/v2/Users` | Токен SCIM | Створити користувача |
| `GET` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Отримати користувача |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | Замінити користувача |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Токен SCIM | М'яка деактивація користувача |
| `GET` | `/api/v1/scim/v2/Groups` | Токен SCIM | Список команд як груп SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Токен SCIM | Створити команду |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Отримати команду |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Замінити команду та членство в групі |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Токен SCIM | Видалити команду |

## Шаблони мемів {#meme-templates}

Допоміжний API для інструмента генератора мемів.

| Метод | Шлях | Доступ | Опис |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Список усіх доступних шаблонів мемів з позиціями текстових полів |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Надати зображення шаблону в повному розмірі |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Надати мініатюру шаблону |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Надати файл шрифту, що використовується для рендерингу тексту мемів |

## Відповіді про помилки {#error-responses}

Усі помилки повертають JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Статус | Значення |
|--------|---------|
| 400 | Недійсний запит / валідація не пройдена |
| 401 | Не автентифіковано |
| 403 | Недостатньо дозволів |
| 404 | Ресурс не знайдено |
| 413 | Файл завеликий (див. `MAX_UPLOAD_SIZE_MB`) |
| 422 | Обробка не вдалася після валідації |
| 429 | Обмежено за частотою (див. `RATE_LIMIT_PER_MIN`) |
| 501 | Необхідний пакет функцій ШІ не встановлено (`FEATURE_NOT_INSTALLED`) |
| 500 | Внутрішня помилка сервера |
