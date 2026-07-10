---
description: "Справочник по AI-движку со всеми локальными ML-инструментами. Удаление фона, апскейлинг, OCR, распознавание лиц, реставрация фотографий и другое."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: b36fb182c10f
---

# Справочник по AI-движку {#ai-engine-reference}

Пакет `@snapotter/ai` связывает Node.js с **постоянным Python-сайдкаром** для всех ML-операций. Процесс-диспетчер остаётся активным между запросами, обеспечивая быстрый прогретый старт. NVIDIA CUDA определяется автоматически при запуске и используется при наличии; в противном случае AI-инструменты работают на CPU.

Ускорение на встроенных GPU Intel/AMD через VA-API, Quick Sync или OpenCL для AI-инференса сейчас не поддерживается. Проброс `/dev/dri` в контейнер не ускоряет эти инструменты Python-сайдкара, если только не доступен NVIDIA GPU с поддержкой CUDA.

19 AI-инструментов Python-сайдкара в четырёх модальностях (изображение, аудио, видео, документ), плюс 2 инструмента с опциональными AI-возможностями. Все модели работают локально: интернет не требуется после первоначальной загрузки модели.

## Архитектура {#architecture}

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

Отдельный профиль диспетчера «docs» заменяет список разрешённых AI-скриптов скриптами обработки документов (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) и пропускает тяжёлые ML-импорты.

**Таймауты:** 300 с по умолчанию; OCR и удаление фона BiRefNet получают 600 с.

## Пакеты возможностей {#feature-bundles}

Каждый AI-инструмент требует установки пакета модели перед использованием. Пакеты устанавливаются по требованию через админ-интерфейс или `install_feature.py`.

| Пакет | Размер | Инструменты |
|--------|------|-------|
| `background-removal` | 4-5 ГБ | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 МБ | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 ГБ | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 ГБ | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 ГБ | restore-photo |
| `ocr` | 5-6 ГБ | ocr, ocr-pdf |
| `transcription` | ~600 МБ | transcribe-audio, auto-subtitles |

---

## Удаление фона {#background-removal}

**Маршрут инструмента:** `remove-background`  
**Модель:** rembg с BiRefNet (по умолчанию) или вариантами U2-Net

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `model` | string | - | Вариант модели (опциональное переопределение) |
| `backgroundType` | string | `"transparent"` | Одно из: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Hex-цвет для сплошного фона |
| `gradientColor1` | string | - | Первый цвет градиента |
| `gradientColor2` | string | - | Второй цвет градиента |
| `gradientAngle` | number | - | Угол градиента в градусах |
| `blurEnabled` | boolean | - | Включить эффект размытия фона |
| `blurIntensity` | number (0-100) | - | Интенсивность размытия |
| `shadowEnabled` | boolean | - | Включить тень под объектом |
| `shadowOpacity` | number (0-100) | - | Непрозрачность тени |
| `outputFormat` | string | - | Выходной формат: `png`, `webp` или `avif` |
| `edgeRefine` | integer (0-3) | - | Уровень уточнения краёв |
| `decontaminate` | boolean | - | Убрать цветовые переливы с краёв |

## Замена фона {#background-replace}

**Маршрут инструмента:** `background-replace`  
**Модель:** rembg / BiRefNet (общая с remove-background)

Удаляет фон и заменяет его сплошным цветом или градиентом.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Режим фона |
| `color` | string | `"#ffffff"` | Hex-цвет фона (когда `backgroundType` равно `color`) |
| `gradientColor1` | string | - | Первый hex-цвет градиента |
| `gradientColor2` | string | - | Второй hex-цвет градиента |
| `gradientAngle` | integer (0-360) | `180` | Угол градиента в градусах |
| `feather` | integer (0-20) | `0` | Радиус растушёвки краёв |
| `format` | `"png"` \| `"webp"` | `"png"` | Выходной формат |

## Размытие фона {#blur-background}

**Маршрут инструмента:** `blur-background`  
**Модель:** rembg / BiRefNet (общая с remove-background)

Размывает фон, сохраняя объект резким.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Интенсивность размытия |
| `feather` | integer (0-20) | `0` | Радиус растушёвки краёв |
| `format` | `"png"` \| `"webp"` | `"png"` | Выходной формат |

## Апскейлинг изображения {#image-upscaling}

**Маршрут инструмента:** `upscale`  
**Модель:** RealESRGAN (с откатом на Lanczos при недоступности)

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Коэффициент увеличения |
| `model` | string | `"auto"` | Вариант модели |
| `faceEnhance` | boolean | `false` | Применить проход улучшения лиц GFPGAN |
| `denoise` | number | `0` | Сила шумоподавления |
| `format` | string | `"auto"` | Переопределение выходного формата |
| `quality` | number | `95` | Качество вывода (1-100) |

## OCR / Извлечение текста {#ocr-text-extraction}

**Маршрут инструмента:** `ocr`  
**Модели:** Tesseract (быстро), PaddleOCR PP-OCRv5 (сбалансировано), PaddleOCR-VL 1.5 (лучше всего)

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Уровень обработки |
| `language` | string | `"auto"` | Язык: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Предобработка изображения для повышения точности OCR |
| `engine` | string | - | Устарело. Сопоставляет `tesseract` с `fast`, `paddleocr` с `balanced` |

Возвращает структурированные результаты с ограничивающими рамками, оценками уверенности и извлечёнными блоками текста.

## OCR для PDF {#pdf-ocr}

**Маршрут инструмента:** `ocr-pdf`  
**Модели:** Та же система уровней, что и у OCR изображений

Извлекает текст из отсканированных PDF-документов с помощью OCR на базе AI, страница за страницей.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Уровень обработки |
| `language` | string | `"auto"` | Язык: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Выбор страниц: `"all"`, `"1-3"`, `"1,3,5"` |

## Размытие лиц / PII {#face-pii-blur}

**Маршрут инструмента:** `blur-faces`  
**Модель:** Распознавание лиц MediaPipe

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Радиус гауссова размытия |
| `sensitivity` | number (0-1) | `0.5` | Порог уверенности распознавания |

## Улучшение лиц {#face-enhancement}

**Маршрут инструмента:** `enhance-faces`  
**Модели:** GFPGAN, CodeFormer

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Модель улучшения |
| `strength` | number (0-1) | `0.8` | Сила улучшения |
| `sensitivity` | number (0-1) | `0.5` | Порог распознавания лиц |
| `onlyCenterFace` | boolean | `false` | Улучшать только самое центральное лицо |

## AI-колоризация {#ai-colorization}

**Маршрут инструмента:** `colorize`  
**Модель:** DDColor (с откатом на OpenCV DNN)

Преобразует чёрно-белые или полутоновые фотографии в полноцветные.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Сила насыщенности цвета |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Вариант модели |

## Удаление шума {#noise-removal}

**Маршрут инструмента:** `noise-removal`  
**Модель:** SCUNet (многоуровневый конвейер шумоподавления)

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Уровень обработки |
| `strength` | number (0-100) | `50` | Сила шумоподавления |
| `detailPreservation` | number (0-100) | `50` | Сколько деталей сохранять; выше значение сохраняет больше текстуры |
| `colorNoise` | number (0-100) | `30` | Сила подавления цветового шума |
| `format` | string | `"original"` | Выходной формат: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Качество кодирования вывода |

## Удаление эффекта красных глаз {#red-eye-removal}

**Маршрут инструмента:** `red-eye-removal`

Определяет ключевые точки лица, находит области глаз и корректирует пересыщение красного канала.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Порог обнаружения красных пикселей |
| `strength` | number (0-100) | `70` | Сила коррекции |
| `format` | string | - | Переопределение выходного формата (опционально) |
| `quality` | number (1-100) | `90` | Качество вывода |

## Реставрация фотографий {#photo-restoration}

**Маршрут инструмента:** `restore-photo`

Многошаговый конвейер для старых или повреждённых фотографий: обнаружение и восстановление царапин/разрывов, улучшение лиц, шумоподавление и опциональная колоризация.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Обнаруживать и устранять царапины, разрывы |
| `faceEnhancement` | boolean | `true` | Применить проход улучшения лиц |
| `fidelity` | number (0-1) | `0.7` | Сила улучшения лиц (выше = консервативнее) |
| `denoise` | boolean | `true` | Применить проход шумоподавления |
| `denoiseStrength` | number (0-100) | `25` | Сила шумоподавления |
| `colorize` | boolean | `false` | Колоризировать после реставрации |
| `colorizeStrength` | number (0-100) | `85` | Интенсивность колоризации |

## Фото на документы {#passport-photo}

**Маршрут инструмента:** `passport-photo`  
**Модели:** Ключевые точки лица MediaPipe + удаление фона BiRefNet

Двухфазный процесс: анализ (обнаружение лица + удаление фона), затем генерация (обрезка, изменение размера, разметка). Поддерживает 37+ стран в 6 регионах.

### Фаза 1: Анализ {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Принимает файл изображения (multipart). Возвращает данные о ключевых точках лица, base64-предпросмотр и размеры изображения.

### Фаза 2: Генерация {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Принимает JSON-тело с результатами Фазы 1 плюс настройки генерации:

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `jobId` | string | (обязательно) | ID задачи из Фазы 1 |
| `filename` | string | (обязательно) | Исходное имя файла из Фазы 1 |
| `countryCode` | string | (обязательно) | ISO-код страны (например, `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Тип документа |
| `bgColor` | string | `"#FFFFFF"` | Hex-цвет фона |
| `printLayout` | string | `"none"` | Макет печати: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Максимальный размер файла в КБ (0 = без ограничения) |
| `dpi` | number (72-1200) | `300` | Выходное DPI |
| `customWidthMm` | number | - | Пользовательская ширина в мм (переопределяет спецификацию страны) |
| `customHeightMm` | number | - | Пользовательская высота в мм (переопределяет спецификацию страны) |
| `zoom` | number (0.5-3) | `1` | Коэффициент масштабирования |
| `adjustX` | number | `0` | Корректировка горизонтального положения |
| `adjustY` | number | `0` | Корректировка вертикального положения |
| `landmarks` | object | (обязательно) | Ключевые точки из Фазы 1 |
| `imageWidth` | number | (обязательно) | Ширина изображения из Фазы 1 |
| `imageHeight` | number | (обязательно) | Высота изображения из Фазы 1 |

## Удаление объектов (Инпейнтинг) {#object-erasing-inpainting}

**Маршрут инструмента:** `erase-object`  
**Модель:** LaMa через ONNX Runtime

Маска отправляется как **вторая часть файла** (имя поля `mask`), а не как base64. Белые пиксели в маске обозначают области для удаления. Настройки `format` и `quality` отправляются как поля формы верхнего уровня.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `file` | file | (обязательно) | Исходное изображение (multipart) |
| `mask` | file | (обязательно) | Изображение маски (multipart, имя поля `mask`, белый = удалить) |
| `format` | string | `"auto"` | Выходной формат: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Качество вывода |

Ускоряется через CUDA при наличии NVIDIA GPU.

## AI-расширение холста {#ai-canvas-expand}

**Маршрут инструмента:** `ai-canvas-expand`  
**Модель:** Аутпейнтинг на базе LaMa

Расширяет холст изображения в любом направлении и заполняет новые области сгенерированным AI содержимым, соответствующим существующему изображению.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Пикселей для расширения сверху |
| `extendRight` | integer | `0` | Пикселей для расширения справа |
| `extendBottom` | integer | `0` | Пикселей для расширения снизу |
| `extendLeft` | integer | `0` | Пикселей для расширения слева |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Уровень качества |
| `format` | string | `"auto"` | Выходной формат: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Качество вывода |

Хотя бы одно направление расширения должно быть больше 0.

## Умная обрезка {#smart-crop}

**Маршрут инструмента:** `smart-crop`  
**Модель:** Распознавание лиц MediaPipe (только режим лиц)

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Стратегия обрезки: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Стратегия для режима объекта |
| `width` | integer | - | Выходная ширина |
| `height` | integer | - | Выходная высота |
| `padding` | integer (0-50) | `0` | Процент отступа вокруг объекта |
| `facePreset` | string | `"head-shoulders"` | Предустановка кадрирования при `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Порог распознавания лиц |
| `threshold` | integer (0-255) | `30` | Порог обнаружения фона (режим обрезки) |
| `padToSquare` | boolean | `false` | Дополнить обрезанный результат до квадрата |
| `padColor` | string | `"#ffffff"` | Цвет фона для квадратного дополнения |
| `targetSize` | integer | - | Целевой размер для дополненного вывода (пиксели) |
| `quality` | integer (1-100) | - | Качество вывода |

Устаревшие значения `mode` `attention` и `content` принимаются и сопоставляются с `subject` и `trim` соответственно.

**Предустановки для лиц:**

| Предустановка | Лучше всего для |
|--------|---------|
| `closeup` | Портретов крупным планом |
| `head-shoulders` | Фото профиля |
| `upper-body` | LinkedIn / формальных |
| `half-body` | Всей верхней части тела |

## Транскрипция аудио {#transcribe-audio}

**Маршрут инструмента:** `transcribe-audio`  
**Модель:** faster-whisper

Преобразует речь в текст. Поддерживает форматы вывода: обычный текст, SRT и VTT.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Язык: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Выходной формат |

## Автоматические субтитры {#auto-subtitles}

**Маршрут инструмента:** `auto-subtitles`  
**Модель:** faster-whisper (извлекает аудио из видео, затем транскрибирует)

Генерирует файлы субтитров из звуковой дорожки видео.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Язык: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Выходной формат субтитров |

## Исправление прозрачности PNG {#png-transparency-fixer}

**Маршрут инструмента:** `transparency-fixer`  
**Модель:** BiRefNet HR-matting (разрешение 2048x2048)

Исправляет «псевдопрозрачные» PNG, где фон был удалён, но остались окантовки, ореолы или полупрозрачные артефакты. Использует модель матирования высокого разрешения BiRefNet для создания чистого альфа-канала, затем применяет настраиваемую обработку удаления окантовки для устранения цветового загрязнения по краям.

**Цепочка отката при OOM:** Если BiRefNet HR-matting превышает доступную память, инструмент автоматически откатывается на `birefnet-general`, затем на `u2net`.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Сила удаления окантовки для устранения цветового загрязнения |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Выходной формат изображения |
| `removeWatermark` | boolean | `false` | Применить предобработку удаления водяного знака (медианный фильтр) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Инструменты с опциональными AI-возможностями {#tools-with-optional-ai-capabilities}

Следующие инструменты не являются инструментами Python-сайдкара, но используют AI-функции при включении определённых опций.

### Улучшение изображения {#image-enhancement}

**Маршрут инструмента:** `image-enhancement`  
**Движок:** На основе анализа (гистограмма и статистика Sharp)

Анализирует изображение и применяет автоматические коррекции экспозиции, контрастности, баланса белого, насыщенности, резкости и шума. Поддерживает режимы для конкретных сцен.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Режим сцены для настройки коррекций |
| `intensity` | number (0-100) | `50` | Общая сила коррекции |
| `corrections.exposure` | boolean | `true` | Применить коррекцию экспозиции |
| `corrections.contrast` | boolean | `true` | Применить коррекцию контрастности |
| `corrections.whiteBalance` | boolean | `true` | Применить коррекцию баланса белого |
| `corrections.saturation` | boolean | `true` | Применить коррекцию насыщенности |
| `corrections.sharpness` | boolean | `true` | Применить коррекцию резкости |
| `corrections.denoise` | boolean | `true` | Применить шумоподавление |
| `deepEnhance` | boolean | `false` | Включить AI-удаление шума через SCUNet (требует пакет `upscale-enhance`) |

Дополнительная конечная точка анализа доступна по адресу `POST /api/v1/tools/image/image-enhancement/analyze`, которая возвращает обнаруженные коррекции без их применения.

### Контентно-зависимое изменение размера (Seam Carving) {#content-aware-resize-seam-carving}

**Маршрут инструмента:** `content-aware-resize`  
**Движок:** Бинарник Go `caire` (не Python: без выигрыша от GPU)

Интеллектуально изменяет размер изображений, удаляя низкоэнергетические швы и сохраняя важное содержимое.

| Параметр | Тип | По умолчанию | Описание |
|-----------|------|---------|-------------|
| `width` | number | - | Целевая ширина |
| `height` | number | - | Целевая высота |
| `protectFaces` | boolean | `false` | Защищать обнаруженные области лиц (требует пакет `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Предварительное размытие для расчёта энергии |
| `sobelThreshold` | number (1-20) | `2` | Порог чувствительности к краям |
| `square` | boolean | `false` | Принудительный квадратный вывод |
