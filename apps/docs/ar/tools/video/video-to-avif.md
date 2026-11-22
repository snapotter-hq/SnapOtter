---
description: "تحويل مقطع فيديو إلى صورة AVIF متحركة."
i18n_source_hash: 824c23e5d184
i18n_provenance: machine
i18n_output_hash: 8ed6f9f09d8b
i18n_hash_version: 2
---

# Video to AVIF {#video-to-avif}

تحويل مقطع فيديو إلى صورة AVIF متحركة مع معدل إطارات وعرض وجودة ونطاق مقطع قابلة للتهيئة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-to-avif`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | integer | No | `12` | معدل إطارات الإخراج (1-30) |
| width | integer | No | `480` | عرض الإخراج بالبكسل (64-1280). يتغير الارتفاع بشكل متناسب |
| startS | number | No | `0` | نقطة بداية المقطع بالثواني |
| durationS | number | No | `5` | طول المقطع بالثواني (حتى 60) |
| quality | integer | No | `50` | جودة AVIF (1-100) |
| loop | boolean | No | `true` | تكرار الرسوم المتحركة |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-to-avif \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 15, "width": 640, "durationS": 4}'
```

## Example Response {#example-response}

ترميز AV1 أبطأ من GIF أو WebP، لذلك تستجيب هذه الأداة عادةً بالرمز `202` مع مهمة يمكن متابعتها عبر SSE على `/api/v1/jobs/{jobId}/progress`. قد ينتهي المقطع القصير داخل نافذة الانتظار المتزامن ويعيد النتيجة مباشرة:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.avif",
  "originalSize": 12500000,
  "processedSize": 900000
}
```

## Notes {#notes}

- صيغة AVIF المتحركة خالية من رسوم الترخيص، وعادةً ما تكون أصغر من WebP أو GIF المتحرك بنفس الجودة المرئية.
- تشغّل المتصفحات الحالية صور AVIF المتحركة. بعض عارضات الصور على سطح المكتب تعرض الإطار الأول فقط.
- يتم حذف المسار الصوتي.
