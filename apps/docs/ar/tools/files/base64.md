---
description: "رمِّز النص إلى Base64 أو فكّ ترميز Base64 إلى نص."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: a2b8c0d9a5e4
i18n_hash_version: 2
---

# ترميز Base64 وفكّه {#base64}

الصق نصًا للحصول على Base64، أو الصق Base64 لاستعادة النص، ثم انسخ النتيجة. يذهب النص إلى خادم SnapOtter الخاص بك فقط ولا يذهب إلى أي مكان آخر.

لتحويل صورة إلى Base64، استخدم [Image to Base64](/ar/tools/image/image-to-base64) بدلًا من ذلك.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/files/base64`

يقبل جسم JSON وليس بيانات نموذج متعدد الأجزاء، ويردّ بالنص المحوَّل بدلًا من ملف للتنزيل.

## المعاملات {#parameters}

| الاسم | النوع | الافتراضي | الوصف |
|------|------|---------|-------------|
| `text` | string | (مطلوب) | النص المراد ترميزه، أو Base64 المراد فكّه. حتى 1,000,000 حرف. |
| `mode` | string | (مطلوب) | `encode` أو `decode`. |
| `urlSafe` | boolean | `false` | عند الترميز، استخدم الأبجدية الآمنة لعناوين URL (`-` و`_`) واحذف الحشو `=`. يُتجاهل عند فكّ الترميز. |

## مثال طلب {#example-request}

الترميز:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

فكّ الترميز:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## مثال استجابة {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## ملاحظات {#notes}

- يُرمَّز النص بترميز UTF-8، لذا تنتقل الأحرف المعلَّمة وCJK والرموز التعبيرية ذهابًا وإيابًا دون أن تتضرر.
- يتجاهل فكّ الترميز المسافات وفواصل الأسطر، لذا يُفكّ Base64 المقسَّم عند 76 عمودًا (البريد الإلكتروني، أجسام PEM) كما هو ملصوق.
- يقبل فكّ الترميز الدخل مع الحشو `=` أو بدونه، بالأبجدية القياسية (`+`، `/`) أو الآمنة لعناوين URL (`-`، `_`)، لكنه لا يقبل مزيجًا من الاثنتين.
- يفشل الدخل الذي ليس Base64 بخطأ 400 ورمز `ENCODED_TEXT_INVALID`. أما Base64 الصالح الذي يُفكّ إلى بيانات ثنائية (صورة، ZIP) بدلًا من نص UTF-8 فيفشل بالرمز `DECODED_DATA_NOT_TEXT`.
