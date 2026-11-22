---
description: "حوِّل ملفات الترجمة بين SRT وWebVTT وASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 25814cafba97
i18n_hash_version: 2
---

# تحويل الترجمة {#convert-subtitles}

حوِّل ملف ترجمة بين SRT وWebVTT وASS. يُحتفَظ بالتوقيت والنص، أما تموضع ASS وتأثيراته فلا يُحتفَظ بها.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

يقبل بيانات نموذج متعدد الأجزاء تحتوي على ملف ترجمة واحد (`.srt` أو `.vtt` أو `.ass`) وحقل JSON اختياري `settings`.

## المعاملات {#parameters}

| المعامل | النوع | الافتراضي | الوصف |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | صيغة الإخراج: `srt` أو `vtt` أو `ass` |
| `encoding` | string | `"auto"` | ترميز نص الدخل: `auto`، `utf-8`، `windows-1252`، `windows-1250`، `windows-1251`، `windows-1256`، `iso-8859-2`، `gb18030`، `big5`، `shift_jis` أو `euc-kr` |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## ملاحظات {#notes}

- يحتفظ التحويل من ASS بالتوقيت ونص الحوار والتنسيق الأساسي الذي تستطيع الصيغة الهدف حمله: يحتفظ SRT بالمائل والغامق واللون وحجم الخط على هيئة وسوم، ويحتفظ WebVTT بالمائل والغامق والتسطير. يُحذف التموضع على الشاشة والحركة وتأثيرات ASS الأخرى.
- الإخراج دائمًا بترميز UTF-8. عند ضبط `encoding` على `auto`، يُقرأ الملف الصالح بترميز UTF-8 كما هو، ويُقرأ أي ملف غير ذلك بترميز Windows-1252، وهو الترميز المعتاد لملفات SRT القديمة لغرب أوروبا. إذا ظهرت الأحرف المعلَّمة أو غير اللاتينية مشوّهة، فاضبط `encoding` على الترميز الفعلي للملف (مثل `gb18030` للصينية المبسّطة أو `windows-1251` للسيريلية).
- يُحدَّد حجم ملفات الترجمة المرفوعة افتراضيًا بـ 1 ميغابايت. ارفع هذا الحد أو أزله باستخدام `MAX_SUBTITLE_SIZE_MB`.
