---
description: "مرجع عمليات محرك الصور. جميع عمليات معالجة الصور القائمة على Sharp ومعاملاتها."
i18n_source_hash: 42febdf85fa8
i18n_provenance: human
i18n_output_hash: 0fa2a935472f
---

# محرك الصور {#image-engine}

تتولى حزمة `@snapotter/image-engine` جميع عمليات الصور غير المعتمدة على الذكاء الاصطناعي. وهي تغلّف [Sharp](https://sharp.pixelplumbing.com/) وتعمل بالكامل داخل العملية دون أي اعتماديات خارجية.

## العمليات {#operations}

### resize {#resize}

قياس صورة إلى أبعاد محددة أو بنسبة مئوية.

| المعامل | النوع | الوصف |
|---|---|---|
| `width` | number | العرض المستهدف بالبكسل |
| `height` | number | الارتفاع المستهدف بالبكسل |
| `fit` | string | `cover` أو `contain` أو `fill` أو `inside` أو `outside` |
| `withoutEnlargement` | boolean | إذا كان true، فلن يكبّر الصور الأصغر |
| `percentage` | number | القياس بنسبة مئوية بدلًا من الأبعاد المطلقة |

يمكنك تعيين `width` أو `height` أو كليهما. إذا عيّنت أحدهما فقط، فسيُحسب الآخر للحفاظ على نسبة العرض إلى الارتفاع.

### crop {#crop}

قص منطقة مستطيلة من الصورة.

| المعامل | النوع | الوصف |
|---|---|---|
| `left` | number | إزاحة X من الحافة اليسرى |
| `top` | number | إزاحة Y من الحافة العلوية |
| `width` | number | عرض منطقة الاقتصاص |
| `height` | number | ارتفاع منطقة الاقتصاص |
| `unit` | string | `px` (افتراضي) أو `percent` |

### rotate {#rotate}

تدوير الصورة بزاوية معينة.

| المعامل | النوع | الوصف |
|---|---|---|
| `angle` | number | زاوية التدوير بالدرجات (0-360) |
| `background` | string | لون التعبئة للمنطقة المكشوفة (افتراضي: `#000000`). ينطبق فقط على الزوايا غير المضاعفة لـ 90 درجة. |

### flip {#flip}

عكس الصورة أفقيًا أو رأسيًا أو كليهما. يجب أن يكون أحدهما على الأقل true.

| المعامل | النوع | الوصف |
|---|---|---|
| `horizontal` | boolean | العكس من اليسار إلى اليمين |
| `vertical` | boolean | العكس من الأعلى إلى الأسفل |

### convert {#convert}

تغيير صيغة الصورة.

| المعامل | النوع | الوصف |
|---|---|---|
| `format` | string | الصيغة المستهدفة: `jpg`، `png`، `webp`، `avif`، `tiff`، `gif`، `jxl`، `heic`، `heif`، `bmp`، `ico`، `jp2`، `qoi` |
| `quality` | number | جودة الضغط (1-100، تنطبق على الصيغ ذات الفقد) |

الصيغ السبع الأولى (من `jpg` إلى `jxl`) يرمّزها Sharp داخل العملية. أما الصيغ المتبقية فتستخدم مرمّزات خارجية في طبقة الـ API: `heic`/`heif` عبر heif-enc، و`bmp`/`ico` عبر ImageMagick، و`jp2` عبر opj_compress، و`qoi` عبر مرمّز TypeScript مضمّن.

### compress {#compress}

تقليل حجم الملف مع الحفاظ على الصيغة نفسها.

| المعامل | النوع | الوصف |
|---|---|---|
| `quality` | number | الجودة المستهدفة (1-100) |
| `targetSizeBytes` | number | حجم الملف المستهدف اختياريًا بالبايت |
| `format` | string | تجاوز الصيغة اختياريًا |

### strip-metadata {#strip-metadata}

إزالة بيانات EXIF وIPTC وXMP وICC الوصفية من الصورة. بدون أي معاملات (أو `stripAll: true`)، يزيل كل شيء. مرّر أعلامًا فردية للإزالة الانتقائية.

| المعامل | النوع | الوصف |
|---|---|---|
| `stripAll` | boolean | إزالة كل البيانات الوصفية (افتراضي عند عدم تعيين أي أعلام) |
| `stripExif` | boolean | إزالة بيانات EXIF (بما في ذلك GPS إذا لم يُعيَّن `stripGps` بشكل منفصل) |
| `stripGps` | boolean | إزالة بيانات موقع GPS |
| `stripIcc` | boolean | إزالة ملف تعريف ألوان ICC |
| `stripXmp` | boolean | إزالة بيانات XMP الوصفية |

### تعديلات اللون {#color-adjustments}

تعدّل هذه العمليات خصائص لون الصورة. تأخذ كل منها قيمة رقمية واحدة.

| العملية | المعامل | النطاق | الوصف |
|---|---|---|---|
| `brightness` | `value` | -100 إلى 100 | ضبط السطوع |
| `contrast` | `value` | -100 إلى 100 | ضبط التباين |
| `saturation` | `value` | -100 إلى 100 | ضبط تشبع اللون |

### مرشحات اللون {#color-filters}

تطبّق هذه تحويلًا لونيًا ثابتًا. لا تأخذ أي معاملات.

| العملية | الوصف |
|---|---|
| `grayscale` | التحويل إلى تدرج رمادي |
| `sepia` | تطبيق درجة بنية داكنة (سيبيا) |
| `invert` | عكس جميع الألوان |

### قنوات اللون {#color-channels}

ضبط قنوات ألوان RGB الفردية. القيم هي مضاعِفات حيث 100 = بلا تغيير.

| المعامل | النوع | الوصف |
|---|---|---|
| `red` | number | مضاعِف القناة الحمراء (0 إلى 200، 100 = دون تغيير) |
| `green` | number | مضاعِف القناة الخضراء (0 إلى 200، 100 = دون تغيير) |
| `blue` | number | مضاعِف القناة الزرقاء (0 إلى 200، 100 = دون تغيير) |

### sharpen {#sharpen}

زيادة حدّة بسيطة يتحكم فيها قيمة واحدة.

| المعامل | النوع | الوصف |
|---|---|---|
| `value` | number | شدة زيادة الحدّة (0 إلى 100). تُربَط بسيغما غاوسية بين 0.5 و10. |

### sharpen-advanced {#sharpen-advanced}

زيادة حدّة متقدمة بثلاث طرق قابلة للاختيار وتمريرة تمهيدية اختيارية لتقليل التشويش.

| المعامل | النوع | الوصف |
|---|---|---|
| `method` | string | `adaptive` أو `unsharp-mask` أو `high-pass` |
| `sigma` | number | نصف قطر التمويه الغاوسي، 0.5-10 (تكيّفي) |
| `m1` | number | زيادة حدّة المناطق المسطحة، 0-10 (تكيّفي) |
| `m2` | number | زيادة حدّة المناطق ذات النسيج، 0-20 (تكيّفي) |
| `x1` | number | عتبة المسطح/المتعرج، 0-10 (تكيّفي) |
| `y2` | number | أقصى تفتيح (تقييد الهالة)، 0-50 (تكيّفي) |
| `y3` | number | أقصى تعتيم (تقييد الهالة)، 0-50 (تكيّفي) |
| `amount` | number | النسبة المئوية للشدة، 0-500 (قناع غير الحدّة) |
| `radius` | number | نصف قطر التمويه، 0.1-5.0 (قناع غير الحدّة) |
| `threshold` | number | الحد الأدنى لسطوع الحواف، 0-255 (قناع غير الحدّة) |
| `strength` | number | قوة المزج، 0-100 (تمرير عالٍ) |
| `kernelSize` | number | `3` أو `5` لنواة 3x3 / 5x5 (تمرير عالٍ) |
| `denoise` | string | تمريرة تمهيدية لتقليل التشويش: `off` أو `light` أو `medium` أو `strong` |

المعاملات خاصة بكل طريقة. زوّد فقط تلك المتعلقة بالطريقة المختارة.

### color-blindness {#color-blindness}

محاكاة قصور رؤية الألوان باستخدام مصفوفة إعادة تركيب لون 3x3.

| المعامل | النوع | الوصف |
|---|---|---|
| `type` | string | أحد: `protanopia`، `deuteranopia`، `tritanopia`، `protanomaly`، `deuteranomaly`، `tritanomaly`، `achromatopsia`، `blueConeMonochromacy` |

### edit-metadata {#edit-metadata}

كتابة أو إزالة حقول بيانات EXIF/IPTC الوصفية الفردية دون إزالة الكتلة بأكملها.

| المعامل | النوع | الوصف |
|---|---|---|
| `artist` | string | وسم EXIF Artist |
| `copyright` | string | وسم EXIF Copyright |
| `imageDescription` | string | وسم EXIF ImageDescription |
| `software` | string | وسم EXIF Software |
| `dateTime` | string | وسم EXIF DateTime |
| `dateTimeOriginal` | string | وسم EXIF DateTimeOriginal |
| `clearGps` | boolean | إزالة جميع وسوم GPS |
| `fieldsToRemove` | string[] | قائمة بأسماء حقول EXIF المراد حذفها |

جميع المعاملات اختيارية. تُحذف الحقول المدرجة في `fieldsToRemove` من كتلة EXIF الحالية. أما الحقول المعيّنة عبر المعاملات المسمّاة فتُكتب (أو يُعاد كتابتها). تُتجاهل المفاتيح الثنائية/غير الآمنة مثل MakerNote بصمت.

## اكتشاف الصيغة {#format-detection}

يكتشف المحرك صيغ الإدخال تلقائيًا من ترويسات الملفات، لا من امتدادات الملفات فقط. هذا يعني أن ملف `.jpg` هو في الواقع PNG سيُعالَج بشكل صحيح. يستخدم الاكتشاف نهجًا متعدد الطبقات: البايتات السحرية أولًا، ثم امتداد الملف كاحتياطي.

يدعم SnapOtter **أكثر من 55 صيغة إدخال** و**13 صيغة إخراج**، بما في ذلك 23 صيغة RAW من الكاميرات من أكثر من 20 علامة تجارية، وصيغ احترافية (PSD، EPS، OpenEXR، HDR)، ومرمّزات حديثة (JPEG XL، AVIF، HEIC، QOI، JPEG 2000)، وصيغ علمية/للألعاب (FITS، DDS). يتولى Sharp فك الترميز أصليًا حيثما أمكن، مع احتياط تلقائي إلى ImageMagick وLibRaw ومفكّكات ترميز CLI متخصصة.

راجع صفحة [الصيغ المدعومة](/ar/guide/supported-formats) للاطلاع على القائمة الكاملة.

## استخراج البيانات الوصفية {#metadata-extraction}

تعيد أداة `info` بيانات الصورة الوصفية. راجع [معلومات الصورة](/ar/tools/image/info) لمرجع الحقول الكامل.

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```
