---
description: "Довідник рушія AI з усіма локальними ML-інструментами. Видалення фону, збільшення роздільної здатності, OCR, розпізнавання облич, відновлення фотографій тощо."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: 37060447737d
---

# Довідник рушія AI {#ai-engine-reference}

Пакет `@snapotter/ai` з'єднує Node.js із **постійним допоміжним процесом Python** для всіх ML-операцій. Процес диспетчера залишається активним між запитами задля швидкого прогрітого старту. NVIDIA CUDA визначається автоматично під час запуску й використовується, коли доступна; інакше AI-інструменти виконуються на CPU.

Прискорення на iGPU Intel/AMD через VA-API, Quick Sync або OpenCL наразі не підтримується для AI-інференсу. Прокидання `/dev/dri` у контейнер не прискорює ці інструменти допоміжного процесу Python, якщо немає CUDA-сумісного GPU від NVIDIA.

19 AI-інструментів допоміжного процесу Python у чотирьох модальностях (image, audio, video, document), а також 2 інструменти з опціональними AI-можливостями. Усі моделі виконуються локально: інтернет не потрібен після початкового завантаження моделей.

## Архітектура {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Окремий профіль диспетчера "docs" замінює білий список AI на скрипти обробки документів (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) і пропускає важкий імпорт ML.

**Тайм-аути:** 300 с за замовчуванням; OCR та видалення фону BiRefNet отримують 600 с.

## Набори функцій {#feature-bundles}

Кожен AI-інструмент вимагає встановлення набору моделей перед використанням. Набори встановлюються за потреби через адмін-інтерфейс або `install_feature.py`.

| Набір | Розмір | Інструменти |
|--------|------|-------|
| `background-removal` | 4-5 GB | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | restore-photo |
| `ocr` | 5-6 GB | ocr, ocr-pdf |
| `transcription` | ~600 MB | transcribe-audio, auto-subtitles |

---

## Видалення фону {#background-removal}

**Маршрут інструмента:** `remove-background`  
**Модель:** rembg з BiRefNet (за замовчуванням) або варіантами U2-Net

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `model` | string | - | Варіант моделі (опціональне перевизначення) |
| `backgroundType` | string | `"transparent"` | Один із: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex-колір для суцільного фону |
| `gradientColor1` | string | - | Перший колір градієнта |
| `gradientColor2` | string | - | Другий колір градієнта |
| `gradientAngle` | number | - | Кут градієнта в градусах |
| `blurEnabled` | boolean | - | Увімкнути ефект розмиття фону |
| `blurIntensity` | number (0-100) | - | Інтенсивність розмиття |
| `shadowEnabled` | boolean | - | Увімкнути падаючу тінь на об'єкті |
| `shadowOpacity` | number (0-100) | - | Непрозорість тіні |
| `outputFormat` | string | - | Формат виводу: `png`, `webp` або `avif` |
| `edgeRefine` | integer (0-3) | - | Рівень уточнення країв |
| `decontaminate` | boolean | - | Видалити просочування кольору з країв |

## Заміна фону {#background-replace}

**Маршрут інструмента:** `background-replace`  
**Модель:** rembg / BiRefNet (спільна з remove-background)

Видаляє фон і замінює його суцільним кольором або градієнтом.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Режим фону |
| `color` | string | `"#ffffff"` | Hex-колір фону (коли `backgroundType` дорівнює `color`) |
| `gradientColor1` | string | - | Перший hex-колір градієнта |
| `gradientColor2` | string | - | Другий hex-колір градієнта |
| `gradientAngle` | integer (0-360) | `180` | Кут градієнта в градусах |
| `feather` | integer (0-20) | `0` | Радіус розтушовування країв |
| `format` | `"png"` \| `"webp"` | `"png"` | Формат виводу |

## Розмиття фону {#blur-background}

**Маршрут інструмента:** `blur-background`  
**Модель:** rembg / BiRefNet (спільна з remove-background)

Розмиває фон, зберігаючи об'єкт різким.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Інтенсивність розмиття |
| `feather` | integer (0-20) | `0` | Радіус розтушовування країв |
| `format` | `"png"` \| `"webp"` | `"png"` | Формат виводу |

## Збільшення роздільної здатності зображення {#image-upscaling}

**Маршрут інструмента:** `upscale`  
**Модель:** RealESRGAN (із резервним Lanczos, коли недоступна)

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Коефіцієнт збільшення |
| `model` | string | `"auto"` | Варіант моделі |
| `faceEnhance` | boolean | `false` | Застосувати прохід покращення облич GFPGAN |
| `denoise` | number | `0` | Сила зменшення шуму |
| `format` | string | `"auto"` | Перевизначення формату виводу |
| `quality` | number | `95` | Якість виводу (1-100) |

## OCR / Витягання тексту {#ocr-text-extraction}

**Маршрут інструмента:** `ocr`  
**Моделі:** Tesseract (швидка), PaddleOCR PP-OCRv5 (збалансована), PaddleOCR-VL 1.5 (найкраща)

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Рівень обробки |
| `language` | string | `"auto"` | Мова: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Попередньо обробити зображення для підвищення точності OCR |
| `engine` | string | - | Застаріле. Зіставляє `tesseract` із `fast`, `paddleocr` із `balanced` |

Повертає структуровані результати з обмежувальними рамками, оцінками впевненості та витягнутими блоками тексту.

## OCR для PDF {#pdf-ocr}

**Маршрут інструмента:** `ocr-pdf`  
**Моделі:** Та сама рівнева система, що й OCR зображень

Витягає текст зі сканованих PDF-документів за допомогою OCR на основі AI, сторінка за сторінкою.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Рівень обробки |
| `language` | string | `"auto"` | Мова: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Вибір сторінок: `"all"`, `"1-3"`, `"1,3,5"` |

## Розмиття облич / PII {#face-pii-blur}

**Маршрут інструмента:** `blur-faces`  
**Модель:** розпізнавання облич MediaPipe

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Радіус розмиття за Гаусом |
| `sensitivity` | number (0-1) | `0.5` | Поріг впевненості розпізнавання |

## Покращення облич {#face-enhancement}

**Маршрут інструмента:** `enhance-faces`  
**Моделі:** GFPGAN, CodeFormer

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Модель покращення |
| `strength` | number (0-1) | `0.8` | Сила покращення |
| `sensitivity` | number (0-1) | `0.5` | Поріг розпізнавання облич |
| `onlyCenterFace` | boolean | `false` | Покращувати лише найцентральніше обличчя |

## AI-колоризація {#ai-colorization}

**Маршрут інструмента:** `colorize`  
**Модель:** DDColor (із резервним OpenCV DNN)

Перетворює чорно-білі або відтінки сірого фото на повнокольорові.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Сила насиченості кольору |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Варіант моделі |

## Видалення шуму {#noise-removal}

**Маршрут інструмента:** `noise-removal`  
**Модель:** SCUNet (рівневий конвеєр зменшення шуму)

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Рівень обробки |
| `strength` | number (0-100) | `50` | Сила зменшення шуму |
| `detailPreservation` | number (0-100) | `50` | Скільки деталей зберігати; вище значення зберігає більше текстури |
| `colorNoise` | number (0-100) | `30` | Сила зменшення кольорового шуму |
| `format` | string | `"original"` | Формат виводу: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Якість кодування виводу |

## Видалення ефекту червоних очей {#red-eye-removal}

**Маршрут інструмента:** `red-eye-removal`

Визначає орієнтири обличчя, знаходить області очей і виправляє перенасиченість червоного каналу.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Поріг виявлення червоних пікселів |
| `strength` | number (0-100) | `70` | Сила корекції |
| `format` | string | - | Перевизначення формату виводу (опціонально) |
| `quality` | number (1-100) | `90` | Якість виводу |

## Відновлення фотографій {#photo-restoration}

**Маршрут інструмента:** `restore-photo`

Багатоетапний конвеєр для старих чи пошкоджених фото: виявлення й усунення подряпин/розривів, покращення облич, зменшення шуму та опціональна колоризація.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Виявляти й усувати подряпини, розриви |
| `faceEnhancement` | boolean | `true` | Застосувати прохід покращення облич |
| `fidelity` | number (0-1) | `0.7` | Сила покращення облич (вище = консервативніше) |
| `denoise` | boolean | `true` | Застосувати прохід зменшення шуму |
| `denoiseStrength` | number (0-100) | `25` | Сила зменшення шуму |
| `colorize` | boolean | `false` | Колоризувати після відновлення |
| `colorizeStrength` | number (0-100) | `85` | Інтенсивність колоризації |

## Фото на паспорт {#passport-photo}

**Маршрут інструмента:** `passport-photo`  
**Моделі:** орієнтири обличчя MediaPipe + видалення фону BiRefNet

Двофазний робочий процес: аналіз (виявлення обличчя + видалення фону), потім генерація (обрізання, зміна розміру, розкладка). Підтримує 37+ країн у 6 регіонах.

### Фаза 1: Аналіз {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Приймає файл зображення (multipart). Повертає дані орієнтирів обличчя, попередній перегляд у base64 та розміри зображення.

### Фаза 2: Генерація {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Приймає JSON-тіло з результатами Фази 1 та налаштуваннями генерації:

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `jobId` | string | (обов'язковий) | ID завдання з Фази 1 |
| `filename` | string | (обов'язковий) | Початкове ім'я файлу з Фази 1 |
| `countryCode` | string | (обов'язковий) | Код країни ISO (напр., `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Тип документа |
| `bgColor` | string | `"#FFFFFF"` | Hex-колір фону |
| `printLayout` | string | `"none"` | Розкладка друку: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Макс. розмір файлу в KB (0 = без обмеження) |
| `dpi` | number (72-1200) | `300` | DPI виводу |
| `customWidthMm` | number | - | Власна ширина в мм (перевизначає специфікацію країни) |
| `customHeightMm` | number | - | Власна висота в мм (перевизначає специфікацію країни) |
| `zoom` | number (0.5-3) | `1` | Коефіцієнт масштабу |
| `adjustX` | number | `0` | Коригування горизонтального положення |
| `adjustY` | number | `0` | Коригування вертикального положення |
| `landmarks` | object | (обов'язковий) | Орієнтири з Фази 1 |
| `imageWidth` | number | (обов'язковий) | Ширина зображення з Фази 1 |
| `imageHeight` | number | (обов'язковий) | Висота зображення з Фази 1 |

## Стирання об'єктів (Inpainting) {#object-erasing-inpainting}

**Маршрут інструмента:** `erase-object`  
**Модель:** LaMa через ONNX Runtime

Маска надсилається як **друга частина файлу** (ім'я поля `mask`), а не як base64. Білі пікселі в масці позначають області для стирання. Налаштування `format` та `quality` надсилаються як поля форми верхнього рівня.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `file` | file | (обов'язковий) | Вихідне зображення (multipart) |
| `mask` | file | (обов'язковий) | Зображення маски (multipart, ім'я поля `mask`, білий = стерти) |
| `format` | string | `"auto"` | Формат виводу: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Якість виводу |

Прискорюється CUDA, коли доступний GPU від NVIDIA.

## AI-розширення полотна {#ai-canvas-expand}

**Маршрут інструмента:** `ai-canvas-expand`  
**Модель:** outpainting на основі LaMa

Розширює полотно зображення в будь-якому напрямку й заповнює нові області згенерованим AI вмістом, що відповідає наявному зображенню.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Пікселі для розширення зверху |
| `extendRight` | integer | `0` | Пікселі для розширення праворуч |
| `extendBottom` | integer | `0` | Пікселі для розширення знизу |
| `extendLeft` | integer | `0` | Пікселі для розширення ліворуч |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Рівень якості |
| `format` | string | `"auto"` | Формат виводу: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Якість виводу |

Принаймні один напрямок розширення має бути більшим за 0.

## Розумне обрізання {#smart-crop}

**Маршрут інструмента:** `smart-crop`  
**Модель:** розпізнавання облич MediaPipe (лише режим обличчя)

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Стратегія обрізання: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Стратегія для режиму об'єкта |
| `width` | integer | - | Ширина виводу |
| `height` | integer | - | Висота виводу |
| `padding` | integer (0-50) | `0` | Відсоток відступу навколо об'єкта |
| `facePreset` | string | `"head-shoulders"` | Попереднє кадрування, коли `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Поріг розпізнавання облич |
| `threshold` | integer (0-255) | `30` | Поріг виявлення фону (режим обрізання) |
| `padToSquare` | boolean | `false` | Доповнити обрізаний результат до квадрата |
| `padColor` | string | `"#ffffff"` | Колір фону для квадратного доповнення |
| `targetSize` | integer | - | Цільовий розмір для доповненого виводу (пікселі) |
| `quality` | integer (1-100) | - | Якість виводу |

Старі значення `mode` `attention` та `content` приймаються й зіставляються з `subject` та `trim` відповідно.

**Попередні налаштування для облич:**

| Попереднє налаштування | Найкраще для |
|--------|---------|
| `closeup` | Портрети облич |
| `head-shoulders` | Фото профілю |
| `upper-body` | LinkedIn / офіційні |
| `half-body` | Уся верхня частина тіла |

## Транскрибування аудіо {#transcribe-audio}

**Маршрут інструмента:** `transcribe-audio`  
**Модель:** faster-whisper

Перетворює мовлення на текст. Підтримує формати виводу простого тексту, SRT та VTT.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Мова: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Формат виводу |

## Автоматичні субтитри {#auto-subtitles}

**Маршрут інструмента:** `auto-subtitles`  
**Модель:** faster-whisper (витягає аудіо з відео, потім транскрибує)

Генерує файли субтитрів зі звукової доріжки відео.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Мова: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Формат виводу субтитрів |

## Виправлення прозорості PNG {#png-transparency-fixer}

**Маршрут інструмента:** `transparency-fixer`  
**Модель:** BiRefNet HR-matting (роздільна здатність 2048x2048)

Виправляє "фальшиво прозорі" PNG, де фон видалено, але залишилися облямівка, ореоли чи напівпрозорі артефакти. Використовує модель матування високої роздільної здатності BiRefNet для створення чистого альфа-каналу, потім застосовує налаштовувану обробку defringe для видалення забруднення кольором уздовж країв.

**Ланцюг резервних варіантів OOM:** Якщо BiRefNet HR-matting перевищує доступну пам'ять, інструмент автоматично переходить до `birefnet-general`, а потім до `u2net`.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Сила defringe країв для видалення забруднення кольором |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Формат зображення виводу |
| `removeWatermark` | boolean | `false` | Застосувати попередню обробку видалення водяного знака (медіанний фільтр) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Інструменти з опціональними AI-можливостями {#tools-with-optional-ai-capabilities}

Наведені нижче інструменти не є інструментами допоміжного процесу Python, але використовують AI-функції, коли ввімкнено певні опції.

### Покращення зображення {#image-enhancement}

**Маршрут інструмента:** `image-enhancement`  
**Рушій:** на основі аналізу (гістограма й статистика Sharp)

Аналізує зображення й застосовує автоматичні корекції експозиції, контрасту, балансу білого, насиченості, різкості та шуму. Підтримує режими для конкретних сцен.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Режим сцени для налаштування корекцій |
| `intensity` | number (0-100) | `50` | Загальна сила корекції |
| `corrections.exposure` | boolean | `true` | Застосувати корекцію експозиції |
| `corrections.contrast` | boolean | `true` | Застосувати корекцію контрасту |
| `corrections.whiteBalance` | boolean | `true` | Застосувати корекцію балансу білого |
| `corrections.saturation` | boolean | `true` | Застосувати корекцію насиченості |
| `corrections.sharpness` | boolean | `true` | Застосувати корекцію різкості |
| `corrections.denoise` | boolean | `true` | Застосувати зменшення шуму |
| `deepEnhance` | boolean | `false` | Увімкнути AI-видалення шуму через SCUNet (потребує набір `upscale-enhance`) |

Додаткова кінцева точка аналізу доступна за `POST /api/v1/tools/image/image-enhancement/analyze`, яка повертає виявлені корекції без їх застосування.

### Зміна розміру з урахуванням вмісту (Seam Carving) {#content-aware-resize-seam-carving}

**Маршрут інструмента:** `content-aware-resize`  
**Рушій:** бінарний файл Go `caire` (не Python, без переваги GPU)

Інтелектуально змінює розмір зображень, видаляючи низькоенергетичні шви й зберігаючи важливий вміст.

| Параметр | Тип | За замовчуванням | Опис |
|-----------|------|---------|-------------|
| `width` | number | - | Цільова ширина |
| `height` | number | - | Цільова висота |
| `protectFaces` | boolean | `false` | Захищати виявлені області облич (потребує набір `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Попереднє розмиття для розрахунку енергії |
| `sobelThreshold` | number (1-20) | `2` | Поріг чутливості країв |
| `square` | boolean | `false` | Примусовий квадратний вивід |
