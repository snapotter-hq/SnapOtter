---
description: "التنسيقات المدعومة عبر جميع الوسائط - أكثر من 55 تنسيق إدخال للصور، والفيديو والصوت وPDF وتنسيقات الملفات."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 2c294d200195
---

# التنسيقات المدعومة {#supported-formats}

يعالج SnapOtter الملفات عبر خمس وسائط: الصور والفيديو والصوت وPDF والملفات. تسرد هذه الصفحة جميع التنسيقات المدعومة.

## تنسيقات الصور {#image-formats}

يدعم SnapOtter أكثر من 55 تنسيق صور للإدخال و13 تنسيقاً للإخراج.

## تنسيقات الإدخال {#input-formats}

### معايير الويب (9) {#web-standards-9}

| التنسيق | الامتدادات | مفكّك التشفير | ملاحظات |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (أصلي) | |
| PNG | .png | Sharp (أصلي) | يُستخرَج أول إطار من APNG |
| WebP | .webp | Sharp (أصلي) | |
| GIF | .gif | Sharp (أصلي) | المتحرّك مدعوم |
| AVIF | .avif | Sharp (أصلي) | |
| SVG | .svg | Sharp (librsvg) | مُنظَّف من XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | حماية من قنبلة Gzip |
| APNG | .apng | Sharp (أصلي) | الإطار الأول فقط |
| JPEG XL | .jxl | djxl / ImageMagick | احتياطي من مستويين |

### احترافي (7) {#professional-7}

| التنسيق | الامتدادات | مفكّك التشفير | ملاحظات |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (أصلي) | متعدّد الصفحات مدعوم |
| PSD | .psd | ImageMagick | مركّب مسطّح |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | تنقيط بدقة 300dpi، مُعزَّز أمنياً |
| OpenEXR | .exr | ImageMagick | تحويل خطي إلى sRGB |
| Radiance HDR | .hdr | ImageMagick | تحويل خطي إلى sRGB |
| DPX | .dpx | ImageMagick | تحويل لوغاريتمي إلى sRGB |
| Cineon | .cin | ImageMagick | تنسيق الأفلام/المؤثّرات البصرية |

### RAW للكاميرا (23) {#camera-raw-23}

| التنسيق | الامتدادات | علامة الكاميرا | مفكّك التشفير |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (عام) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (قبل 2018) | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon (2018+) | exiftool / ImageMagick + LibRaw |
| NEF | .nef | Nikon | exiftool / ImageMagick + LibRaw |
| NRW | .nrw | Nikon (Coolpix) | exiftool / ImageMagick + LibRaw |
| ARW | .arw | Sony | exiftool / ImageMagick + LibRaw |
| ORF | .orf | Olympus | exiftool / ImageMagick + LibRaw |
| RW2 | .rw2 | Panasonic | exiftool / ImageMagick + LibRaw |
| RAF | .raf | Fujifilm | exiftool / ImageMagick + LibRaw |
| PEF | .pef | Pentax/Ricoh | exiftool / ImageMagick + LibRaw |
| 3FR | .3fr | Hasselblad | exiftool / ImageMagick + LibRaw |
| IIQ | .iiq | Phase One | exiftool / ImageMagick + LibRaw |
| SRW | .srw | Samsung | exiftool / ImageMagick + LibRaw |
| X3F | .x3f | Sigma | exiftool / ImageMagick + LibRaw |
| RWL | .rwl | Leica | exiftool / ImageMagick + LibRaw |
| GPR | .gpr | GoPro | exiftool / ImageMagick + LibRaw |
| FFF | .fff | Hasselblad (قديم) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (مدمج) | exiftool / ImageMagick + LibRaw |

### التنسيقات الحديثة (3) {#modern-formats-3}

| التنسيق | الامتدادات | مفكّك التشفير | ملاحظات |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | السينما الرقمية والتصوير الطبي |
| QOI | .qoi | برنامج ترميز TypeScript مضمّن | تطوير الألعاب والأنظمة المضمّنة |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | صور iPhone |

### قديم/نظام (4) {#legacy-system-4}

| التنسيق | الامتدادات | مفكّك التشفير | ملاحظات |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | تُستخرَج أكبر طبقة |
| CUR | .cur | ImageMagick | مؤشّر Windows (نسخة من ICO) |
| TGA | .tga | ImageMagick | كشف حسب الامتداد فقط |

### علمي وألعاب (2) {#scientific-and-gaming-2}

| التنسيق | الامتدادات | مفكّك التشفير | ملاحظات |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | علم الفلك (معيار NASA) |
| DDS | .dds | ImageMagick | زخارف الألعاب (DirectX) |

### تبادل (6) {#interchange-6}

| التنسيق | الامتدادات | مفكّك التشفير | ملاحظات |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (أصلي) | خريطة بكسل ملوّنة |
| PGM | .pgm | Sharp (أصلي) | تدرّج رمادي |
| PBM | .pbm | Sharp (أصلي) | صورة نقطية 1-بت |
| PNM | .pnm | Sharp (أصلي) | تنسيق شامل |
| PAM | .pam | Sharp (أصلي) | خريطة اعتباطية |
| PFM | .pfm | Sharp (أصلي) | خريطة عائمة |

## تنسيقات الإخراج (13) {#output-formats-13}

| التنسيق | المُرمِّز | التحكّم في الجودة | متاح في |
|--------|---------|----------------|-------------|
| JPEG | Sharp أصلي | 1-100 | جميع الأدوات |
| PNG | Sharp أصلي | ضغط 0-9 | جميع الأدوات |
| WebP | Sharp أصلي | 1-100 | جميع الأدوات |
| AVIF | Sharp أصلي | 1-100 | جميع الأدوات |
| TIFF | Sharp أصلي | 1-100 | أدوات التحويل الكامل |
| GIF | Sharp أصلي | 1-100 | أدوات التحويل الكامل |
| JXL | Sharp أصلي | 1-100 | جميع الأدوات |
| HEIC | واجهة heif-enc | 1-100 | أدوات التحويل الكامل |
| HEIF | واجهة heif-enc | 1-100 | أدوات التحويل الكامل |
| BMP | واجهة ImageMagick | بلا فقدان | أداة التحويل |
| ICO | واجهة ImageMagick | بلا فقدان | أداة التحويل |
| JP2 | واجهة opj_compress | نسبة الضغط | أداة التحويل |
| QOI | برنامج ترميز مضمّن | بلا فقدان | أداة التحويل |

## تنسيقات الفيديو {#video-formats}

يتولّى FFmpeg (بناء ساكن) فكّ تشفير الفيديو وترميزه، لذا فإن كل حاوية ومرمِّز شائعين مدعومان عند الإدخال.

### حاويات الإدخال (15) {#input-containers-15}

| التنسيق | الامتدادات | المرمِّزات المعتادة | ملاحظات |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | الحاوية الأكثر استخداماً |
| QuickTime | .mov | H.264, ProRes | التقاط/تحرير Apple |
| WebM | .webm | VP8, VP9, AV1 | تنسيق ويب خالٍ من الإتاوات |
| Matroska | .mkv | أي مرمِّز | حاوية مفتوحة مرنة |
| AVI | .avi | متنوّع | حاوية Microsoft القديمة |
| M4V | .m4v | H.264 | نسخة MP4 من Apple |
| AVCHD | .mts | H.264 | تسجيلات كاميرات الفيديو |
| BDAV | .m2ts | H.264 | تدفّق نقل Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | التقاط الأجهزة المحمولة |
| Flash Video | .flv | H.264, VP6 | بثّ قديم |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | فيديو عصر DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | تدفّق نقل البثّ |
| Ogg | .ogv | Theora | فيديو Ogg مفتوح |

### تنسيقات الإخراج {#output-formats}

| التنسيق | الامتداد | مرمِّز الفيديو | تنتجه |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | التحويل والضغط ومعظم أدوات الفيديو |
| QuickTime | .mov | H.264 | تحويل الفيديو |
| WebM | .webm | VP9 | تحويل الفيديو |
| GIF | .gif | - | الفيديو إلى GIF |
| WebP | .webp | - | الفيديو إلى WebP (متحرّك) |

### الترجمات {#subtitles}

| التنسيق | الامتداد | العمليات |
|--------|-----------|-----------|
| SubRip | .srt | التضمين والحرق والاستخراج والتوليد التلقائي |
| WebVTT | .vtt | التضمين والحرق والاستخراج والتوليد التلقائي |
| ASS / SSA | .ass | التضمين والحرق (يدعم التنسيق) |

## تنسيقات الصوت {#audio-formats}

يُعالَج الصوت أيضاً بواسطة FFmpeg.

### تنسيقات الإدخال (11) {#input-formats-11}

| التنسيق | الامتدادات | الضغط | ملاحظات |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | مع فقدان | توافق عالمي |
| WAV | .wav | غير مضغوط (PCM) | استوديو / تحرير |
| FLAC | .flac | بلا فقدان | مرمِّز مفتوح بلا فقدان |
| AAC | .aac | مع فقدان | تدفّق AAC خام |
| M4A | .m4a | مع فقدان (AAC) / بلا فقدان (ALAC) | صوت MPEG-4 |
| Ogg Vorbis | .ogg | مع فقدان | تنسيق مفتوح |
| Opus | .opus | مع فقدان | حديث ومنخفض الكمون |
| WMA | .wma | مع فقدان | Windows Media Audio |
| AIFF | .aiff | غير مضغوط (PCM) | غير مضغوط من Apple |
| AMR | .amr | مع فقدان | كلام / محمول |
| AC-3 | .ac3 | مع فقدان | Dolby Digital |

### تنسيقات الإخراج {#output-formats-1}

| التنسيق | الامتداد | المرمِّز | تنتجه |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | تحويل الصوت واستخراج الصوت |
| WAV | .wav | PCM | تحويل الصوت واستخراج الصوت |
| FLAC | .flac | FLAC (بلا فقدان) | تحويل الصوت |
| Ogg | .ogg | Vorbis | تحويل الصوت |
| M4A | .m4a | AAC | تحويل الصوت واستخراج الصوت |

## تنسيقات المستندات {#document-formats}

تستخدم معالجة المستندات qpdf وLibreOffice وGhostscript وPandoc وWeasyPrint.

### تنسيقات الإدخال (15) {#input-formats-15}

| التنسيق | الامتدادات | المحرّك | ملاحظات |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | تنسيق المستندات الأساسي |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | نص وجدول وعرض تقديمي |
| Rich Text | .rtf | LibreOffice | نص منسّق عبر التطبيقات |
| Plain Text | .txt | LibreOffice, Pandoc | نص UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | مُصيَّر إلى PDF |
| EPUB | .epub | Pandoc, LibreOffice | تنسيق الكتب الإلكترونية |

### تنسيقات الإخراج {#output-formats-2}

| التنسيق | الامتدادات | تنتجه |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint إلى PDF، وMarkdown إلى PDF، وHTML إلى PDF |
| PDF/A | .pdf | تحويل PDF/A (للأرشفة) |
| Word | .docx, .odt, .rtf, .txt | تحويل المستند، وPDF إلى Word، وMarkdown إلى Word |
| Presentation | .pptx, .odp | تحويل العرض التقديمي |
| Spreadsheet | .xlsx, .ods, .csv | تحويل جدول البيانات |
| HTML | .html | Markdown إلى HTML |
| EPUB | .epub | التحويل إلى EPUB |
| Images | .png, .jpg | PDF إلى صورة |

## تنسيقات الملفات {#file-formats}

تحوّل أدوات البيانات والأرشيف بين التنسيقات المنظّمة وتحزم الملفات.

| التنسيق | الامتدادات | التحويلات |
|--------|-----------|-------------|
| CSV | .csv | إلى/من JSON وExcel؛ التقسيم والدمج؛ من XML |
| JSON | .json | إلى/من CSV وXML وYAML |
| XML | .xml | إلى/من JSON؛ إلى CSV |
| YAML | .yaml, .yml | إلى/من JSON |
| Excel | .xlsx | إلى/من CSV |
| ZIP | .zip | إنشاء الأرشيفات واستخراج المحتويات |
