---
description: "تحويل مجموعة من الصور إلى فيديو عرض شرائح أو GIF متحرك أو WebP متحرك."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: 740b802da0ae
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

تحويل مجموعة من الصور إلى فيديو عرض شرائح مع مدة قابلة للتهيئة لكل صورة، ودقة، ومعدل إطارات، أو إلى GIF أو WebP متحرك بزمن ثابت لكل إطار وعدد مرات تكرار.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملفي صورة أو أكثر وحقل JSON بصيغة `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| outputFormat | string | No | `"mp4"` | صيغة الإخراج: `mp4`، `gif`، `webp` |
| secondsPerImage | number | No | `2` | لـ MP4 فقط. مدة عرض كل صورة بالثواني (0.5-10) |
| resolution | string | No | `"720p"` | لـ MP4 فقط. دقة الإخراج: `1080p` أو `720p` أو `square` |
| fps | integer | No | `30` | لـ MP4 فقط. معدل إطارات الإخراج (10-60) |
| frameDelayMs | integer | No | `500` | لـ GIF و WebP فقط. زمن عرض كل صورة بالميلي ثانية (20-10000) |
| loop | integer | No | `0` | لـ GIF و WebP فقط. عدد مرات تشغيل الرسم المتحرك؛ `0` يكرره إلى ما لا نهاية (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

لإنشاء GIF متحرك يعرض كل صورة لمدة 200 ميلي ثانية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- يقبل 2-60 ملف صورة لكل طلب. تظهر الصور في الفيديو بترتيب الرفع.
- في MP4، تُغيَّر أبعاد الصور وتُبطَّن لتلائم الدقة المستهدفة مع الحفاظ على نسبة العرض إلى الارتفاع.
- ينتج خيار الدقة `square` فيديو بأبعاد 1080x1080، وهو مفيد لوسائل التواصل الاجتماعي.
- إخراج MP4 بترميز H.264 ويحمل الاسم `slideshow.mp4`.
- يستخدم إخراج GIF و WebP حجم الصورة الأولى. تُصغَّر الصور ذات الأحجام الأخرى لتلائمه، وتبقى المساحة الفائضة شفافة. يُسمّى الملف `slideshow.gif` أو `slideshow.webp`.
- يخزّن GIF أزمنة الإطارات بأجزاء من مئة من الثانية، لذا يُقرَّب `frameDelayMs` إلى أقرب 10 ميلي ثانية في GIF. أما WebP فيحتفظ بالقيمة الدقيقة.
- تُرفض الرسوم المتحركة الكبيرة بدلًا من إنشائها: يجب أن يبقى حجم الإطار مضروبًا في عدد الصور دون حد البكسلات نفسه الذي تستخدمه أدوات GIF.
