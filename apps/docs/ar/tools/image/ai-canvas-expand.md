---
description: "توسيع لوحة الصورة بالرسم الخارجي بالذكاء الاصطناعي، مع مدّها في أي اتجاه وملء المناطق الجديدة لتطابق الأصل."
i18n_source_hash: 1b00db4ed40d
i18n_provenance: human
i18n_output_hash: 554b854ef598
---

# توسيع اللوحة بالذكاء الاصطناعي {#ai-canvas-expand}

وسّع لوحة الصورة بملء مدعوم بالذكاء الاصطناعي (الرسم الخارجي). يمدّ الصورة في أي اتجاه ويملأ المناطق الجديدة بمحتوى مُولَّد بالذكاء الاصطناعي يطابق الصورة الموجودة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/ai-canvas-expand`

**المعالجة:** غير متزامنة (تُرجع 202، استعلِم عن `/api/v1/jobs/{jobId}/progress` لمعرفة الحالة عبر SSE)

**حزمة النموذج:** `object-eraser-colorize` (1-2 غيغابايت)

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف صورة (multipart) |
| extendTop | integer | لا | `0` | البكسلات المراد مدّها في الأعلى |
| extendRight | integer | لا | `0` | البكسلات المراد مدّها على اليمين |
| extendBottom | integer | لا | `0` | البكسلات المراد مدّها في الأسفل |
| extendLeft | integer | لا | `0` | البكسلات المراد مدّها على اليسار |
| tier | string | لا | `"balanced"` | مستوى الجودة: `fast`، `balanced`، `high` |
| format | string | لا | `"auto"` | صيغة المخرجات: `auto`، `png`، `jpg`، `jpeg`، `webp`، `tiff`، `gif`، `avif`، `heic`، `heif`، `jxl` |
| quality | integer | لا | `95` | جودة المخرجات (1-100) |

يجب أن يكون اتجاه واحد على الأقل من اتجاهات المدّ أكبر من 0.

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/ai-canvas-expand \
  -F "file=@photo.jpg" \
  -F 'settings={"extendTop":200,"extendBottom":200,"extendLeft":100,"extendRight":100,"tier":"balanced"}'
```

## الاستجابة {#response}

### الاستجابة الأولية (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### التقدّم (SSE على `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Expanding canvas...","percent":50}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/photo_extended.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 300000,
    "processedSize": 520000
  }
}
```

## ملاحظات {#notes}

- يتطلّب تثبيت حزمة النموذج `object-eraser-colorize` (1-2 غيغابايت).
- يستخدم الرسم الخارجي المبني على LaMa لتوليد محتوى للمناطق المُوسّعة.
- يوازن المعامل `tier` بين السرعة والجودة: `fast` يُنتج نتائج بسرعة مع احتمال ظهور آثار، بينما `high` يستغرق وقتًا أطول لكنه يُنتج ملئًا أنعم وأكثر تماسكًا.
- قيم المدّ بالبكسل. ستكون أبعاد الصورة النهائية: العرض الأصلي + extendLeft + extendRight في الارتفاع الأصلي + extendTop + extendBottom.
- لصيغ المخرجات غير القابلة للمعاينة في المتصفّح (HEIC، JXL، TIFF)، تُولَّد معاينة WebP إلى جانب المخرجات الرئيسية.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر الفكّ التلقائي.
