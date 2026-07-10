---
description: "استعادة وتحسين حدّة الوجوه المشوّشة أو منخفضة الجودة في الصور باستخدام نموذجَي الذكاء الاصطناعي GFPGAN وCodeFormer."
i18n_source_hash: 7f9f6af8ebda
i18n_provenance: human
i18n_output_hash: 9fd7af07c413
---

# Face Enhancement {#face-enhancement}

استعِد وحسّن الوجوه في الصور باستخدام نماذج الذكاء الاصطناعي (GFPGAN/CodeFormer).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/enhance-faces`

**المعالجة:** غير متزامنة (تُعيد 202، استعلِم من `/api/v1/jobs/{jobId}/progress` عن الحالة عبر SSE)

**حزم النماذج:** `upscale-enhance` (5-6 غيغابايت) و`face-detection` (200-300 ميغابايت)

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | ملف الصورة (multipart) |
| model | string | No | `"auto"` | النموذج المستخدم: `auto`، `gfpgan`، `codeformer` |
| strength | number | No | `0.8` | قوة التحسين (0-1). القيم الأعلى تنتج تحسينًا أقوى |
| onlyCenterFace | boolean | No | `false` | تحسين الوجه الأكثر مركزية/بروزًا فقط |
| sensitivity | number | No | `0.5` | حساسية اكتشاف الوجه (0-1) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/enhance-faces \
  -F "file=@portrait.jpg" \
  -F 'settings={"model":"codeformer","strength":0.7,"onlyCenterFace":false}'
```

## Response {#response}

### Initial Response (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Progress (SSE at `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","stage":"Enhancing faces...","percent":60}
```

### Final Result (via SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_enhanced.png",
    "previewUrl": "/api/v1/download/{jobId}/preview.webp",
    "originalSize": 350000,
    "processedSize": 600000,
    "facesDetected": 2,
    "faces": [
      {"x": 120, "y": 80, "w": 100, "h": 100},
      {"x": 350, "y": 90, "w": 95, "h": 95}
    ],
    "model": "codeformer"
  }
}
```

## Notes {#notes}

- يتطلب كلًّا من حزمة النموذج `upscale-enhance` (5-6 غيغابايت) وحزمة النموذج `face-detection` (200-300 ميغابايت).
- ينتج GFPGAN تحسينًا أكثر حدّة؛ ويحافظ CodeFormer على الهوية بشكل أفضل. يختار `auto` أفضل نموذج للمدخل.
- الإخراج دائمًا بصيغة PNG لأقصى جودة.
- تُولَّد معاينة WebP إلى جانب الإخراج بدقّته الكاملة لعرض أسرع في الواجهة الأمامية.
- يمزج المُعامِل `strength` الوجه المُحسَّن مع الأصل. استخدم القيم الأقل (0.3-0.5) للتحسينات الخفيفة، والقيم الأعلى (0.7-1.0) للاستعادة الأقوى.
- يدعم صيغ الإدخال HEIC/HEIF وRAW وTGA وPSD وEXR وHDR عبر فكّ الشفرة التلقائي.
