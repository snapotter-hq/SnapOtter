---
description: "إعادة تحجيم وتحسين وتغيير السرعة وعكس وتدوير واستخراج إطارات من صور GIF المتحركة في أداة واحدة."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: fe96d3fe5525
---

# أدوات GIF {#gif-tools}

إعادة تحجيم وتحسين وتغيير السرعة وعكس واستخراج الإطارات وتدوير صور GIF المتحركة. توفّر أوضاع تشغيل متعددة في أداة واحدة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## المعاملات {#parameters}

### المعاملات المشتركة {#common-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| mode | string | لا | `"resize"` | وضع التشغيل: `resize`، `optimize`، `speed`، `reverse`، `extract`، `rotate` |
| loop | number | لا | 0 | عدد مرات التكرار لمخرجات GIF (0 = لا نهائي، 1-100 = تكرارات محدودة) |

### معاملات وضع إعادة التحجيم {#resize-mode-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| width | integer | لا | - | العرض المستهدف بالبكسل (1 إلى 16384) |
| height | integer | لا | - | الارتفاع المستهدف بالبكسل (1 إلى 16384) |
| percentage | number | لا | - | التحجيم بالنسبة المئوية (1 إلى 500). يتجاوز width/height إذا تم تعيينه. |

### معاملات وضع التحسين {#optimize-mode-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| colors | number | لا | 256 | الحد الأقصى لعدد الألوان في اللوحة (2 إلى 256) |
| dither | number | لا | 1.0 | قوة التوزيع اللوني (0 إلى 1، حيث 0 يعطّل التوزيع اللوني) |
| effort | number | لا | 7 | مستوى جهد التحسين (1 إلى 10، أعلى = أبطأ لكن أصغر) |

### معاملات وضع السرعة {#speed-mode-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| speedFactor | number | لا | 1.0 | مضاعف السرعة (0.1 إلى 10). القيم > 1 تسرّع، < 1 تبطّئ. |

### معاملات وضع الاستخراج {#extract-mode-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| extractMode | string | لا | `"single"` | وضع الاستخراج: `single`، `range`، `all` |
| frameNumber | number | لا | 0 | فهرس الإطار للاستخراج في وضع `single` (يبدأ من 0) |
| frameStart | number | لا | 0 | فهرس إطار البداية لوضع `range` (يبدأ من 0) |
| frameEnd | number | لا | - | فهرس إطار النهاية لوضع `range` (يبدأ من 0، شامل) |
| extractFormat | string | لا | `"png"` | صيغة الإطارات المستخرجة: `png`، `webp` |

### معاملات وضع التدوير {#rotate-mode-parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| angle | number | لا | - | زاوية التدوير: `90`، `180`، أو `270` درجة |
| flipH | boolean | لا | `false` | القلب أفقياً |
| flipV | boolean | لا | `false` | القلب عمودياً |

## أمثلة على الطلبات {#example-requests}

### إعادة التحجيم {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### التحسين {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### التسريع {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### استخراج إطار واحد {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## مثال على استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## المسار الفرعي للمعلومات {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

يُرجع بيانات وصفية عن GIF متحرك دون معالجته.

### طلب المعلومات {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### استجابة المعلومات {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## ملاحظات {#notes}

- يستخدم مصنع `createToolRoute` القياسي لنقطة نهاية المعالجة الرئيسية.
- تتطلب نقطة نهاية المعلومات رفع ملف فقط (لا حاجة لإعدادات).
- في وضع `resize`، إذا تم توفير `percentage` فإنه يأخذ الأولوية على `width`/`height`. تستخدم إعادة التحجيم `fit: inside` للحفاظ على نسبة العرض إلى الارتفاع.
- في وضع `speed`، تُقسَّم تأخيرات الإطارات على عامل السرعة. الحد الأدنى للتأخير لكل إطار هو 20 مللي ثانية (قيد مواصفات GIF).
- في وضع `reverse`، يتوفر أيضاً معامل `speedFactor` لضبط السرعة في آن واحد أثناء العكس.
- في وضع `extract` مع `range` أو `all`، تكون المخرجات ملف ZIP يحتوي على إطارات فردية.
- في وضع `rotate`، تتم معالجة كل إطار على حدة ثم إعادة تجميعه في رسم متحرك.
- يتحكم معامل `loop` في عدد مرات تكرار مخرجات GIF. استخدم 0 للتكرار اللانهائي.
- حقل `duration` في استجابة المعلومات هو إجمالي مدة الرسم المتحرك بالمللي ثانية.
