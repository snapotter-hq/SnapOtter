---
description: "عرض أو تحرير أو إزالة علامات بيانات الصوت الوصفية (ID3)."
i18n_source_hash: 0717018e11cb
i18n_provenance: human
i18n_output_hash: 2ea4443e1b26
---

# بيانات الصوت الوصفية {#audio-metadata}

اعرض أو حرّر أو أزِل علامات بيانات الصوت الوصفية مثل العنوان والفنان والألبوم (ID3 وتنسيقات علامات مماثلة).

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/audio/audio-metadata`

تقبل بيانات نموذج متعدد الأجزاء مع ملف صوتي وحقل JSON `settings`.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| strip | boolean | لا | `false` | إزالة جميع علامات البيانات الوصفية الموجودة |
| title | string | لا | - | ضبط علامة العنوان (500 حرف كحد أقصى) |
| artist | string | لا | - | ضبط علامة الفنان (500 حرف كحد أقصى) |
| album | string | لا | - | ضبط علامة الألبوم (500 حرف كحد أقصى) |

## مثال طلب {#example-request}

تحرير علامات البيانات الوصفية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"title": "My Song", "artist": "Artist Name", "album": "Album Name"}'
```

إزالة جميع البيانات الوصفية:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"strip": true}'
```

## مثال استجابة {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4480000,
  "metadata": {
    "container": "mp3",
    "durationS": 245.3,
    "bitrateKbps": 192,
    "tags": {
      "title": "My Song",
      "artist": "Artist Name",
      "album": "Album Name"
    }
  }
}
```

## ملاحظات {#notes}

- تتضمن الاستجابة كائن `metadata` يحتوي تنسيق الحاوية والمدة ومعدل البت والعلامات الحالية.
- عندما يكون `strip` هو `true`، تُتجاهل جميع حقول العلامات وتُزال كل علامة موجودة.
- تُحدَّث فقط العلامات التي تقدّمها؛ تبقى العلامات غير المحددة دون تغيير.
- يطابق تنسيق المخرج تنسيق الإدخال.
