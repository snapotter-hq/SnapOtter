---
description: "مرجع REST API الكامل. نقاط نهاية الأدوات، والمعالجة الدفعية، وخطوط المعالجة، ومكتبة الملفات، والمصادقة، والفرق، وعمليات الإدارة."
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: 89f2ba5743eb
---

# مرجع REST API {#rest-api-reference}

تتوفر وثائق API تفاعلية مع أمثلة للطلبات والاستجابات على [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

المواصفات القابلة للقراءة آليًا:
- `/api/v1/openapi.yaml` - مواصفات OpenAPI 3.1
- `/llms.txt` - ملخص ملائم لنماذج اللغة الكبيرة
- `/llms-full.txt` - وثائق كاملة ملائمة لنماذج اللغة الكبيرة

## المصادقة {#authentication}

تتطلب جميع نقاط النهاية المصادقة ما لم يكن `AUTH_ENABLED=false`.

### رمز الجلسة {#session-token}

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

تنتهي صلاحية الجلسات بعد 7 أيام (قابلة للتهيئة عبر `SESSION_DURATION_HOURS`).

### مفاتيح API {#api-keys}

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

تُسبق المفاتيح بـ `si_` وتُخزَّن كتجزئات scrypt، ويُعرض المفتاح الخام مرة واحدة فقط ولا يمكن استرجاعه أبدًا مرة أخرى.

### نقاط نهاية المصادقة {#auth-endpoints}

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | عام | تسجيل الدخول، والحصول على رمز الجلسة |
| `POST` | `/api/auth/logout` | مصادَق | إنهاء الجلسة الحالية |
| `GET` | `/api/auth/session` | مصادَق | التحقق من صحة الجلسة الحالية |
| `POST` | `/api/auth/change-password` | مصادَق | تغيير كلمة المرور الخاصة (يُبطل جميع الجلسات ومفاتيح API الأخرى) |
| `GET` | `/api/auth/users` | مسؤول | سرد جميع المستخدمين |
| `POST` | `/api/auth/register` | مسؤول | إنشاء مستخدم جديد |
| `PUT` | `/api/auth/users/:id` | مسؤول | تحديث دور المستخدم أو فريقه |
| `POST` | `/api/auth/users/:id/reset-password` | مسؤول | إعادة تعيين كلمة مرور المستخدم |
| `DELETE` | `/api/auth/users/:id` | مسؤول | حذف مستخدم |
| `GET` | `/api/v1/config/auth` | عام | التحقق مما إذا كانت المصادقة مُفعَّلة (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | مصادَق | بدء تسجيل المصادقة متعددة العوامل TOTP MFA. يتطلب ميزة `mfa` للمؤسسات |
| `POST` | `/api/auth/mfa/verify` | مصادَق | تأكيد تسجيل MFA باستخدام رمز TOTP |
| `POST` | `/api/auth/mfa/complete` | عام | إكمال تحدي تسجيل دخول MFA معلّق |
| `POST` | `/api/auth/mfa/disable` | مصادَق | تعطيل MFA للمستخدم الحالي |
| `POST` | `/api/auth/users/:id/mfa/reset` | مسؤول (`users:manage`) | إعادة تعيين MFA لمستخدم |
| `GET` | `/api/auth/oidc/login` | عام | بدء تسجيل دخول OIDC عند تفعيل OIDC |
| `GET` | `/api/auth/oidc/callback` | عام | استدعاء تفويض OIDC |
| `GET` | `/api/auth/saml/metadata` | عام | XML لبيانات وصف SAML SP عند تفعيل SAML |
| `GET` | `/api/auth/saml/login` | عام | بدء تسجيل دخول SAML |
| `POST` | `/api/auth/saml/callback` | عام | خدمة استهلاك تأكيدات SAML |

عند تفعيل MFA لمستخدم، يُرجع `POST /api/auth/login` القيمة `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` بدلًا من رمز الجلسة. أرسل ذلك `mfaToken` إضافةً إلى رمز TOTP أو رمز استرداد إلى `/api/auth/mfa/complete`.

### الأذونات {#permissions}

| الإذن | مسؤول | مستخدم |
|-----------|:-----:|:----:|
| استخدام الأدوات | ✓ | ✓ |
| الملفات/خطوط المعالجة/مفاتيح API الخاصة | ✓ | ✓ |
| رؤية ملفات/خطوط معالجة/مفاتيح جميع المستخدمين | ✓ | - |
| كتابة الإعدادات | ✓ | - |
| إدارة المستخدمين والفرق | ✓ | - |
| إدارة العلامة التجارية | ✓ | - |

## فحص الصحة {#health-check}

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | عام | فحص صحة أساسي. يُرجع `{"status":"healthy","version":"..."}` مع 200، أو `{"status":"unhealthy"}` مع 503 إذا تعذر الوصول إلى قاعدة البيانات. |
| `GET` | `/api/v1/readyz` | عام | فحص الجاهزية. يفحص PostgreSQL وRedis ومساحة القرص وS3 عند تهيئته. يُرجع 503 عندما لا ينبغي أن يستقبل مثيل الخادم أي حركة مرور. |
| `GET` | `/api/v1/admin/health` | مسؤول (`system:health`) | تشخيصات مفصلة تشمل مدة التشغيل، ووضع التخزين، وحالة قاعدة البيانات، وحالة الطابور، وتوفر وحدة معالجة الرسوميات GPU. |

## استخدام الأدوات {#using-tools}

تتبع كل أداة النمط نفسه:

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

يكون `<section>` واحدًا من `image` أو `video` أو `audio` أو `pdf` أو `files`.

- الرفع هو `multipart/form-data`.
- `settings` عبارة عن سلسلة JSON تحمل خيارات خاصة بالأداة.
- `clientJobId` حقل نموذج اختياري لربط التقدم المُقدَّم من المستدعي.
- `fileId` حقل نموذج اختياري يشير إلى عنصر موجود في مكتبة الملفات. عند وجوده، يُحفظ الناتج المُعالَج كإصدار جديد وتتضمن الاستجابة `savedFileId`.
- **الأدوات السريعة** تُرجع عادةً JSON بحالة 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. اجلب الملف المُعالَج من `downloadUrl`.
- **أي أداة مُدرجة في طابور** يمكن أن تُرجع JSON بحالة 202 إذا كانت طويلة التشغيل أو تجاوزت نافذة الانتظار المتزامن: `{"jobId":"...","async":true}`. اتصل بـ SSE لمتابعة التقدم، ثم نزّل عند الاكتمال (راجع [تتبع التقدم](#progress-tracking)).
- **المسارات الدفعية** تُرجع أرشيف ZIP يُبَث مباشرةً (مع ترويسة `X-Job-Id`) للأدوات المُسجَّلة في سجل الدفعات العام.

## مرجع الأدوات {#tools-reference}

### إعدادات التحويل الجاهزة {#conversion-presets}

يتضمن الكتالوج المشترك 83 نقطة نهاية مخصصة لإعدادات التحويل الجاهزة مثل `jpg-to-png` و`mov-to-mp4` و`m4a-to-mp3` و`pdf-to-jpg` و`excel-to-csv`. الإعدادات الجاهزة هي مسارات أدوات من الدرجة الأولى:

`POST /api/v1/tools/<section>/<presetId>`

يقفل كل إعداد جاهز صيغة الإخراج ويفوّض إلى أداة أساسية مثل `convert` أو `convert-video` أو `extract-audio` أو `convert-audio` أو `image-to-pdf` أو `pdf-to-image` أو `svg-to-raster` أو `convert-spreadsheet`. راجع [إعدادات التحويل الجاهزة](/ar/tools/conversion-presets) للاطلاع على جدول المسارات الكامل والإعدادات الاختيارية.

### الأساسيات {#essentials}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `resize` | تغيير الحجم | `width`، `height`، `fit` (cover/contain/fill/inside/outside)، `percentage`، `withoutEnlargement`، إضافةً إلى 23 إعدادًا جاهزًا لوسائل التواصل الاجتماعي |
| `crop` | قص | `left`، `top`، `width`، `height`، `unit` (px/percent) |
| `rotate` | تدوير وقلب | `angle`، `horizontal` (منطقي)، `vertical` (منطقي) |
| `convert` | تحويل | `format` (jpg/png/webp/avif/tiff/gif/heic/heif)، `quality` |
| `compress` | ضغط | `mode` (quality/targetSize)، `quality` (1–100)، `targetSizeKb` |

### التحسين {#optimization}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `optimize-for-web` | التحسين للويب | `format` (webp/jpeg/avif/png)، `quality`، `maxWidth`، `maxHeight`، `progressive`، `stripMetadata` |
| `strip-metadata` | إزالة البيانات الوصفية | - |
| `edit-metadata` | تحرير البيانات الوصفية | `title`، `description`، `author`، `copyright`، `keywords`، `gps` (خط العرض/خط الطول)، `dateTime` |
| `bulk-rename` | إعادة التسمية الجماعية | `pattern` (يدعم `{n}` و`{date}` و`{original}`)، `startIndex`، `padding` |
| `image-to-pdf` | صورة إلى PDF | `pageSize` (A4/Letter/...)، `orientation`، `margin`، `targetSize` ({value, unit}) |
| `favicon` | مُولِّد Favicon | `padding`، `backgroundColor`، `borderRadius` - يُولِّد جميع الأحجام القياسية |

### التعديلات {#adjustments}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `adjust-colors` | ضبط الألوان | `brightness`، `contrast`، `exposure`، `saturation`، `temperature`، `tint`، `hue`، `sharpness`، `red`، `green`، `blue`، `effect` (none/grayscale/sepia/invert) |
| `sharpening` | التحديد | `method` (adaptive/unsharp-mask/high-pass)، `sigma`، `m1`، `m2`، `x1`، `y2`، `y3`، `amount`، `radius`، `threshold`، `strength`، `kernelSize` (3/5)، `denoise` (off/light/medium/strong) |
| `replace-color` | استبدال اللون | `sourceColor`، `targetColor` (البديل)، `makeTransparent`، `tolerance` |
| `color-blindness` | محاكاة عمى الألوان | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy، الافتراضي "deuteranomaly") |
| `duotone` | ثنائي اللون | `shadow` (hex)، `highlight` (hex)، `intensity` (0-100) |
| `pixelate` | تبكسل | `blockSize` (2-128)، `region` ({left, top, width, height} للتبكسل الجزئي) |
| `vignette` | تظليل حواف | `strength` (0.1-1)، `color` (hex)، `radius`، `softness`، `roundness`، `centerX`، `centerY` |

### أدوات الذكاء الاصطناعي {#ai-tools}

تعمل جميع أدوات الذكاء الاصطناعي على عتادك: على المعالج المركزي CPU افتراضيًا، أو على NVIDIA CUDA عند توفر وحدة معالجة رسوميات NVIDIA مدعومة. لا يُدعم حاليًا تسريع وحدات معالجة الرسوميات المدمجة Intel/AMD iGPU عبر VA-API أو Quick Sync أو OpenCL لاستدلال الذكاء الاصطناعي. لا حاجة إلى اتصال بالإنترنت.

| معرّف الأداة | الاسم | نموذج الذكاء الاصطناعي | الإعدادات الرئيسية |
|---------|------|---------|-------------|
| `remove-background` | إزالة الخلفية | rembg (BiRefNet / U2-Net) | `model`، `backgroundType` (transparent/color/gradient/blur/image)، `backgroundColor`، `gradientColor1`، `gradientColor2`، `gradientAngle`، `blurEnabled`، `blurIntensity`، `shadowEnabled`، `shadowOpacity` |
| `upscale` | تكبير الصورة | RealESRGAN | `scale` (2/4)، `model`، `faceEnhance`، `denoise`، `format`، `quality` |
| `erase-object` | ممحاة الكائنات | LaMa (ONNX) | يُرسل القناع كجزء الملف الثاني (اسم الحقل `mask`)، `format`، `quality` |
| `ocr` | OCR / استخراج النص | PaddleOCR / Tesseract | `quality` (fast/balanced/best)، `language`، `enhance` |
| `blur-faces` | تمويه الوجه / معلومات التعريف الشخصية | MediaPipe | `blurRadius`، `sensitivity` |
| `smart-crop` | قص ذكي | MediaPipe + Sharp | `mode` (subject/face/trim)، `strategy` (attention/entropy)، `width`، `height`، `padding`، `facePreset` (closeup/head-shoulders/upper-body/half-body)، `sensitivity`، `threshold`، `padToSquare`، `padColor`، `targetSize`، `quality` |
| `image-enhancement` | تحسين الصورة | قائم على التحليل | `mode` (auto/exposure/contrast/color/sharpness)، `strength` |
| `enhance-faces` | تحسين الوجه | GFPGAN / CodeFormer | `model` (gfpgan/codeformer)، `strength`، `sensitivity`، `centerFace` |
| `colorize` | التلوين بالذكاء الاصطناعي | DDColor | `intensity`، `model` |
| `noise-removal` | إزالة الضوضاء | إزالة ضوضاء متدرجة | `tier` (quick/balanced/quality/maximum)، `strength`، `detailPreservation`، `colorNoise`، `format`، `quality` |
| `red-eye-removal` | إزالة العين الحمراء | معالم الوجه + تحليل اللون | `sensitivity`، `strength` |
| `restore-photo` | ترميم الصور | خط معالجة متعدد الخطوات | `mode` (auto/light/heavy)، `scratchRemoval`، `faceEnhancement`، `fidelity`، `denoise`، `denoiseStrength`، `colorize` |
| `passport-photo` | صورة جواز السفر | معالم MediaPipe | تدفق ثنائي المرحلة. يستخدم التحليل multipart `file`؛ ويستخدم الإنشاء JSON مع `countryCode` و`bgColor` و`printLayout` (none/4x6/a4)، ومعالم، وأبعاد الصورة |
| `content-aware-resize` | تغيير الحجم المدرك للمحتوى | نحت اللُّحمات (caire) | `width`، `height`، `protectFaces`، `blurRadius`، `sobelThreshold`، `square` |
| `transparency-fixer` | مُصلِح شفافية PNG | BiRefNet HR-matting | `defringe` (0-100)، `outputFormat` (png/webp) |
| `background-replace` | استبدال الخلفية | rembg (BiRefNet) | `backgroundType` (color/gradient)، `color` (hex)، `gradientColor1`، `gradientColor2`، `gradientAngle`، `feather` (0-20)، `format` (png/webp) |
| `blur-background` | تمويه الخلفية | rembg (BiRefNet) | `intensity` (1-100)، `feather` (0-20)، `format` (png/webp) |
| `ai-canvas-expand` | توسيع اللوحة بالذكاء الاصطناعي | LaMa (رسم خارجي) | `extendTop`، `extendRight`، `extendBottom`، `extendLeft` (px)، `tier` (fast/balanced/high)، `format`، `quality` |

### العلامة المائية والطبقة الفوقية {#watermark-overlay}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `watermark-text` | علامة مائية نصية | `text`، `font`، `fontSize`، `color`، `opacity`، `position`، `rotation`، `tile` |
| `watermark-image` | علامة مائية بصورة | `opacity`، `position`، `scale` - الملف الثاني هو العلامة المائية |
| `text-overlay` | طبقة نص فوقية | `text`، `font`، `fontSize`، `color`، `x`، `y`، `background`، `padding`، `borderRadius` |
| `compose` | تركيب الصور | `x`، `y`، `opacity`، `blend` - يُطبَّق الملف الثاني كطبقة في الأعلى |
| `meme-generator` | مُولِّد الميمات | `templateId`، `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side)، `textBoxes` ([{id, text}])، `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto)، `fontSize`، `textColor`، `strokeColor`، `textAlign`، `allCaps`. يدعم وضع القالب (نص JSON مع `templateId`) أو وضع الصورة المخصصة (multipart مع ملف). |

### الأدوات المساعدة {#utilities}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `info` | معلومات الصورة | - (يُرجع العرض والارتفاع والصيغة والحجم والقنوات وhasAlpha وDPI وEXIF) |
| `compare` | مقارنة الصور | `mode` (side-by-side/overlay/diff)، `diffThreshold` - الملف الثاني هو هدف المقارنة |
| `find-duplicates` | العثور على التكرارات | `threshold` (مسافة التجزئة الإدراكية، الافتراضي 8) - متعدد الملفات |
| `color-palette` | لوحة الألوان | `count` (عدد الألوان السائدة)، `format` (hex/rgb) |
| `qr-generate` | مُولِّد رمز QR | `data`، `size`، `margin`، `colorDark`، `colorLight`، `errorCorrectionLevel`، `dotStyle`، `cornerStyle`، `logo` (ملف اختياري) |
| `barcode-read` | قارئ الباركود | - (يكتشف تلقائيًا QR وEAN وCode128 وDataMatrix وغيرها) |
| `image-to-base64` | صورة إلى Base64 | `format` (data-uri/plain)، `mimeType` |
| `html-to-image` | HTML إلى صورة | `url`، `format` (png/jpg/webp)، `quality`، `fullPage`، `devicePreset` (desktop/tablet/mobile/custom)، `viewportWidth`، `viewportHeight` |
| `histogram` | المخطط البياني | `scale` (linear/log) - يُرجع مخطط رسم بياني RGB + إحصائيات لكل قناة |
| `lqip-placeholder` | عنصر نائب LQIP | `width` (4-64)، `blur`، `strategy` (blur/pixelate/solid)، `format` (webp/png/jpeg)، `quality` |
| `barcode-generate` | مُولِّد الباركود | `text`، `type` (code128/ean13/upca/code39/itf14/datamatrix)، `scale` (1-8)، `includeText` (منطقي). نص JSON، دون رفع ملف. |

### التخطيط والتركيب {#layout-composition}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `collage` | كولاج / شبكة | `template` (أكثر من 25 تخطيطًا)، `gap`، `backgroundColor`، `borderRadius` - متعدد الملفات |
| `stitch` | خياطة / دمج | `direction` (horizontal/vertical/grid)، `gap`، `backgroundColor`، `alignment` - متعدد الملفات |
| `split` | تقسيم الصورة | `mode` (grid/rows/cols)، `rows`، `cols`، `tileWidth`، `tileHeight` |
| `border` | حدود وإطار | `width`، `color`، `style` (solid/gradient/pattern)، `borderRadius`، `padding`، `shadow` |
| `beautify` | تجميل لقطة الشاشة | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent)، `gradientStops`، `padding`، `borderRadius`، `shadowPreset`، `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...)، `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt)، `watermarkText`، `outputFormat` |
| `circle-crop` | قص دائري | `zoom` (1-5)، `offsetX`، `offsetY`، `borderWidth`، `borderColor`، `background` (transparent/hex)، `outputSize` |
| `image-pad` | تبطين الصورة | `target` (16:9/9:16/1:1/4:3/3:4/custom)، `ratioW`، `ratioH`، `background` (color/transparent/blur)، `color` (hex)، `padding` (0-50%) |
| `sprite-sheet` | ورقة العفاريت | `columns` (1-16)، `padding`، `background` (hex)، `format` (png/webp/jpeg)، `quality` - متعدد الملفات (2-64 صورة) |

### الصيغة والتحويل {#format-conversion}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `svg-to-raster` | SVG إلى صورة نقطية | `format` (png/jpeg/webp/avif/tiff/gif/heif)، `width`، `height`، `scale`، `dpi`، `background` |
| `vectorize` | صورة إلى SVG | `colorMode` (bw/color)، `threshold`، `colorPrecision`، `filterSpeckle`، `pathMode` (none/polygon/spline) |
| `gif-tools` | أدوات GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text)، معاملات خاصة بالإجراء |
| `gif-webp` | محوِّل GIF/WebP | `quality` (1-100)، `lossless` (منطقي)، `resizePercent` (10-100) |

### أدوات الفيديو {#video-tools}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `convert-video` | تحويل الفيديو | `format` (mp4/mov/webm/avi/mkv)، `quality` (high/balanced/small) |
| `compress-video` | ضغط الفيديو | `quality` (light/balanced/strong)، `resolution` (original/1080p/720p/480p) |
| `trim-video` | قص الفيديو | `startS`، `endS`، `precise` (منطقي، قص دقيق بالإطار) |
| `mute-video` | كتم الفيديو | - |
| `video-to-gif` | فيديو إلى GIF | `fps` (1-30)، `width`، `startS`، `durationS` (بحد أقصى 60 ثانية) |
| `resize-video` | تغيير حجم الفيديو | `width`، `height`، `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | قص إطار الفيديو | `width`، `height`، `x`، `y` |
| `rotate-video` | تدوير الفيديو | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | تغيير FPS | `fps` (1-120) |
| `video-color` | لون الفيديو | `brightness`، `contrast`، `saturation`، `gamma` |
| `video-speed` | سرعة الفيديو | `factor` (0.25-4)، `keepPitch` (منطقي) |
| `reverse-video` | عكس الفيديو | - (بحد أقصى 5 دقائق) |
| `video-loudnorm` | تسوية الصوت | - (EBU R128) |
| `aspect-pad` | تبطين النسبة | `target` (16:9/9:16/1:1/4:3/3:4)، `color` (hex) |
| `blur-pad` | تبطين بالتمويه | `target` (16:9/9:16/1:1/4:3/3:4)، `blur` (2-50) |
| `watermark-video` | علامة مائية على الفيديو | `text`، `position`، `fontSize`، `opacity`، `color` |
| `stabilize-video` | تثبيت الفيديو | `smoothing` (5-60، بالإطارات) |
| `gif-to-video` | GIF إلى فيديو | `format` (mp4/webm/mov) |
| `video-to-webp` | فيديو إلى WebP | `fps`، `width`، `quality`، `loop` (منطقي) |
| `video-to-frames` | فيديو إلى إطارات | `mode` (all/nth/timestamps)، `n`، `timestamps`، `format` (png/jpg) |
| `merge-videos` | دمج مقاطع الفيديو | - (متعدد الملفات، مُطبَّق على دقة الفيديو الأول) |
| `replace-audio` | استبدال الصوت | - (فيديو + ملف صوتي، ملفان) |
| `burn-subtitles` | حرق الترجمات | `fontSize` (8-72) - فيديو + ملف ترجمة |
| `embed-subtitles` | تضمين الترجمات | `language` (رمز ISO 639-2/B) - فيديو + ملف ترجمة |
| `extract-subtitles` | استخراج الترجمات | - (يُخرج SRT) |
| `images-to-video` | صور إلى فيديو | `secondsPerImage` (0.5-10)، `resolution` (1080p/720p/square)، `fps` - متعدد الملفات |
| `video-metadata` | تنظيف البيانات الوصفية للفيديو | - |
| `auto-subtitles` | ترجمات تلقائية (ذكاء اصطناعي) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi)، `format` (srt/vtt) |
| `extract-audio` | استخراج الصوت | `format` (mp3/wav/m4a/ogg) |

### أدوات الصوت {#audio-tools}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `convert-audio` | تحويل الصوت | `format` (mp3/wav/ogg/flac/m4a)، `bitrateKbps` (32-320) |
| `trim-audio` | قص الصوت | `startS`، `endS` |
| `volume-adjust` | ضبط مستوى الصوت | `gainDb` (-30 إلى 30) |
| `normalize-audio` | تسوية الصوت | - (EBU R128، -16 LUFS) |
| `fade-audio` | تلاشي الصوت | `fadeInS` (0-30)، `fadeOutS` (0-30) |
| `reverse-audio` | عكس الصوت | - |
| `audio-speed` | سرعة الصوت | `factor` (0.25-4) |
| `pitch-shift` | إزاحة النغمة | `semitones` (-12 إلى 12) |
| `audio-channels` | قنوات الصوت | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | إزالة الصمت | `thresholdDb` (-80 إلى -20)، `minSilenceS` (0.1-5) |
| `noise-reduction` | تقليل الضوضاء | `strength` (light/medium/strong) |
| `merge-audio` | دمج الصوت | `format` (mp3/wav/flac/m4a) - متعدد الملفات |
| `split-audio` | تقسيم الصوت | `mode` (time/parts/silence)، `segmentS`، `parts`، `thresholdDb`، `minSilenceS` |
| `ringtone-maker` | صانع النغمات | `startS`، `durationS` (1-30) |
| `waveform-image` | صورة الموجة الصوتية | `width`، `height`، `color` (hex) |
| `audio-metadata` | البيانات الوصفية للصوت | `strip` (منطقي)، `title`، `artist`، `album` |
| `transcribe-audio` | نسخ الصوت (ذكاء اصطناعي) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi)، `outputFormat` (txt/srt/vtt) |

### أدوات المستندات {#document-tools}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `merge-pdf` | دمج ملفات PDF | - (متعدد الملفات، حتى 20 ملف PDF) |
| `split-pdf` | تقسيم PDF | `mode` (range/every)، `range`، `everyN` (1-500) |
| `compress-pdf` | ضغط PDF | `mode` (quality/targetSize)، `quality` (1-100)، `targetSizeKb` |
| `rotate-pdf` | تدوير PDF | `angle` (90/180/270)، `range` (نطاق الصفحات) |
| `extract-pages` | استخراج الصفحات | `range` (صيغة qpdf، مثال "1-5,8,10-z") |
| `remove-pages` | إزالة الصفحات | `pages` (نطاق qpdf للإزالة) |
| `organize-pdf` | تنظيم PDF | `order` (ترتيب صفحات qpdf، مثال "3,1,2,5-z") |
| `protect-pdf` | حماية PDF | `userPassword`، `ownerPassword` (AES-256) |
| `unlock-pdf` | إلغاء قفل PDF | `password` |
| `repair-pdf` | إصلاح PDF | - |
| `linearize-pdf` | تحسين PDF للويب | - (تحسين خطي للعرض السريع على الويب) |
| `grayscale-pdf` | PDF بتدرج رمادي | - |
| `pdfa-convert` | التحويل إلى PDF/A | - (PDF/A-2 للأرشفة) |
| `crop-pdf` | قص PDF | `margin` (0-2000 نقطة) |
| `nup-pdf` | PDF N-up | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | كتيّب PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | علامة مائية على PDF | `text`، `position`، `fontSize`، `opacity`، `rotation` |
| `pdf-page-numbers` | أرقام صفحات PDF | `position` (bl/bc/br/tl/tc/tr)، `fontSize` |
| `flatten-pdf` | تسطيح PDF | - (يدمج النماذج والتعليقات التوضيحية) |
| `redact-pdf` | تنقيح PDF | `terms` (string[])، `caseSensitive` (منطقي) |
| `sign-pdf` | توقيع PDF | مسار multipart مخصص مع PDF `file`، وملفات التوقيع `sig0`، و`sig1`، ومصفوفة JSON `placements` |
| `pdf-to-text` | PDF إلى نص | - |
| `pdf-to-word` | PDF إلى Word | - |
| `pdf-metadata` | البيانات الوصفية لـ PDF | `title`، `author`، `subject`، `keywords` |
| `convert-document` | تحويل مستند | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | تحويل عرض تقديمي | `format` (pptx/odp) |
| `convert-spreadsheet` | تحويل جدول بيانات | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel إلى PDF | - |
| `word-to-pdf` | Word إلى PDF | - |
| `powerpoint-to-pdf` | PowerPoint إلى PDF | - |
| `html-to-pdf` | HTML إلى PDF | - (الموارد البعيدة مُعطَّلة) |
| `markdown-to-docx` | Markdown إلى Word | - |
| `markdown-to-html` | Markdown إلى HTML | - |
| `markdown-to-pdf` | Markdown إلى PDF | - (الموارد البعيدة مُعطَّلة) |
| `epub-convert` | تحويل EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | التحويل إلى EPUB | - (يقبل .docx و.md و.html و.txt) |
| `ocr-pdf` | PDF OCR (ذكاء اصطناعي) | `quality` (fast/balanced/best)، `language` (auto/en/de/fr/es/zh/ja/ko)، `pages` |
| `pdf-to-image` | PDF إلى صورة | `pages` (all/range)، `format`، `dpi`، `quality` |
| `pdf-to-jpg` | PDF إلى JPG | `pages`، `dpi`، `quality`، `colorMode` |
| `pdf-to-png` | PDF إلى PNG | `pages`، `dpi`، `quality`، `colorMode` |
| `pdf-to-tiff` | PDF إلى TIFF | `pages`، `dpi`، `quality`، `colorMode` |

### أدوات الملفات {#file-tools}

| معرّف الأداة | الاسم | الإعدادات الرئيسية |
|---------|------|-------------|
| `chart-maker` | صانع المخططات | `kind` (bar/line/pie)، `title`، `width`، `height` |
| `csv-excel` | CSV إلى Excel | `sheet` (رقم ورقة العمل لإدخال XLSX) - ثنائي الاتجاه |
| `csv-json` | CSV إلى JSON | `pretty` (منطقي) - ثنائي الاتجاه |
| `json-xml` | JSON إلى XML | `pretty` (منطقي) - ثنائي الاتجاه |
| `split-csv` | تقسيم CSV | `rowsPerFile` (1-1000000)، `keepHeader` (منطقي) |
| `merge-csvs` | دمج ملفات CSV | - (متعدد الملفات، أعمدة متطابقة) |
| `yaml-json` | YAML / JSON | - (ثنائي الاتجاه) |
| `xml-to-csv` | XML إلى CSV | - (يعثر تلقائيًا على العناصر المتكررة) |
| `excel-to-csv` | Excel إلى CSV | إعداد تحويل جاهز مخصص مدعوم بـ `convert-spreadsheet` |
| `create-zip` | إنشاء ZIP | - (متعدد الملفات، 2-50 ملفًا) |
| `extract-zip` | استخراج ZIP | - (محمي من قنابل الضغط) |

### HTML إلى صورة {#html-to-image}

التقاط صفحة ويب كصورة. على خلاف الأدوات الأخرى، تقبل نقطة النهاية هذه `application/json` بدلًا من بيانات نموذج multipart (لا حاجة لرفع ملف).

**نقطة النهاية:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `url` | سلسلة | (مطلوب) | عنوان URL للالتقاط (http/https فقط) |
| `format` | سلسلة | `"png"` | صيغة الإخراج: `jpg`، `png`، `webp` |
| `quality` | رقم | `90` | الجودة 1-100 (JPG/WebP فقط) |
| `fullPage` | منطقي | `false` | التقاط الصفحة القابلة للتمرير بالكامل |
| `devicePreset` | سلسلة | `"desktop"` | `desktop`، `tablet`، `mobile`، `custom` |
| `viewportWidth` | رقم | `1280` | عرض إطار عرض مخصص 320-3840 |
| `viewportHeight` | رقم | `720` | ارتفاع إطار عرض مخصص 320-2160 |

**مثال:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**الاستجابة:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### المسارات الفرعية للأدوات {#tool-sub-routes}

تُتيح بعض الأدوات نقاط نهاية إضافية إلى جانب `POST /api/v1/tools/<section>/<toolId>` القياسية:

| الطريقة | المسار | الوصف |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | إرجاع معرّفات الأدوات الشائعة، مع الرجوع إلى قائمة افتراضية منسّقة عندما تكون بيانات الاستخدام قليلة |
| `POST` | `/api/v1/tools/image/remove-background/effects` | تطبيق تأثيرات الخلفية (لون/تدرج/تمويه/ظل) دون إعادة تشغيل الذكاء الاصطناعي. يستخدم القناع المخزَّن مؤقتًا من عملية الإزالة الأولية. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | قراءة البيانات الوصفية EXIF/IPTC/XMP الموجودة من صورة |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | فحص حقول البيانات الوصفية قبل إزالتها |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | المرحلة 1: كشف الوجه بالذكاء الاصطناعي + إزالة الخلفية. يُرجع معالم الوجه والبيانات المخزَّنة مؤقتًا. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | المرحلة 2: القص وتغيير الحجم والتبليط باستخدام التحليل المخزَّن مؤقتًا. دون إعادة تشغيل الذكاء الاصطناعي. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | الحصول على البيانات الوصفية لـ GIF (عدد الإطارات، الأبعاد، المدة) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | الحصول على البيانات الوصفية لـ PDF (عدد الصفحات، الأبعاد) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | إنشاء معاينة لصفحة PDF محددة |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | الحصول على البيانات الوصفية لـ PDF للإعداد الجاهز المخصص لـ JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | إنشاء معاينة صفحة PDF بإعداد JPG الجاهز |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | الحصول على البيانات الوصفية لـ PDF للإعداد الجاهز المخصص لـ PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | إنشاء معاينة صفحة PDF بإعداد PNG الجاهز |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | الحصول على البيانات الوصفية لـ PDF للإعداد الجاهز المخصص لـ TIFF |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | إنشاء معاينة صفحة PDF بإعداد TIFF الجاهز |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | تحويل دفعي لعدة ملفات SVG إلى صور نقطية |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | تحليل جودة الصورة وإرجاع توصيات التحسين |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | معاينة خفيفة لضبط المعاملات المباشر. يُرجع صورة محسَّنة مع ترويسات الحجم. |

## المعالجة الدفعية {#batch-processing}

تطبيق أداة عامة مُفعَّلة للدفعات على عدة ملفات دفعةً واحدة. يُرجع أرشيف ZIP. تستخدم المسارات المخصصة متعددة الملفات أو متعددة الخطوات، مثل توقيع PDF وPDF OCR ومسارات الإعدادات الجاهزة PDF إلى صورة، عقد نقطة نهاية خاصة بها بدلًا من مسار `/batch` العام.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

يتحكم في التزامن `CONCURRENT_JOBS` (الافتراضي: يُكتشف تلقائيًا من أنوية المعالج). يحدّ `MAX_BATCH_SIZE` عدد الملفات لكل دفعة (الافتراضي: 100؛ اضبطه على 0 لغير محدود).

## خطوط المعالجة {#pipelines}

### تنفيذ خط معالجة {#execute-a-pipeline}

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

ناتج كل خطوة هو مدخل الخطوة التالية. تسمح خطوط المعالجة بـ 20 خطوة افتراضيًا، قابلة للتهيئة عبر `MAX_PIPELINE_STEPS`. اضبط `MAX_PIPELINE_STEPS=0` لإزالة الحد.

### حفظ خطوط المعالجة وإدارتها {#save-and-manage-pipelines}

| الطريقة | المسار | الوصف |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | حفظ خط معالجة مُسمّى (`name`، `description`، `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | سرد خطوط المعالجة المحفوظة (يرى المسؤولون الكل؛ ويرى المستخدمون ما يخصهم) |
| `DELETE` | `/api/v1/pipeline/:id` | حذف (المالك أو المسؤول) |
| `GET` | `/api/v1/pipeline/tools` | سرد معرّفات الأدوات الصالحة لخطوات خط المعالجة |

## تتبع التقدم {#progress-tracking}

تُصدر المهام طويلة التشغيل والأدوات المُدرجة في طابور والمهام الدفعية وخطوط المعالجة تقدمًا لحظيًا عبر الأحداث المُرسَلة من الخادم Server-Sent Events. تدفق التقدم عام ومُفهرَس بمعرّف المهمة، لذا لا يحتاج العملاء إلى إرسال ترويسة Authorization لقراءته.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

صيغة الحدث:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

يمكنك طلب إلغاء مهمة مُدرجة في طابور أو قيد التشغيل باستخدام `POST /api/v1/jobs/:jobId/cancel`. الاستجابة هي `{"canceled":true|false}`.

## مكتبة الملفات {#file-library}

تخزين ملفات دائم مع سجل الإصدارات.

| الطريقة | المسار | الوصف |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | رفع الملفات إلى مساحة العمل (معالجة مؤقتة) |
| `POST` | `/api/v1/files/upload` | رفع الملفات إلى مكتبة الملفات الدائمة |
| `POST` | `/api/v1/files/save-result` | حفظ نتيجة معالجة أداة كإصدار ملف جديد |
| `GET` | `/api/v1/files` | سرد الملفات المحفوظة (مُقسَّم إلى صفحات، مع البحث) |
| `GET` | `/api/v1/files/:id` | الحصول على البيانات الوصفية للملف + سلسلة الإصدارات |
| `GET` | `/api/v1/files/:id/download` | تنزيل الملف |
| `GET` | `/api/v1/files/:id/thumbnail` | الحصول على صورة مصغرة JPEG بحجم 300 بكسل |
| `DELETE` | `/api/v1/files` | حذف جماعي للملفات وسلاسل إصداراتها (النص: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | جلب عناوين URL بعيدة إلى مساحة العمل للاستيراد المستند إلى URL |
| `POST` | `/api/v1/preview` | إنشاء معاينة WebP متوافقة مع المتصفح (لصيغ HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | بث معاينة مخزَّنة مؤقتًا أو مُنشأة ومتوافقة مع المتصفح لملف PDF أو مستند Office أو فيديو أو صوت محفوظ |
| `POST` | `/api/v1/preview/generate` | إنشاء معاينة MP4 أو MP3 عند الطلب لملف وسائط مرفوع دون حفظه أولًا |
| `GET` | `/api/v1/download/:jobId/:filename` | تنزيل ملف مُعالَج من مساحة عمل |

لحفظ نتيجة أداة تلقائيًا في المكتبة، ضمّن `fileId` كحقل نموذج multipart يشير إلى ملف موجود في المكتبة. ستُحفظ النتيجة المُعالَجة كإصدار جديد.

## إدارة مفاتيح API {#api-key-management}

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | مصادَق | إنشاء مفتاح جديد - يُعرض مرة واحدة |
| `GET` | `/api/v1/api-keys` | مصادَق | سرد المفاتيح (الاسم، المعرّف، lastUsedAt - لا المفتاح الخام) |
| `DELETE` | `/api/v1/api-keys/:id` | مصادَق | حذف المفتاح |

## الفرق {#teams}

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | مسؤول (`teams:manage`) | سرد الفرق |
| `POST` | `/api/v1/teams` | مسؤول (`teams:manage`) | إنشاء فريق |
| `PUT` | `/api/v1/teams/:id` | مسؤول (`teams:manage`) | إعادة تسمية فريق |
| `DELETE` | `/api/v1/teams/:id` | مسؤول (`teams:manage`) | حذف فريق (لا يمكن حذف الفريق الافتراضي أو الفرق التي بها أعضاء) |

## الإعدادات {#settings}

تهيئة مفتاح-قيمة أثناء التشغيل (يقرؤها أي مستخدم مصادَق، ويكتبها المسؤول فقط).

| الطريقة | المسار | الوصف |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | الحصول على جميع الإعدادات |
| `PUT` | `/api/v1/settings` | تحديث الإعدادات جماعيًا (نص JSON مع أزواج مفتاح-قيمة) |
| `GET` | `/api/v1/settings/:key` | الحصول على إعداد محدد بالمفتاح |

المفاتيح المعروفة: `disabledTools` (مصفوفة JSON من معرّفات الأدوات)، `enableExperimentalTools` (سلسلة منطقية)، `loginAttemptLimit` (رقم).

## التفضيلات {#preferences}

تفضيلات كل مستخدم منفصلة عن إعدادات مثيل الخادم. يمكن لأي مستخدم مصادَق قراءة خريطة تفضيلاته الخاصة وتحديثها.

| الطريقة | المسار | الوصف |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | الحصول على تفضيلات المستخدم الحالي كـ `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | إدراج أو تحديث مفتاح تفضيل واحد أو أكثر للمستخدم الحالي |

## الأدوار {#roles}

إدارة أدوار مخصصة بأذونات دقيقة.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | مسؤول (`audit:read`) | سرد جميع الأدوار مع أعداد المستخدمين |
| `POST` | `/api/v1/roles` | مسؤول (`security:manage`) | إنشاء دور مخصص (`name`، `description`، `permissions`) |
| `PUT` | `/api/v1/roles/:id` | مسؤول (`security:manage`) | تحديث دور مخصص (لا يمكن تعديل الأدوار المدمجة) |
| `DELETE` | `/api/v1/roles/:id` | مسؤول (`security:manage`) | حذف دور مخصص (لا يمكن حذف الأدوار المدمجة؛ يعود المستخدمون المتأثرون إلى الدور `user`) |

الأذونات المتاحة (17): `tools:use`، `files:own`، `files:all`، `apikeys:own`، `apikeys:all`، `pipelines:own`، `pipelines:all`، `settings:read`، `settings:write`، `users:manage`، `teams:manage`، `features:manage`، `system:health`، `audit:read`، `compliance:manage`، `webhooks:manage`، `security:manage`.

## سجل التدقيق {#audit-log}

نقطة نهاية للمسؤول فقط لمراجعة الإجراءات المتعلقة بالأمان.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | مسؤول (`audit:read`) | سجل تدقيق مُقسَّم إلى صفحات مع مرشحات اختيارية |

معاملات الاستعلام:

| المعامل | الوصف |
|-----------|-------------|
| `page` | رقم الصفحة (الافتراضي: 1) |
| `limit` | المدخلات لكل صفحة (الافتراضي: 50، الحد الأقصى: 100) |
| `action` | التصفية حسب نوع الإجراء (مثال `ROLE_CREATED`، `ROLE_DELETED`) |
| `ip` | التصفية حسب عنوان IP المصدر |
| `from` | تصفية المدخلات بعد تاريخ ISO 8601 هذا |
| `to` | تصفية المدخلات قبل تاريخ ISO 8601 هذا |

## التحليلات {#analytics}

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | عام | الحصول على تهيئة التحليلات الفعلية (مفتاح PostHog، DSN لـ Sentry، معدل أخذ العينات). تكون المفاتيح وDSN ومعرّف مثيل الخادم فارغة عند إيقاف التحليلات، سواءً من التضمين وقت الترجمة أو من إعداد `analyticsEnabled` لمثيل الخادم. |
| `POST` | `/api/v1/feedback` | مصادَق | إرسال ملاحظات المستخدم الصريحة إلى مشروع PostHog المهيَّأ كـ `feedback_submitted`. يحترم المسار بوابة التحليلات، ويحدّ معدل الإرسال، ويزيل حقول الاتصال ما لم يكن `contactOk` صحيحًا، ولا يقبل أبدًا محتويات الملفات أو أسماء الملفات أو مسارات الرفع أو نص الخطأ الخاص الخام. عند تعطيل التحليلات، يُرجع `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | مسؤول (`settings:write`) | تعيين إلغاء الاشتراك على مستوى مثيل الخادم. أرسل نص JSON `{ "analyticsEnabled": "false" }` لإيقاف التحليلات للجميع، أو `"true"` لإعادة تشغيلها. |

## الميزات / حزم الذكاء الاصطناعي {#features-ai-bundles}

إدارة حزم ميزات الذكاء الاصطناعي (تثبيت/إلغاء تثبيت حزم نماذج الذكاء الاصطناعي في بيئة Docker). فضّل نقطة نهاية التثبيت على مستوى الأداة عند تفعيل أداة من أتمتة مخصصة: تحتاج بعض أدوات الذكاء الاصطناعي إلى أكثر من حزمة مشتركة، وتتخطى هذه النقطة الحزم المثبَّتة مسبقًا وتُدرج المفقودة فقط في الطابور.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | مصادَق | سرد جميع حزم الميزات وحالة تثبيتها |
| `POST` | `/api/v1/admin/features/:bundleId/install` | مسؤول (`features:manage`) | تثبيت حزمة ميزة (غير متزامن، يُرجع `jobId` لتتبع التقدم) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | مسؤول (`features:manage`) | تثبيت كل حزمة تتطلبها أداة؛ يُرجع حالة مُدرَج في الطابور/متخطى لكل حزمة |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | مسؤول (`features:manage`) | إلغاء تثبيت حزمة ميزة وتنظيف ملفات النموذج |
| `GET` | `/api/v1/admin/features/disk-usage` | مسؤول (`features:manage`) | الحصول على إجمالي استخدام القرص لنماذج الذكاء الاصطناعي |
| `POST` | `/api/v1/admin/features/import` | مسؤول (`features:manage`) | استيراد أرشيف حزمة ذكاء اصطناعي دون اتصال |

## عمليات الإدارة {#admin-operations}

نقاط نهاية تشغيلية للرصد والدعم وإعداد تقارير الاستخدام وحالة النسخ الاحتياطي.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | مسؤول (`settings:write`) | قراءة مستوى سجل التشغيل الحالي |
| `POST` | `/api/v1/admin/log-level` | مسؤول (`settings:write`) | تغيير مستوى سجل التشغيل (`fatal`، `error`، `warn`، `info`، `debug`، `trace`، أو `silent`) |
| `GET` | `/api/v1/metrics` | مسؤول (`system:health`) | مقاييس Prometheus بصيغة نصية |
| `GET` | `/api/v1/admin/support-bundle` | مسؤول (`system:health`) | تنزيل حزمة دعم تشخيصية ZIP مُنقَّحة |
| `GET` | `/api/v1/admin/usage` | مسؤول (`audit:read`) | بيانات لوحة معلومات الاستخدام، مع معامل استعلام `days` اختياري |
| `GET` | `/api/v1/admin/backup-status` | مسؤول (`system:health`) | قراءة البيانات الوصفية لآخر نسخة احتياطية وحالة حداثتها |
| `POST` | `/api/v1/admin/backup-status` | مسؤول (`system:health`) | تسجيل نسخة احتياطية مكتملة (`type`، `sizeBytes` اختياري، `notes` اختياري) |

## واجهات برمجة تطبيقات المؤسسات {#enterprise-apis}

هذه المسارات مقيَّدة بالترخيص عبر ميزة المؤسسة المرتبطة بها. وما زالت تتطلب إذن SnapOtter المُدرَج.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | مسؤول (`audit:read`) | تصدير مدخلات التدقيق كـ JSON أو CSV مع مرشحات |
| `GET` | `/api/v1/enterprise/config/export` | مسؤول (`system:health`) | تصدير تهيئة مثيل الخادم المُنقَّحة والأدوار المخصصة والفرق |
| `POST` | `/api/v1/enterprise/config/import` | مسؤول (`system:health`) | استيراد التهيئة، مع تشغيل تجريبي اختياري |
| `GET` | `/api/v1/enterprise/ip-allowlist` | مسؤول (`security:manage`) | قراءة قائمة CIDR المسموح بها المهيَّأة |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | مسؤول (`security:manage`) | تحديث قائمة CIDR المسموح بها مع منع الإقفال الذاتي |
| `GET` | `/api/v1/enterprise/legal-hold` | مسؤول (`compliance:manage`) | سرد الحجوزات القانونية للمستخدمين والفرق |
| `PUT` | `/api/v1/enterprise/legal-hold` | مسؤول (`compliance:manage`) | تطبيق أو رفع حجز قانوني على مستخدم أو فريق |
| `POST` | `/api/v1/enterprise/scim/token` | مسؤول (`users:manage`) | إنشاء رمز حامل SCIM، يُرجع مرة واحدة |
| `DELETE` | `/api/v1/enterprise/scim/token` | مسؤول (`users:manage`) | إبطال رمز حامل SCIM الحالي |
| `GET` | `/api/v1/enterprise/siem/config` | مسؤول (`webhooks:manage`) | قراءة تهيئة إعادة توجيه SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | مسؤول (`webhooks:manage`) | تحديث تهيئة إعادة توجيه SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | مسؤول (`webhooks:manage`) | سرد وجهات الويب هوك |
| `POST` | `/api/v1/enterprise/webhooks` | مسؤول (`webhooks:manage`) | إنشاء وجهة ويب هوك |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | مسؤول (`webhooks:manage`) | تحديث وجهة ويب هوك |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | مسؤول (`webhooks:manage`) | حذف وجهة ويب هوك |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | مسؤول (`webhooks:manage`) | إرسال حمولة ويب هوك تجريبية |
| `POST` | `/api/v1/enterprise/users/:id/export` | مسؤول (`compliance:manage`) | بدء مهمة تصدير مستخدم بموجب GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | مسؤول (`compliance:manage`) | قراءة حالة تصدير GDPR ورابط التنزيل |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | مسؤول (`compliance:manage`) | تطهير بيانات مستخدم نهائيًا بعد التأكيد |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | مسؤول (`compliance:manage`) | تطهير بيانات فريق نهائيًا بعد التأكيد |
| `GET` | `/api/v1/admin/version` | مسؤول (`system:health`) | قراءة البيانات الوصفية لإصدار التطبيق والبناء وNode والمخطط |
| `GET` | `/api/v1/admin/migrations/pending` | مسؤول (`system:health`) | مقارنة عمليات الترحيل المُحزَّمة بعمليات الترحيل المُطبَّقة |
| `GET` | `/api/v1/admin/upgrade-check` | مسؤول (`system:health`) | تشغيل فحوصات جاهزية الترقية |

### SCIM 2.0 {#scim-2-0}

نقاط نهاية اكتشاف SCIM عامة. تتطلب نقاط نهاية المستخدمين والمجموعات رمز حامل SCIM المُنشأ أعلاه.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | عام | قدرات خادم SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | عام | اكتشاف مخطط SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | عام | اكتشاف نوع مورد SCIM |
| `GET` | `/api/v1/scim/v2/Users` | رمز SCIM | سرد المستخدمين، مع مرشح SCIM اختياري |
| `POST` | `/api/v1/scim/v2/Users` | رمز SCIM | إنشاء مستخدم |
| `GET` | `/api/v1/scim/v2/Users/:id` | رمز SCIM | الحصول على مستخدم |
| `PUT` | `/api/v1/scim/v2/Users/:id` | رمز SCIM | استبدال مستخدم |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | رمز SCIM | إلغاء تفعيل مستخدم بشكل مرن |
| `GET` | `/api/v1/scim/v2/Groups` | رمز SCIM | سرد الفرق كمجموعات SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | رمز SCIM | إنشاء فريق |
| `GET` | `/api/v1/scim/v2/Groups/:id` | رمز SCIM | الحصول على فريق |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | رمز SCIM | استبدال فريق وعضوية مجموعة |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | رمز SCIM | حذف فريق |

## قوالب الميمات {#meme-templates}

واجهة برمجة تطبيقات داعمة لأداة مُولِّد الميمات.

| الطريقة | المسار | الوصول | الوصف |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | مصادَق | سرد جميع قوالب الميمات المتاحة مع مواضع مربعات النص |
| `GET` | `/api/v1/meme-templates/full/:filename` | مصادَق | تقديم صورة القالب بالحجم الكامل |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | مصادَق | تقديم صورة مصغرة للقالب |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | مصادَق | تقديم ملف الخط المستخدم في عرض نص الميم |

## استجابات الأخطاء {#error-responses}

تُرجع جميع الأخطاء JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| الحالة | المعنى |
|--------|---------|
| 400 | طلب غير صالح / فشل التحقق |
| 401 | غير مصادَق |
| 403 | أذونات غير كافية |
| 404 | المورد غير موجود |
| 413 | الملف كبير جدًا (راجع `MAX_UPLOAD_SIZE_MB`) |
| 422 | فشلت المعالجة بعد التحقق |
| 429 | تم تحديد المعدل (راجع `RATE_LIMIT_PER_MIN`) |
| 501 | حزمة ميزة الذكاء الاصطناعي المطلوبة غير مثبَّتة (`FEATURE_NOT_INSTALLED`) |
| 500 | خطأ داخلي في الخادم |
