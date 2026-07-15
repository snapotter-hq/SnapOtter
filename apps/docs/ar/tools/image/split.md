---
description: "تقسيم صورة واحدة إلى بلاطات شبكية حسب عدد الصفوف والأعمدة أو حسب الحجم بالبكسل، وإرجاعها كأرشيف ZIP."
i18n_source_hash: 838f5fa791b0
i18n_provenance: human
i18n_output_hash: 75b8145cb271
---

# تقسيم الصورة {#image-splitting}

قسّم صورة واحدة إلى بلاطات شبكية حسب عدد الأعمدة/الصفوف أو حسب أبعاد بكسل محددة. تُرجع أرشيف ZIP يحتوي على جميع البلاطات.

## نقطة نهاية API {#api-endpoint}

`POST /api/v1/tools/image/split`

## المعاملات {#parameters}

| المعامل | النوع | مطلوب | الافتراضي | الوصف |
|-----------|------|----------|---------|-------------|
| columns | integer | لا | 3 | عدد الأعمدة المراد التقسيم إليها (1 إلى 100) |
| rows | integer | لا | 3 | عدد الصفوف المراد التقسيم إليها (1 إلى 100) |
| tileWidth | integer | لا | - | عرض البلاطة بالبكسل (10 كحد أدنى). يتجاوز `columns` عند ضبط كل من `tileWidth` و`tileHeight`. |
| tileHeight | integer | لا | - | ارتفاع البلاطة بالبكسل (10 كحد أدنى). يتجاوز `rows` عند ضبط كل من `tileWidth` و`tileHeight`. |
| outputFormat | string | لا | `"original"` | صيغة مخرجات البلاطات: `original`، `png`، `jpg`، `webp`، `avif`، `jxl` |
| quality | number | لا | 90 | جودة المخرجات للصيغ ذات الفقد (1 إلى 100) |

## مثال طلب {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/split \
  -F "file=@large-image.png" \
  -F 'settings={"columns":3,"rows":3,"outputFormat":"png"}' \
  --output split-tiles.zip
```

## مثال استجابة {#example-response}

تُبثّ الاستجابة مباشرة كملف ZIP مع `Content-Type: application/zip`. يتبع اسم الملف النمط `split-<jobId>.zip`.

كل بلاطة داخل الـ ZIP تُسمى `<originalBaseName>_r<row>_c<col>.<ext>` (مثل `photo_r1_c1.png`، `photo_r2_c3.webp`).

## ملاحظات {#notes}

- تقبل ملف صورة واحدًا.
- تدعم صيغ المدخلات HEIC وRAW وPSD وSVG (تُفكّ ترميزاتها تلقائيًا).
- عند توفير كل من `tileWidth` و`tileHeight`، فإنهما يأخذان الأولوية على `columns`/`rows`. تُحسب أبعاد الشبكة كـ `ceil(imageWidth / tileWidth)` و`ceil(imageHeight / tileHeight)`.
- قد تكون بلاطات الحواف (العمود الأيمن، الصف السفلي) أصغر من حجم البلاطة المحدد إذا لم تكن أبعاد الصورة قابلة للقسمة بالتساوي.
- الحد الأقصى لحجم الشبكة مقيّد بـ 100x100 (10,000 بلاطة).
- تبثّ الاستجابة ملف الـ ZIP مباشرة، لذا لا يوجد جسم استجابة بصيغة JSON. استخدم `--output` مع curl لحفظ الملف.
