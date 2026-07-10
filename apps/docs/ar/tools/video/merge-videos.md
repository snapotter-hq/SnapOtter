---
description: "دمج عدة مقاطع فيديو في ملف واحد."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 721dce121c48
---

# Merge Videos {#merge-videos}

دمج عدة مقاطع فيديو في ملف MP4 واحد. تُوحَّد جميع المدخلات لتطابق دقة الفيديو الأول و30 إطاراً في الثانية.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملفي فيديو أو أكثر. هذه نقطة نهاية غير متزامنة - تُرجع `202 Accepted` فوراً ويُبَثّ التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

لا توجد معلمات إعدادات لهذه الأداة. ارفع 2-10 ملفات فيديو كأجزاء `file` متعددة.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- تُسلسَل المقاطع بالترتيب الذي رُفعت به.
- يُعاد ترميز جميع المقاطع لتطابق دقة المقطع الأول، ومعدل إطاراته (30 إطاراً في الثانية)، وترميزه (H.264). تُوحَّد المدخلات غير المتطابقة تلقائياً.
- يقبل 2-10 ملفات فيديو لكل طلب.
- تحديثات التقدم متاحة عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
