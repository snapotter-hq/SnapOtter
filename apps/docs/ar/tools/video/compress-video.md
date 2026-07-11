---
description: "تقليص حجم ملف الفيديو مع التحكم في الجودة."
i18n_source_hash: 9cc1f1acf74e
i18n_provenance: human
i18n_output_hash: d5a9ab96d1fd
---

# Compress Video {#compress-video}

تقليص حجم ملف الفيديو باستخدام قوة ضغط قابلة للتهيئة وتخفيض اختياري للدقة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/compress-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`. هذه نقطة نهاية غير متزامنة - تُرجع `202 Accepted` فوراً ويُبَثّ التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | قوة الضغط: `light` أو `balanced` أو `strong` |
| resolution | string | No | `"original"` | دقة الإخراج: `original` أو `1080p` أو `720p` أو `480p` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/compress-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"quality": "strong", "resolution": "720p"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- يحافظ الإعداد المسبق `light` على جودة قريبة من الأصل. يقلل الإعداد المسبق `strong` حجم الملف بقوة على حساب دقة الصورة.
- تخفيض الدقة (مثلاً من 4K إلى 720p) يتضاعف مع الضغط لتقليل الحجم بشكل كبير.
- تحديثات التقدم متاحة عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
