---
description: "مرجع محرك الذكاء الاصطناعي مع جميع أدوات التعلم الآلي المحلية. إزالة الخلفية، تكبير الدقة، التعرف الضوئي على الحروف، اكتشاف الوجوه، ترميم الصور، والمزيد."
i18n_source_hash: dd135f2e9fdb
i18n_provenance: human
i18n_output_hash: a9f93210de41
---

# مرجع محرك الذكاء الاصطناعي {#ai-engine-reference}

تربط حزمة `@snapotter/ai` بين Node.js وبين **رفيق Python دائم** لجميع عمليات التعلم الآلي. تبقى عملية الموزّع نشطة بين الطلبات لأداء بدء دافئ سريع. يُكتشف NVIDIA CUDA تلقائيًا عند بدء التشغيل ويُستخدم عند توفره؛ وإلا تعمل أدوات الذكاء الاصطناعي على وحدة المعالجة المركزية.

تسريع وحدة المعالجة الرسومية المدمجة من Intel/AMD عبر VA-API أو Quick Sync أو OpenCL غير مدعوم للاستدلال بالذكاء الاصطناعي اليوم. لا يؤدي تعيين `/dev/dri` داخل حاوية إلى تسريع أدوات رفيق Python هذه ما لم تتوفر وحدة معالجة رسومية NVIDIA تدعم CUDA.

هناك 19 أداة ذكاء اصطناعي في رفيق Python عبر أربع طرائق (صورة، صوت، فيديو، مستند)، بالإضافة إلى أداتين بقدرات ذكاء اصطناعي اختيارية. تعمل جميع النماذج محليًا، فلا حاجة إلى الإنترنت بعد تنزيل النموذج الأولي.

## البنية المعمارية {#architecture}

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

يستبدل ملف موزّع "docs" منفصل قائمة السماح الخاصة بالذكاء الاصطناعي بنصوص معالجة المستندات (`doc_pagecount`، `doc_health`، `doc_flatten`، `doc_redact`، `doc_text`، `doc_to_word`، `doc_metadata`، `doc_html_pdf`) ويتخطى استيرادات التعلم الآلي الثقيلة.

**المهل الزمنية:** 300 ثانية افتراضيًا؛ ويحصل التعرف الضوئي على الحروف وإزالة الخلفية بـ BiRefNet على 600 ثانية.

## حزم الميزات {#feature-bundles}

تتطلب كل أداة ذكاء اصطناعي تثبيت حزمة نموذج قبل الاستخدام. تُثبَّت الحزم عند الطلب عبر واجهة المسؤول أو `install_feature.py`.

| الحزمة | الحجم | الأدوات |
|--------|------|-------|
| `background-removal` | 4-5 غيغابايت | remove-background، passport-photo، transparency-fixer، background-replace، blur-background |
| `face-detection` | 200-300 ميغابايت | blur-faces، red-eye-removal، smart-crop |
| `object-eraser-colorize` | 1-2 غيغابايت | erase-object، colorize، ai-canvas-expand |
| `upscale-enhance` | 5-6 غيغابايت | upscale، enhance-faces، noise-removal |
| `photo-restoration` | 4-5 غيغابايت | restore-photo |
| `ocr` | 5-6 غيغابايت | ocr، ocr-pdf |
| `transcription` | نحو 600 ميغابايت | transcribe-audio، auto-subtitles |

---

## إزالة الخلفية {#background-removal}

**مسار الأداة:** `remove-background`  
**النموذج:** rembg مع BiRefNet (افتراضي) أو متغيرات U2-Net

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `model` | string | - | متغير النموذج (تجاوز اختياري) |
| `backgroundType` | string | `"transparent"` | أحد: `transparent`، `color`، `gradient`، `blur`، `image` |
| `backgroundColor` | string | - | لون سداسي عشري لخلفية صلبة |
| `gradientColor1` | string | - | لون التدرج الأول |
| `gradientColor2` | string | - | لون التدرج الثاني |
| `gradientAngle` | number | - | زاوية التدرج بالدرجات |
| `blurEnabled` | boolean | - | تفعيل تأثير تمويه الخلفية |
| `blurIntensity` | number (0-100) | - | شدة التمويه |
| `shadowEnabled` | boolean | - | تفعيل الظل المُسقَط على الموضوع |
| `shadowOpacity` | number (0-100) | - | شفافية الظل |
| `outputFormat` | string | - | صيغة الإخراج: `png` أو `webp` أو `avif` |
| `edgeRefine` | integer (0-3) | - | مستوى صقل الحواف |
| `decontaminate` | boolean | - | إزالة تسرّب اللون من الحواف |

## استبدال الخلفية {#background-replace}

**مسار الأداة:** `background-replace`  
**النموذج:** rembg / BiRefNet (مشترك مع remove-background)

يزيل الخلفية ويستبدلها بلون صلب أو تدرج.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | وضع الخلفية |
| `color` | string | `"#ffffff"` | لون الخلفية السداسي العشري (عندما يكون `backgroundType` هو `color`) |
| `gradientColor1` | string | - | لون التدرج السداسي العشري الأول |
| `gradientColor2` | string | - | لون التدرج السداسي العشري الثاني |
| `gradientAngle` | integer (0-360) | `180` | زاوية التدرج بالدرجات |
| `feather` | integer (0-20) | `0` | نصف قطر تنعيم الحواف |
| `format` | `"png"` \| `"webp"` | `"png"` | صيغة الإخراج |

## تمويه الخلفية {#blur-background}

**مسار الأداة:** `blur-background`  
**النموذج:** rembg / BiRefNet (مشترك مع remove-background)

يموّه الخلفية مع إبقاء الموضوع حادًا.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | شدة التمويه |
| `feather` | integer (0-20) | `0` | نصف قطر تنعيم الحواف |
| `format` | `"png"` \| `"webp"` | `"png"` | صيغة الإخراج |

## تكبير دقة الصورة {#image-upscaling}

**مسار الأداة:** `upscale`  
**النموذج:** RealESRGAN (مع احتياطي Lanczos عند عدم توفره)

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `scale` | number | `2` | عامل التكبير |
| `model` | string | `"auto"` | متغير النموذج |
| `faceEnhance` | boolean | `false` | تطبيق تمريرة تحسين الوجوه بـ GFPGAN |
| `denoise` | number | `0` | قوة إزالة التشويش |
| `format` | string | `"auto"` | تجاوز صيغة الإخراج |
| `quality` | number | `95` | جودة الإخراج (1-100) |

## التعرف الضوئي على الحروف / استخراج النص {#ocr-text-extraction}

**مسار الأداة:** `ocr`  
**النماذج:** Tesseract (سريع)، PaddleOCR PP-OCRv5 (متوازن)، PaddleOCR-VL 1.5 (الأفضل)

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | مستوى المعالجة |
| `language` | string | `"auto"` | اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko` |
| `enhance` | boolean | `true` | معالجة مسبقة للصورة لتحسين دقة التعرف الضوئي على الحروف |
| `engine` | string | - | مُهمَل. يربط `tesseract` بـ `fast`، و`paddleocr` بـ `balanced` |

يعيد نتائج منظّمة مع مربعات إحاطة ودرجات ثقة وكتل نص مستخرجة.

## التعرف الضوئي على الحروف في PDF {#pdf-ocr}

**مسار الأداة:** `ocr-pdf`  
**النماذج:** نظام المستويات نفسه المستخدم في التعرف الضوئي على الحروف في الصور

يستخرج النص من مستندات PDF الممسوحة ضوئيًا باستخدام تعرف ضوئي مدعوم بالذكاء الاصطناعي، صفحة تلو الأخرى.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | مستوى المعالجة |
| `language` | string | `"auto"` | اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko` |
| `pages` | string | `"all"` | تحديد الصفحات: `"all"`، `"1-3"`، `"1,3,5"` |

## تمويه الوجوه / المعلومات الشخصية {#face-pii-blur}

**مسار الأداة:** `blur-faces`  
**النموذج:** اكتشاف الوجوه بـ MediaPipe

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | نصف قطر التمويه الغاوسي |
| `sensitivity` | number (0-1) | `0.5` | عتبة ثقة الاكتشاف |

## تحسين الوجوه {#face-enhancement}

**مسار الأداة:** `enhance-faces`  
**النماذج:** GFPGAN، CodeFormer

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | نموذج التحسين |
| `strength` | number (0-1) | `0.8` | قوة التحسين |
| `sensitivity` | number (0-1) | `0.5` | عتبة اكتشاف الوجوه |
| `onlyCenterFace` | boolean | `false` | تحسين الوجه الأكثر مركزية فقط |

## التلوين بالذكاء الاصطناعي {#ai-colorization}

**مسار الأداة:** `colorize`  
**النموذج:** DDColor (مع احتياطي OpenCV DNN)

يحوّل الصور بالأبيض والأسود أو ذات التدرج الرمادي إلى صور ملوّنة بالكامل.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | قوة تشبع الألوان |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | متغير النموذج |

## إزالة التشويش {#noise-removal}

**مسار الأداة:** `noise-removal`  
**النموذج:** SCUNet (خط أنابيب إزالة تشويش متعدد المستويات)

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | مستوى المعالجة |
| `strength` | number (0-100) | `50` | قوة إزالة التشويش |
| `detailPreservation` | number (0-100) | `50` | مقدار التفاصيل المراد الحفاظ عليها؛ فالقيمة الأعلى تُبقي نسيجًا أكثر |
| `colorNoise` | number (0-100) | `30` | قوة تقليل التشويش اللوني |
| `format` | string | `"original"` | صيغة الإخراج: `original`، `png`، `jpeg`، `webp`، `avif`، `jxl` |
| `quality` | number (1-100) | `90` | جودة ترميز الإخراج |

## إزالة العين الحمراء {#red-eye-removal}

**مسار الأداة:** `red-eye-removal`

يكتشف معالم الوجه، ويحدد مناطق العين، ويصحّح فرط تشبع القناة الحمراء.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | عتبة اكتشاف البكسل الأحمر |
| `strength` | number (0-100) | `70` | قوة التصحيح |
| `format` | string | - | تجاوز صيغة الإخراج (اختياري) |
| `quality` | number (1-100) | `90` | جودة الإخراج |

## ترميم الصور {#photo-restoration}

**مسار الأداة:** `restore-photo`

خط أنابيب متعدد الخطوات للصور القديمة أو التالفة: اكتشاف الخدوش/التمزقات وإصلاحها، وتحسين الوجوه، وإزالة التشويش، والتلوين الاختياري.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | اكتشاف الخدوش والتمزقات وإصلاحها |
| `faceEnhancement` | boolean | `true` | تطبيق تمريرة تحسين الوجوه |
| `fidelity` | number (0-1) | `0.7` | قوة تحسين الوجوه (الأعلى = أكثر تحفظًا) |
| `denoise` | boolean | `true` | تطبيق تمريرة إزالة التشويش |
| `denoiseStrength` | number (0-100) | `25` | قوة إزالة التشويش |
| `colorize` | boolean | `false` | التلوين بعد الترميم |
| `colorizeStrength` | number (0-100) | `85` | شدة التلوين |

## صورة جواز السفر {#passport-photo}

**مسار الأداة:** `passport-photo`  
**النماذج:** معالم الوجه بـ MediaPipe + إزالة الخلفية بـ BiRefNet

سير عمل من مرحلتين: التحليل (اكتشاف الوجه + إزالة الخلفية) ثم التوليد (اقتصاص، تغيير حجم، تجانب). يدعم أكثر من 37 دولة عبر 6 مناطق.

### المرحلة 1: التحليل {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

يقبل ملف صورة (multipart). يعيد بيانات معالم الوجه، ومعاينة بترميز base64، وأبعاد الصورة.

### المرحلة 2: التوليد {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

يقبل نص طلب JSON يتضمن نتائج المرحلة 1 بالإضافة إلى إعدادات التوليد:

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `jobId` | string | (مطلوب) | معرّف المهمة من المرحلة 1 |
| `filename` | string | (مطلوب) | اسم الملف الأصلي من المرحلة 1 |
| `countryCode` | string | (مطلوب) | رمز الدولة ISO (مثل `US`، `GB`، `IN`) |
| `documentType` | string | `"passport"` | نوع المستند |
| `bgColor` | string | `"#FFFFFF"` | لون الخلفية السداسي العشري |
| `printLayout` | string | `"none"` | تخطيط الطباعة: `none`، `4x6`، `a4`، `letter` |
| `maxFileSizeKb` | number | `0` | الحد الأقصى لحجم الملف بالكيلوبايت (0 = بلا حد) |
| `dpi` | number (72-1200) | `300` | دقة الإخراج DPI |
| `customWidthMm` | number | - | عرض مخصص بالمليمتر (يتجاوز مواصفات الدولة) |
| `customHeightMm` | number | - | ارتفاع مخصص بالمليمتر (يتجاوز مواصفات الدولة) |
| `zoom` | number (0.5-3) | `1` | عامل التكبير |
| `adjustX` | number | `0` | ضبط الموضع الأفقي |
| `adjustY` | number | `0` | ضبط الموضع الرأسي |
| `landmarks` | object | (مطلوب) | المعالم من المرحلة 1 |
| `imageWidth` | number | (مطلوب) | عرض الصورة من المرحلة 1 |
| `imageHeight` | number | (مطلوب) | ارتفاع الصورة من المرحلة 1 |

## محو الكائنات (الطلاء البيني) {#object-erasing-inpainting}

**مسار الأداة:** `erase-object`  
**النموذج:** LaMa عبر ONNX Runtime

يُرسل القناع بوصفه **جزء ملف ثانٍ** (اسم الحقل `mask`)، لا بترميز base64. تشير البكسلات البيضاء في القناع إلى المناطق المراد محوها. يُرسل إعدادا `format` و`quality` بوصفهما حقلي نموذج بمستوى أعلى.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `file` | file | (مطلوب) | الصورة المصدر (multipart) |
| `mask` | file | (مطلوب) | صورة القناع (multipart، اسم الحقل `mask`، الأبيض = محو) |
| `format` | string | `"auto"` | صيغة الإخراج: `auto`، `png`، `jpg`، `jpeg`، `webp`، `tiff`، `gif`، `avif`، `heic`، `heif`، `jxl` |
| `quality` | integer (1-100) | `95` | جودة الإخراج |

مُسرَّع بـ CUDA عند توفر وحدة معالجة رسومية NVIDIA.

## توسيع اللوحة بالذكاء الاصطناعي {#ai-canvas-expand}

**مسار الأداة:** `ai-canvas-expand`  
**النموذج:** طلاء خارجي قائم على LaMa

يوسّع لوحة الصورة في أي اتجاه ويملأ المناطق الجديدة بمحتوى مولّد بالذكاء الاصطناعي يتناسب مع الصورة الحالية.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | البكسلات المراد التمديد بها من الأعلى |
| `extendRight` | integer | `0` | البكسلات المراد التمديد بها من اليمين |
| `extendBottom` | integer | `0` | البكسلات المراد التمديد بها من الأسفل |
| `extendLeft` | integer | `0` | البكسلات المراد التمديد بها من اليسار |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | مستوى الجودة |
| `format` | string | `"auto"` | صيغة الإخراج: `auto`، `png`، `jpg`، `jpeg`، `webp`، `tiff`، `gif`، `avif`، `heic`، `heif`، `jxl` |
| `quality` | integer (1-100) | `95` | جودة الإخراج |

يجب أن يكون اتجاه تمديد واحد على الأقل أكبر من 0.

## الاقتصاص الذكي {#smart-crop}

**مسار الأداة:** `smart-crop`  
**النموذج:** اكتشاف الوجوه بـ MediaPipe (وضع الوجه فقط)

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | استراتيجية الاقتصاص: `subject`، `face`، `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | استراتيجية وضع الموضوع |
| `width` | integer | - | عرض الإخراج |
| `height` | integer | - | ارتفاع الإخراج |
| `padding` | integer (0-50) | `0` | النسبة المئوية للحشو حول الموضوع |
| `facePreset` | string | `"head-shoulders"` | تأطير مُعدّ مسبقًا عندما `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | عتبة اكتشاف الوجوه |
| `threshold` | integer (0-255) | `30` | عتبة اكتشاف الخلفية (وضع القص) |
| `padToSquare` | boolean | `false` | حشو النتيجة المقصوصة لتصبح مربعة |
| `padColor` | string | `"#ffffff"` | لون الخلفية للحشو المربع |
| `targetSize` | integer | - | الحجم المستهدف للإخراج المحشو (بالبكسل) |
| `quality` | integer (1-100) | - | جودة الإخراج |

تُقبَل قيم `mode` القديمة `attention` و`content` وتُربَط بـ `subject` و`trim` على التوالي.

**إعدادات الوجه المسبقة:**

| الإعداد المسبق | الأنسب لـ |
|--------|---------|
| `closeup` | لقطات الرأس |
| `head-shoulders` | صور الملف الشخصي |
| `upper-body` | LinkedIn / الرسمي |
| `half-body` | الجزء العلوي الكامل من الجسم |

## نسخ الصوت إلى نص {#transcribe-audio}

**مسار الأداة:** `transcribe-audio`  
**النموذج:** faster-whisper

يحوّل الكلام إلى نص. يدعم صيغ الإخراج نص عادي وSRT وVTT.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko`، `id`، `th`، `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | صيغة الإخراج |

## الترجمات التلقائية {#auto-subtitles}

**مسار الأداة:** `auto-subtitles`  
**النموذج:** faster-whisper (يستخرج الصوت من الفيديو ثم ينسخه إلى نص)

يولّد ملفات ترجمة من المسار الصوتي للفيديو.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | اللغة: `auto`، `en`، `de`، `fr`، `es`، `zh`، `ja`، `ko`، `id`، `th`، `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | صيغة ملف الترجمة الناتج |

## مُصلِح شفافية PNG {#png-transparency-fixer}

**مسار الأداة:** `transparency-fixer`  
**النموذج:** BiRefNet HR-matting (بدقة 2048x2048)

يصلح ملفات PNG "الشفافة الزائفة" حيث أُزيلت الخلفية لكنها تركت خلفها تنميشًا أو هالات أو أثارًا شبه شفافة. يستخدم نموذج المطّ عالي الدقة من BiRefNet لإنتاج قناة ألفا نظيفة، ثم يطبّق معالجة إزالة تنميش قابلة للتهيئة لإزالة تلوّث الألوان على طول الحواف.

**سلسلة الاحتياط عند نفاد الذاكرة:** إذا تجاوز BiRefNet HR-matting الذاكرة المتاحة، تعود الأداة تلقائيًا إلى `birefnet-general` ثم إلى `u2net`.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | قوة إزالة تنميش الحواف لإزالة تلوّث الألوان |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | صيغة صورة الإخراج |
| `removeWatermark` | boolean | `false` | تطبيق معالجة مسبقة لإزالة العلامة المائية (مرشح وسيط) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## أدوات بقدرات ذكاء اصطناعي اختيارية {#tools-with-optional-ai-capabilities}

الأدوات التالية ليست أدوات رفيق Python لكنها تستخدم ميزات الذكاء الاصطناعي عند تفعيل خيارات معينة.

### تحسين الصورة {#image-enhancement}

**مسار الأداة:** `image-enhancement`  
**المحرك:** قائم على التحليل (المدرّج التكراري والإحصاءات في Sharp)

يحلّل الصورة ويطبّق تصحيحات تلقائية للتعريض والتباين وتوازن اللون الأبيض والتشبع والحدّة والتشويش. يدعم أوضاعًا خاصة بالمشهد.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | وضع المشهد لضبط التصحيحات |
| `intensity` | number (0-100) | `50` | قوة التصحيح الإجمالية |
| `corrections.exposure` | boolean | `true` | تطبيق تصحيح التعريض |
| `corrections.contrast` | boolean | `true` | تطبيق تصحيح التباين |
| `corrections.whiteBalance` | boolean | `true` | تطبيق تصحيح توازن اللون الأبيض |
| `corrections.saturation` | boolean | `true` | تطبيق تصحيح التشبع |
| `corrections.sharpness` | boolean | `true` | تطبيق تصحيح الحدّة |
| `corrections.denoise` | boolean | `true` | تطبيق إزالة التشويش |
| `deepEnhance` | boolean | `false` | تفعيل إزالة التشويش بالذكاء الاصطناعي عبر SCUNet (يتطلب حزمة `upscale-enhance`) |

تتوفر نقطة نهاية تحليل إضافية عند `POST /api/v1/tools/image/image-enhancement/analyze` تعيد التصحيحات المكتشفة دون تطبيقها.

### تغيير الحجم المدرك للمحتوى (نحت الأخاديد) {#content-aware-resize-seam-carving}

**مسار الأداة:** `content-aware-resize`  
**المحرك:** ثنائي Go `caire` (ليس Python، فلا فائدة من وحدة المعالجة الرسومية)

يغيّر حجم الصور بذكاء عبر إزالة الأخاديد منخفضة الطاقة، مع الحفاظ على المحتوى المهم.

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `width` | number | - | العرض المستهدف |
| `height` | number | - | الارتفاع المستهدف |
| `protectFaces` | boolean | `false` | حماية مناطق الوجوه المكتشفة (يتطلب حزمة `face-detection`) |
| `blurRadius` | number (0-20) | `4` | تمويه مسبق لحساب الطاقة |
| `sobelThreshold` | number (1-20) | `2` | عتبة حساسية الحواف |
| `square` | boolean | `false` | فرض إخراج مربع |
