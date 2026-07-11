---
description: "SnapOtter टूल कैटलॉग से उत्पन्न समर्पित कन्वर्ज़न प्रीसेट एंडपॉइंट।"
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: f105aebf1461
---

# Conversion Presets {#conversion-presets}

SnapOtter बेस कन्वर्टर टूल के अलावा 83 समर्पित कन्वर्ज़न प्रीसेट एंडपॉइंट प्रदान करता है। प्रत्येक प्रीसेट आउटपुट फ़ॉर्मेट को लॉक करता है और अपनी बेस प्रोसेसिंग पाइपलाइन को सौंप देता है, इसलिए व्यवहार, सत्यापन, और आउटपुट कॉन्ट्रैक्ट नीचे सूचीबद्ध बेस टूल से मेल खाता है।

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

एक `file` भाग और वैकल्पिक `settings` JSON स्ट्रिंग के साथ `multipart/form-data` भेजें। प्रीसेट बेस टूल के रिस्पॉन्स कॉन्ट्रैक्ट का पालन करते हैं। फ़ास्ट प्रीसेट आमतौर पर एक `downloadUrl` के साथ `200` लौटाते हैं, लेकिन यदि वे सिंक्रोनस प्रतीक्षा विंडो से अधिक हो जाते हैं तो `202` लौटा सकते हैं। वीडियो प्रीसेट और लंबे file/document प्रीसेट `202` और `/api/v1/jobs/<jobId>/progress` से प्रगति स्ट्रीम लौटाते हैं। PDF-to-image प्रीसेट पेज डाउनलोड URL के साथ एक ZIP URL लौटाते हैं।

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG to PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG to JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG to WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG to WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP to JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP to PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG to AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG to AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP to AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC to JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC to PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC to AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG to GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG to GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF to JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF to PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP to GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG to TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG to TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF to JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF to PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD to JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD to PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG to EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG to EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS to PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS to JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG to SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG to SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | none |
| `tiff-to-svg` | TIFF to SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | none |
| `psd-to-svg` | PSD to SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS to SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG to PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG to JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG to PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG to PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC to PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF to PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP to PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF to PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS to PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV to MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM to MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV to MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI to MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 to MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 to WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM to MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV to MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI to MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 to AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV to AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV to AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI to MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 to GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV to GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV to GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI to GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF to MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF to WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF to MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 to MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV to MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV to MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM to MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI to MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 to WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV to WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 to OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A to MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A to WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC to MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC to WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC to FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG to MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG to WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV to MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 to WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC to MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF to JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF to PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF to TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel to CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | none |

## Notes {#notes}

- प्रीसेट फ़र्स्ट-क्लास API एंडपॉइंट हैं और batch अनुरोधों में भी मान्य हैं जहां उनका बेस रूट batch प्रोसेसिंग का समर्थन करता है।
- वीडियो कन्वर्ज़न का उपयोग करने वाले प्रीसेट `202 Accepted` लौटा सकते हैं; परिणाम डाउनलोड करने से पहले job प्रगति SSE एंडपॉइंट से कनेक्ट करें।
- किसी प्रीसेट द्वारा उजागर न किए गए उन्नत विकल्पों के लिए, बेस कन्वर्टर टूल को सीधे कॉल करें और `settings` में आउटपुट फ़ॉर्मेट सेट करें।
