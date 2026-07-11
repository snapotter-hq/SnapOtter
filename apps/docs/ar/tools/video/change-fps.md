---
description: "تغيير معدل الإطارات في الفيديو."
i18n_source_hash: 2bffbd04a1cb
i18n_provenance: human
i18n_output_hash: 8978b8298466
---

# Change FPS {#change-fps}

تغيير معدل إطارات الفيديو إلى قيمة مستهدفة بين 1 و120 إطاراً في الثانية.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/change-fps`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fps | number | No | `30` | معدل الإطارات المستهدف (1-120) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/change-fps \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"fps": 24}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 10200000
}
```

## Notes {#notes}

- خفض معدل الإطارات يُسقط إطارات ويقلل حجم الملف. رفعه يكرر الإطارات لسد الفجوة لكنه لا يضيف تفاصيل حركة حقيقية.
- القيم المستهدفة الشائعة: 24 (السينما)، 30 (الويب/البث)، 60 (تشغيل سلس).
- يُحفَظ مسار الصوت بمعدل العينات الأصلي.
