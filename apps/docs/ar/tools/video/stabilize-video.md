---
description: "تقليل اهتزاز الكاميرا بتثبيت من مرحلتين."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: e493ab34b33d
---

# Stabilize Video {#stabilize-video}

تقليل اهتزاز الكاميرا في اللقطات المحمولة باليد باستخدام تثبيت vidstab من مرحلتين في FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`. هذه نقطة نهاية غير متزامنة - تُرجع `202 Accepted` فوراً ويُبَثّ التقدم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | حجم نافذة التنعيم بالإطارات (5-60). القيم الأعلى تنتج حركة أكثر نعومة |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- التثبيت عملية من مرحلتين: تحلل المرحلة الأولى حركة الكاميرا، وتطبق المرحلة الثانية التصحيح. يستغرق هذا نحو ضعف وقت الأدوات ذات المرحلة الواحدة.
- تزيل قيم التنعيم الأعلى مزيداً من الاهتزاز لكنها قد تُدخل اقتصاص تكبير طفيفاً عند الحواف.
- تحديثات التقدم متاحة عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
