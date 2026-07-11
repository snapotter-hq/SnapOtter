---
description: "اقتصاص منطقة من الفيديو."
i18n_source_hash: fab11f71a202
i18n_provenance: human
i18n_output_hash: c2f4dad8b556
---

# Crop Video {#crop-video}

اقتصاص منطقة مستطيلة من الفيديو بتحديد حجم المنطقة وموضعها.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/crop-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | Yes | - | عرض منطقة الاقتصاص بالبكسل (بحد أدنى 16) |
| height | integer | Yes | - | ارتفاع منطقة الاقتصاص بالبكسل (بحد أدنى 16) |
| x | integer | No | `0` | الإزاحة الأفقية من الزاوية العلوية اليسرى |
| y | integer | No | `0` | الإزاحة الرأسية من الزاوية العلوية اليسرى |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/crop-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"width": 640, "height": 480, "x": 100, "y": 50}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 5200000
}
```

## Notes {#notes}

- يجب أن تتسع منطقة الاقتصاص ضمن أبعاد الفيديو. إذا تجاوز `x + width` أو `y + height` حجم المصدر، يُرجع الطلب خطأ 400.
- الحد الأدنى لحجم الاقتصاص هو 16x16 بكسل.
- تُقرَّب الأبعاد إلى أرقام زوجية كما تتطلب معظم برامج ترميز الفيديو.
