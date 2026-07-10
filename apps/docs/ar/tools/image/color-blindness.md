---
description: "محاكاة كيفية ظهور الصور للأشخاص المصابين بأنواع مختلفة من قصور رؤية الألوان."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: e1a86fed371d
---

# Color Blindness Simulation {#color-blindness-simulation}

حاكِ قصور رؤية الألوان (CVD) لمعاينة كيفية ظهور الصور للأشخاص المصابين بأنواع مختلفة من عمى الألوان. مفيد لاختبار إمكانية الوصول للتصاميم والمخططات وواجهات المستخدم.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

يقبل بيانات نموذج multipart تحتوي على ملف صورة وحقل JSON باسم `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| simulationType | string | No | `"deuteranomaly"` | نوع قصور رؤية الألوان المراد محاكاته |

### Simulation Types {#simulation-types}

| Value | Condition | Description |
|-------|-----------|-------------|
| `protanopia` | عمى اللون الأحمر | غياب كامل للخلايا المخروطية الحمراء |
| `deuteranopia` | عمى اللون الأخضر | غياب كامل للخلايا المخروطية الخضراء |
| `tritanopia` | عمى اللون الأزرق | غياب كامل للخلايا المخروطية الزرقاء |
| `protanomaly` | ضعف اللون الأحمر | انخفاض حساسية الخلايا المخروطية الحمراء |
| `deuteranomaly` | ضعف اللون الأخضر | انخفاض حساسية الخلايا المخروطية الخضراء (الأكثر شيوعًا) |
| `tritanomaly` | ضعف اللون الأزرق | انخفاض حساسية الخلايا المخروطية الزرقاء |
| `achromatopsia` | عمى ألوان كامل | غياب كامل لرؤية الألوان |
| `blueConeMonochromacy` | مخاريط زرقاء فقط | المخاريط الزرقاء فقط تعمل |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notes {#notes}

- ضعف اللون الأخضر (Deuteranomaly) هو الافتراضي لأنه أكثر أشكال قصور رؤية الألوان شيوعًا، ويصيب نحو 6% من الذكور.
- تستخدم المحاكاة مصفوفات تحويل ألوان تُنمذج كيف تغيّر المستقبلات الضوئية المخروطية المنخفضة أو الغائبة الألوان المُدرَكة.
- هذه الأداة غير متلفة وتنتج معاينة فقط. لا تعدّل الصورة الأصلية لأغراض إمكانية الوصول.
- صيغة الإخراج تطابق صيغة الإدخال. تُفَكّ شفرة مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المعالجة.
