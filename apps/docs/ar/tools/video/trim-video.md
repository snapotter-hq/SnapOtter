---
description: "قص مقطع من الفيديو بتحديد وقتي البداية والنهاية."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: 48b2eb1bd989
i18n_hash_version: 2
---

# Trim Video {#trim-video}

قص مقطعاً من فيديو. احتفظ بالجزء الواقع بين وقتي البداية والنهاية، أو احذف مقداراً ثابتاً من بداية الفيديو ونهايته. يتوفر خيار للقص الدقيق على مستوى الإطار.

في التطبيق، تقبل حقول الوقت الثواني فقط (`90`)، أو `MM:SS` (`1:30`)، أو `HH:MM:SS` (`1:02:03.5`). أما واجهة API فتقبل الثواني.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف فيديو وحقل JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` يحتفظ بالجزء من `startS` إلى `endS`. `ends` يحذف `cutStartS` من البداية و`cutEndS` من النهاية |
| startS | number | No | `0` | Range mode: وقت البداية بالثواني (يجب أن يكون >= 0) |
| endS | number | Range mode | - | Range mode: وقت النهاية بالثواني (يجب أن يكون بعد startS) |
| cutStartS | number | No | `0` | Ends mode: عدد الثواني المراد حذفها من البداية |
| cutEndS | number | No | `0` | Ends mode: عدد الثواني المراد حذفها من النهاية |
| precise | boolean | No | `false` | إعادة ترميز النطاق بأكمله للحصول على إطاري بداية ونهاية دقيقين بدلاً من النسخ من الإطار المفتاحي التالي |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

احذف أول 5 ثوانٍ وآخر 10 ثوانٍ، أياً كان طول الفيديو:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Notes {#notes}

- عندما تكون قيمة `precise` هي `false` (الافتراضي)، يبدأ المقطع من الإطار الدقيق الذي طلبته. تتم إعادة ترميز الإطارات الواقعة بين نقطة البداية والإطار المفتاحي التالي فقط، ويُنسخ الباقي، لذلك تبقى العملية سريعة. قد تمتد النهاية إطاراً أو نحوه، لأن التدفق المنسوخ يحتفظ بالإطارات التي تعتمد عليها الإطارات السابقة. المصادر التي لا يمكن وصلها بأمان بهذه الطريقة (فيديو H.264 بعمق 10 بت أو متداخل، أو ترميزات أخرى تحتاج إلى بداية معاد ترميزها، أو ملفات AVI وFLV وMPEG وTS) تُعاد ترميزها بالكامل بدلاً من ذلك.
- تعيين `precise` إلى `true` يعيد ترميز النطاق بأكمله دائماً، فيكون طرفا المقطع دقيقين، لكن العملية تستغرق وقتاً أطول.
- في range mode، يجب أن تكون قيمة `endS` أكبر من `startS`. إذا كانت `endS` بعد نهاية الفيديو، يمتد المقطع حتى النهاية.
- في ends mode، يجب أن تكون إحدى القيمتين `cutStartS` و`cutEndS` على الأقل أكبر من صفر، ويجب أن يبقى معهما جزء من الفيديو. وبما أن القص يُحسب من طول كل ملف على حدة، فإن إعداداً واحداً يعمل مع دفعة من مقاطع الفيديو ذات المدد المختلفة.
