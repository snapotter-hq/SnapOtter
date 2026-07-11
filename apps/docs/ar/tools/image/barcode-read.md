---
description: "مسح الصور بحثًا عن رموز QR والباركود والرموز ثنائية الأبعاد مع مخرجات موسومة."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: dfb973d83488
---

# قارئ الباركود {#barcode-reader}

امسح الصور المرفوعة بحثًا عن جميع أنواع الباركود ورموز QR. تُرجع النص المُفكَّك ونوع الباركود وبيانات الموضع لكل رمز مكتشَف. تولّد أيضًا صورة موسومة بمربّعات إحاطة ملوّنة حول الرموز المكتشَفة.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

يقبل بيانات نموذج متعدّد الأجزاء (multipart) مع ملف صورة وحقل `settings` اختياري بصيغة JSON.

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | لا | `true` | تفعيل وضع المسح المكثّف للباركود الأصعب قراءة (أبطأ لكن أكثر دقّة) |

## مثال على الطلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## مثال على الاستجابة {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## حقول الاستجابة {#response-fields}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| filename | string | اسم الملف الأصلي |
| barcodes | array | مصفوفة من كائنات الباركود المكتشَفة |
| annotatedUrl | string أو null | رابط تنزيل الصورة الموسومة (null إذا لم يُعثَر على باركود) |
| previewUrl | string أو null | مثل annotatedUrl (لتوافق معاينة الواجهة الأمامية) |

### كائن الباركود {#barcode-object}

| الحقل | النوع | الوصف |
|-------|------|-------------|
| type | string | صيغة الباركود (QRCode، EAN-13، Code128، DataMatrix، PDF417، إلخ) |
| text | string | المحتوى المُفكَّك للباركود |
| position | object | مربّع إحاطة بإحداثيات topLeft وtopRight وbottomLeft وbottomRight |

## أنواع الباركود المدعومة {#supported-barcode-types}

الباركود أحادي الأبعاد: Code128، Code39، Code93، Codabar، EAN-8، EAN-13، ITF، UPC-A، UPC-E

الباركود ثنائي الأبعاد: QRCode، DataMatrix، PDF417، Aztec، MaxiCode

## ملاحظات {#notes}

- يستخدم مكتبة zxing-wasm لاكتشاف الباركود.
- تُراكِب الصورة الموسومة مربّعات إحاطة مضلّعة ملوّنة وعلامات مرقّمة على كل باركود مكتشَف.
- يمكن اكتشاف ما يصل إلى 255 باركود في صورة واحدة.
- إذا لم يُعثَر على أي باركود، تكون `barcodes` مصفوفة فارغة وتكون `annotatedUrl` قيمة null.
- يجري وضع `tryHarder` مسحًا أكثر دقّة على حساب وقت المعالجة. عطّله لمعالجة أسرع للباركود النظيف والمحاذى جيدًا.
- تكون المخرجات الموسومة دائمًا بصيغة PNG.
- تُفكَّك مدخلات HEIC وRAW وPSD وSVG تلقائيًا قبل المسح.
- يُطبَّق اتجاه EXIF تلقائيًا قبل المعالجة.
