---
description: "اقتصاص مدرك للموضوع والوجوه والإنتروبيا يؤطّر الصور بذكاء باستخدام Sharp واكتشاف الوجوه بالذكاء الاصطناعي."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 91a94bb5e580
---

# الاقتصاص الذكي {#smart-crop}

اقتصاص ذكي مدرك للموضوع أو الوجوه أو قائم على القص. يستخدم استراتيجيات الانتباه/الإنتروبيا في Sharp واكتشاف الوجوه بالذكاء الاصطناعي للتأطير الذكي.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**المعالجة:** غير متزامنة (تُرجع 202، مع استقصاء `/api/v1/jobs/{jobId}/progress` للحالة عبر SSE)

**حزمة النموذج:** `face-detection` (200-300 ميغابايت) - مطلوبة فقط لوضع `face`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| file | file | نعم | - | ملف الصورة (متعدد الأجزاء) |
| mode | string | لا | `"subject"` | وضع الاقتصاص: `subject`، `face`، `trim`. (تُربط القيمتان القديمتان `attention` و`content` بـ `subject` و`trim`) |
| strategy | string | لا | `"attention"` | استراتيجية وضع الموضوع: `attention` أو `entropy` |
| width | integer | لا | - | العرض المستهدف بالبكسل |
| height | integer | لا | - | الارتفاع المستهدف بالبكسل |
| padding | integer | لا | `0` | نسبة الحشو حول الموضوع (0-50) |
| facePreset | string | لا | `"head-shoulders"` | إعداد تأطير الوجه المسبق: `closeup`، `head-shoulders`، `upper-body`، `half-body` |
| sensitivity | number | لا | `0.5` | حساسية اكتشاف الوجوه (0-1) |
| threshold | integer | لا | `30` | عتبة وضع القص لاكتشاف الخلفية (0-255) |
| padToSquare | boolean | لا | `false` | حشو الناتج المقصوص ليصبح مربعًا |
| padColor | string | لا | `"#ffffff"` | لون الخلفية للحشو |
| targetSize | integer | لا | - | الحجم المستهدف للمخرجات المحشوة (بالبكسل) |
| quality | integer | لا | - | جودة المخرجات (1-100) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
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
data: {"phase":"processing","percent":50}
```

### النتيجة النهائية (عبر SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## الأوضاع {#modes}

### وضع الموضوع {#subject-mode}
يستخدم استراتيجية الانتباه أو الإنتروبيا في Sharp لإيجاد المنطقة الأكثر إثارة للاهتمام بصريًا ويقتص حولها.

### وضع الوجه {#face-mode}
يكتشف الوجوه باستخدام الذكاء الاصطناعي، ثم يؤطّر الاقتصاص حول الوجوه المكتشفة باستخدام `facePreset` المحدد. يعود إلى وضع الموضوع (استراتيجية الانتباه) إذا لم يُكتشف أي وجه.

### وضع القص {#trim-mode}
يزيل الحدود/الخلفية المنتظمة من الصورة. يحشو الناتج اختياريًا ليصبح مربعًا بلون خلفية وحجم مستهدف محددين.

## ملاحظات {#notes}

- تستخدم هذه الأداة مصنع `createToolRoute` مع `executionHint: "long"`، لذا تُرجع 202 مع تقدّم SSE.
- يتطلب وضع الوجه حزمة النموذج `face-detection` (200-300 ميغابايت).
- يعمل وضعا الموضوع والقص دون أي حزمة نموذج للذكاء الاصطناعي.
- يحدد `facePreset` مدى إحكام تأطير الاقتصاص للوجوه المكتشفة: `closeup` هو الأكثر إحكامًا، و`half-body` هو الأوسع.
- إذا لم يُحدد عرض/ارتفاع، فسيكون الافتراضي 1080x1080.
