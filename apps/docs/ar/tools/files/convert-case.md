---
description: "غيّر النص إلى أحرف كبيرة أو صغيرة أو بصيغة العنوان أو الجملة وغيرها."
i18n_source_hash: e15ff31ec4d6
i18n_provenance: machine
i18n_output_hash: 0f50bcf4568c
i18n_hash_version: 2
---

# تحويل حالة الأحرف {#convert-case}

الصق نصًا، واختر حالة الأحرف، ثم انسخ النتيجة. يذهب النص إلى خادم SnapOtter الخاص بك فقط ولا يذهب إلى أي مكان آخر.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/convert-case`

يقبل جسم JSON وليس بيانات نموذج متعدد الأجزاء، ويردّ بالنص المحوَّل بدلًا من ملف للتنزيل.

## المعاملات {#parameters}

| الاسم | النوع | الافتراضي | الوصف |
|------|------|---------|-------------|
| `text` | string | (مطلوب) | النص المراد تحويله. حتى 1,000,000 حرف. |
| `mode` | string | (مطلوب) | أحد الأوضاع أدناه. |
| `locale` | string | (لا شيء) | وسم لغة BCP 47، مثل `tr` أو `de`، للأحرف التي تعتمد حالتها على اللغة. من دونه تكون حالة الأحرف واحدة لكل اللغات. |

| الوضع | الدخل | الخرج |
|------|-------|-------|
| `upper` | `The quick brown fox` | `THE QUICK BROWN FOX` |
| `lower` | `The Quick Brown Fox` | `the quick brown fox` |
| `sentence` | `the quick BROWN fox. it jumps.` | `The quick brown fox. It jumps.` |
| `title` | `the lord of the rings` | `The Lord of the Rings` |
| `capitalized` | `the lord of the rings` | `The Lord Of The Rings` |
| `inverse` | `The Quick Brown Fox` | `tHE qUICK bROWN fOX` |
| `alternating` | `the quick brown fox` | `tHe QuIcK bRoWn FoX` |
| `camel` | `The quick brown fox` | `theQuickBrownFox` |
| `pascal` | `the quick brown fox` | `TheQuickBrownFox` |
| `snake` | `The quick brown fox` | `the_quick_brown_fox` |
| `kebab` | `The quick brown fox` | `the-quick-brown-fox` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-case \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "the lord of the rings", "mode": "title"}'
```

## مثال استجابة {#example-response}

```json
{
  "mode": "title",
  "result": "The Lord of the Rings"
}
```

## ملاحظات {#notes}

- يُبقي `title` الكلمات الإنجليزية القصيرة (a وan وand وof وthe وto وما شابهها) بأحرف صغيرة ما لم تكن في بداية السطر أو نهايته. ويجعل `capitalized` كل كلمة تبدأ بحرف كبير.
- يبدأ `sentence` جملة جديدة في بداية النص، وبعد فاصل الأسطر، وبعد `.` أو `!` أو `?` أو `…` متبوعة بمسافة، لذا لا تُحتسب النقطة في `snapotter.com` أو `3.5`.
- يقسّم `camel` و`pascal` و`snake` و`kebab` النص عند المسافات وعلامات الترقيم وتغيّرات حالة الأحرف الموجودة (يصبح `XMLHttpRequest` `xml_http_request`)، ويحوّلون كل سطر على حدة.
- عند ضبط `locale` على `tr`، يتحول `i` إلى الأحرف الكبيرة `İ` ويتحول `I` إلى الأحرف الصغيرة `ı`. أما الحرف الألماني `ß` فيتحول إلى الأحرف الكبيرة `SS` في كل اللغات.
- يرسل تطبيق الويب لغة الواجهة الحالية بصيغة `locale`.
