---
description: "ادمج عدّة ملفات نصية أو Markdown في ملف واحد بالترتيب الذي تختاره."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 103ec0c81593
i18n_hash_version: 2
---

# دمج الملفات النصية {#merge-text}

ادمج عدّة ملفات نصية أو Markdown في ملف واحد. تُضم الملفات بترتيب رفعها، لذا أعد ترتيبها في قائمة الملفات قبل التشغيل إذا كان الترتيب مهمًا.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

يقبل بيانات نموذج متعددة الأجزاء تحتوي على ملفين نصيين أو أكثر وسلسلة JSON اختيارية باسم `settings`.

## المعاملات {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | ما يوضع بين الملفات: `"blank-line"` أو `"rule"` (سطر `---`) أو `"filename-heading"` (اسم كل ملف كعنوان) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## ملاحظات {#notes}

- يقبل ملفات `.txt` و`.md` و`.markdown` و`.csv` و`.log`، بين 2 و50 ملفًا في كل طلب.
- يجب أن يكون كل ملف نصًا بترميز UTF-8. يُرفض أي ملف ثنائي أو غير UTF-8 مع ذكر اسمه في رسالة الخطأ.
- عندما تحمل كل المدخلات الامتداد نفسه يحتفظ الناتج به (`merged.md` و`merged.log`). أما المدخلات المختلطة فتنتج `merged.txt`.
- مع `filename-heading` يستخدم ناتج Markdown عناوين `# name.md`، بينما يستخدم الناتج النصي العادي أسطر علامات `==> name.txt <==`.
- تُقتطع الأسطر الفارغة في نهاية كل ملف ليقع الفاصل بين المستندات بشكل نظيف. ويُحذف أي وسم ترتيب البايتات (BOM) في البداية.
- تُدمج ملفات CSV كنص عادي. استخدم [دمج ملفات CSV](./merge-csvs) لدمج الجداول مع صف رأس واحد.
- ملفات البريد الإلكتروني `.eml` غير مدعومة بعد.
