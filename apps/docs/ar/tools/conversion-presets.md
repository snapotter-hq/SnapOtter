---
description: "نقاط نهاية إعدادات تحويل مخصّصة مُولَّدة من كتالوج أدوات SnapOtter."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: 5ecf0f2b4584
---

# إعدادات التحويل المسبقة {#conversion-presets}

يوفّر SnapOtter 83 نقطة نهاية إعداد تحويل مخصّصة إلى جانب أدوات المحوِّل الأساسية. يقفل كل إعداد مسبق تنسيق الخرج ويفوّض المعالجة إلى مسار المعالجة الأساسي الخاص به، لذا تطابق السلوك والتحقق وعقد الخرج الأداة الأساسية المدرجة أدناه.

## نمط نقطة نهاية API {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

أرسل `multipart/form-data` مع جزء `file` وسلسلة JSON اختيارية بصيغة `settings`. تتّبع الإعدادات المسبقة عقد الاستجابة الخاص بالأداة الأساسية. تُرجع الإعدادات المسبقة السريعة عادةً `200` مع `downloadUrl`، لكنها قد تُرجع `202` إذا تجاوزت نافذة الانتظار المتزامن. تُرجع إعدادات الفيديو وإعدادات الملفات/المستندات الطويلة `202` وبثوث التقدم من `/api/v1/jobs/<jobId>/progress`. تُرجع إعدادات تحويل PDF إلى صورة روابط تنزيل الصفحات إضافةً إلى رابط ZIP.

## إعدادات الصور المسبقة {#image-presets}

| معرّف الإعداد | يحوِّل | المسار | الأداة الأساسية | المدخلات المقبولة | إعدادات اختيارية |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG إلى PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`، `.jpeg` | quality |
| `png-to-jpg` | PNG إلى JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG إلى WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`، `.jpeg` | quality |
| `png-to-webp` | PNG إلى WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP إلى JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP إلى PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG إلى AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`، `.jpeg` | quality |
| `png-to-avif` | PNG إلى AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP إلى AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC إلى JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`، `.heif` | quality |
| `heic-to-png` | HEIC إلى PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`، `.heif` | quality |
| `heic-to-avif` | HEIC إلى AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`، `.heif` | quality |
| `jpg-to-gif` | JPG إلى GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`، `.jpeg` | quality |
| `png-to-gif` | PNG إلى GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF إلى JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF إلى PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP إلى GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG إلى TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`، `.jpeg` | quality |
| `png-to-tiff` | PNG إلى TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF إلى JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`، `.tif` | quality |
| `tiff-to-png` | TIFF إلى PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`، `.tif` | quality |
| `psd-to-jpg` | PSD إلى JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD إلى PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG إلى EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG إلى EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`، `.jpeg` | quality |
| `eps-to-png` | EPS إلى PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS إلى JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG إلى SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | لا شيء |
| `jpg-to-svg` | JPG إلى SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`، `.jpeg` | لا شيء |
| `tiff-to-svg` | TIFF إلى SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`، `.tif` | لا شيء |
| `psd-to-svg` | PSD إلى SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | لا شيء |
| `eps-to-svg` | EPS إلى SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | لا شيء |
| `svg-to-png` | SVG إلى PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`، `.svgz` | quality، width، height، dpi، backgroundColor |
| `svg-to-jpg` | SVG إلى JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`، `.svgz` | quality، width، height، dpi، backgroundColor |
| `jpg-to-pdf` | JPG إلى PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`، `.jpeg` | pageSize، orientation، margin، targetSize، collate |
| `png-to-pdf` | PNG إلى PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize، orientation، margin، targetSize، collate |
| `heic-to-pdf` | HEIC إلى PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`، `.heif` | pageSize، orientation، margin، targetSize، collate |
| `tiff-to-pdf` | TIFF إلى PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`، `.tif` | pageSize، orientation، margin، targetSize، collate |
| `webp-to-pdf` | WebP إلى PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize، orientation، margin، targetSize، collate |
| `gif-to-pdf` | GIF إلى PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize، orientation، margin، targetSize، collate |
| `eps-to-pdf` | EPS إلى PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize، orientation، margin، targetSize، collate |

## إعدادات الفيديو المسبقة {#video-presets}

| معرّف الإعداد | يحوِّل | المسار | الأداة الأساسية | المدخلات المقبولة | إعدادات اختيارية |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV إلى MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM إلى MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV إلى MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI إلى MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 إلى MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 إلى WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM إلى MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV إلى MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI إلى MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 إلى AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV إلى AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV إلى AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI إلى MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 إلى GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps، width، startS، durationS |
| `mov-to-gif` | MOV إلى GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps، width، startS، durationS |
| `mkv-to-gif` | MKV إلى GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps، width، startS، durationS |
| `avi-to-gif` | AVI إلى GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps، width، startS، durationS |
| `gif-to-mp4` | GIF إلى MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | لا شيء |
| `gif-to-webm` | GIF إلى WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | لا شيء |
| `gif-to-mov` | GIF إلى MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | لا شيء |
| `mp4-to-mp3` | MP4 إلى MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | لا شيء |
| `mov-to-mp3` | MOV إلى MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | لا شيء |
| `mkv-to-mp3` | MKV إلى MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | لا شيء |
| `webm-to-mp3` | WEBM إلى MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | لا شيء |
| `avi-to-mp3` | AVI إلى MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | لا شيء |
| `mp4-to-wav` | MP4 إلى WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | لا شيء |
| `mov-to-wav` | MOV إلى WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | لا شيء |
| `mp4-to-ogg` | MP4 إلى OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | لا شيء |

## إعدادات الصوت المسبقة {#audio-presets}

| معرّف الإعداد | يحوِّل | المسار | الأداة الأساسية | المدخلات المقبولة | إعدادات اختيارية |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A إلى MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | لا شيء |
| `m4a-to-wav` | M4A إلى WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | لا شيء |
| `aac-to-mp3` | AAC إلى MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | لا شيء |
| `aac-to-wav` | AAC إلى WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | لا شيء |
| `aac-to-flac` | AAC إلى FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | لا شيء |
| `ogg-to-mp3` | OGG إلى MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | لا شيء |
| `ogg-to-wav` | OGG إلى WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | لا شيء |
| `wav-to-mp3` | WAV إلى MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | لا شيء |
| `mp3-to-wav` | MP3 إلى WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | لا شيء |
| `flac-to-mp3` | FLAC إلى MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | لا شيء |

## إعدادات PDF المسبقة {#pdf-presets}

| معرّف الإعداد | يحوِّل | المسار | الأداة الأساسية | المدخلات المقبولة | إعدادات اختيارية |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF إلى JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi، quality، colorMode، pages |
| `pdf-to-png` | PDF إلى PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi، quality، colorMode، pages |
| `pdf-to-tiff` | PDF إلى TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi، quality، colorMode، pages |

## إعدادات الملفات المسبقة {#files-presets}

| معرّف الإعداد | يحوِّل | المسار | الأداة الأساسية | المدخلات المقبولة | إعدادات اختيارية |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel إلى CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`، `.xls` | لا شيء |

## ملاحظات {#notes}

- الإعدادات المسبقة نقاط نهاية API من الدرجة الأولى، وهي صالحة أيضًا في طلبات الدفعات حيث يدعم مسارها الأساسي المعالجة على دفعات.
- الإعدادات المسبقة التي تستخدم تحويل الفيديو قد تُرجع `202 Accepted`؛ اتصل بنقطة نهاية SSE لتقدم المهمة قبل تنزيل النتيجة.
- للخيارات المتقدمة التي لا يعرضها إعداد مسبق، استدعِ أداة المحوِّل الأساسية مباشرةً واضبط تنسيق الخرج في `settings`.
