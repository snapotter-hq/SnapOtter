---
description: "توليد ملفات ترجمة من المسارات الصوتية للفيديو باستخدام الذكاء الاصطناعي."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: a473d5b87fc0
---

# Auto Subtitles {#auto-subtitles}

ولّد ملفات ترجمة من المسار الصوتي لمقطع فيديو باستخدام التعرّف على الكلام المدعوم بالذكاء الاصطناعي (faster-whisper). يدعم الاكتشاف التلقائي و10 لغات صريحة.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

يقبل بيانات نموذج multipart تحتوي على ملف فيديو وحقل `settings` بصيغة JSON. هذه نقطة نهاية غير متزامنة - تُعيد `202 Accepted` فوراً ويُبثّ التقدّم عبر SSE على `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | لغة الكلام: `auto` أو `en` أو `de` أو `fr` أو `es` أو `zh` أو `ja` أو `ko` أو `id` أو `th` أو `vi` |
| format | string | No | `"srt"` | صيغة ملف الترجمة الناتج: `srt` أو `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- هذه أداة ذكاء اصطناعي تتطلّب تثبيت حزمة ميزة **transcription**. إذا لم تكن الحزمة مثبّتة، يُعيد الـ API `501 Feature Not Installed` مع تعليمات لتثبيتها عبر واجهة المشرف.
- يستخدم خيار اللغة `auto` اكتشاف اللغة المدمج في whisper. يؤدي تحديد اللغة صراحةً إلى تحسين الدقة والسرعة.
- SRT هي أوسع صيغ ملفات الترجمة دعماً. وVTT (WebVTT) هي المعيار لمشغّلات فيديو الويب.
- تتوفّر تحديثات التقدّم عبر SSE على `GET /api/v1/jobs/{jobId}/progress` حتى تكتمل المهمة.
