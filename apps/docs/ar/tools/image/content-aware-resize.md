---
description: "إعادة تحجيم بنحت الشقوق تضيف أو تزيل بكسلات على طول المسارات الأقل أهمية للحفاظ على المحتوى الأساسي والوجوه."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 98ba7932c1cf
---

# Content-Aware Resize {#content-aware-resize}

إعادة تحجيم بنحت الشقوق تزيل أو تضيف البكسلات بذكاء على طول المسارات الأقل أهمية بصريًا، مع الحفاظ على المحتوى المهم وحماية الوجوه اختياريًا.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**المعالجة:** متزامنة (تُعيد النتيجة مباشرة)

**حزمة النموذج:** لا حاجة إليها للتشغيل الأساسي. تستخدم حماية الوجوه حزمة `face-detection` (200-300 ميغابايت) إذا كانت مفعّلة.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ملف الصورة (multipart) |
| width | number | No | - | العرض المستهدف بالبكسل |
| height | number | No | - | الارتفاع المستهدف بالبكسل |
| protectFaces | boolean | No | `false` | اكتشاف الوجوه وحمايتها من إزالة الشقوق |
| blurRadius | number | No | `4` | نصف قطر التمويه للمعالجة المسبقة لحساب الطاقة (0-20) |
| sobelThreshold | number | No | `2` | عتبة اكتشاف حواف Sobel (1-20). القيم الأعلى تجعل الخوارزمية أكثر حدّة |
| square | boolean | No | `false` | إعادة التحجيم إلى مربع (يستخدم البُعد الأصغر) |

يجب تحديد واحد على الأقل من `width` أو `height` أو `square`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Notes {#notes}

- يُعيد هذا المسار المخصص حاليًا استجابة 200 متزامنة.
- يستخدم مكتبة نحت الشقوق `caire` لإعادة التحجيم المدركة للمحتوى.
- يقلّل الأبعاد فقط (يزيل الشقوق). لا يمكنه توسيع الصورة إلى ما وراء حجمها الأصلي.
- يستخدم خيار `protectFaces` اكتشاف الوجوه بالذكاء الاصطناعي لتحديد مناطق الوجه كذات طاقة عالية، مما يمنع مرور الشقوق عبر الوجوه.
- يتحكّم `blurRadius` في التنعيم قبل حساب خريطة الطاقة. القيم الأعلى تجعل خريطة الطاقة أكثر تجانسًا، مما قد يساعد مع الصور المشوّشة.
- يؤثّر `sobelThreshold` في مدى حدّة اكتشاف الحواف. القيم الأقل تحافظ على مزيد من الحواف الخفيفة.
- الإخراج دائمًا بصيغة PNG.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فكّ الشفرة التلقائي.
