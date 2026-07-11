---
description: "تطبيق تأثير ثنائي اللون بلونَي ظل وإبراز مخصّصين."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: cd4e9baf6e86
---

# Duotone {#duotone}

طبّق تأثيرًا ثنائي اللون على صورة. تُحوَّل الصورة إلى تدرّج رمادي، ثم تُربَط بتدرّج بين لون الظل (الدرجات الداكنة) ولون الإبراز (الدرجات الفاتحة).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/duotone`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| shadow | string | No | `"#1e3a8a"` | لون الظل hex (يُطبَّق على الدرجات الداكنة) |
| highlight | string | No | `"#fbbf24"` | لون الإبراز hex (يُطبَّق على الدرجات الفاتحة) |
| intensity | integer | No | `100` | شدة التأثير (0-100)؛ 0 يعيد الأصل، و100 يطبّق التأثير ثنائي اللون بالكامل |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Notes {#notes}

- صيغة الإخراج تطابق صيغة الإدخال. تُفَكّ شفرة مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
- قيمة `intensity` أقل من 100 تمزج النتيجة ثنائية اللون مع الصورة الأصلية، مما يتيح تأثيرات أخفت.
- تشمل تركيبات duotone الشائعة الكحلي/الذهبي، والفيروزي/المرجاني، والبنفسجي/الوردي.
