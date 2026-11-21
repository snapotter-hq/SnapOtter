---
description: "SnapOtter araç kataloğundan oluşturulan özel dönüştürme ön ayarı uç noktaları."
i18n_source_hash: a9dcab4c4e81
i18n_provenance: human
i18n_output_hash: 618c72de456f
i18n_hash_version: 2
---

# Conversion Presets {#conversion-presets}

SnapOtter, temel dönüştürücü araçlarına ek olarak 117 özel dönüştürme ön ayarı uç noktası sunar. Her ön ayar çıktı formatını sabitler ve temel işleme hattına devreder, böylece davranış, doğrulama ve çıktı sözleşmesi aşağıda listelenen temel araçla eşleşir.

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Bir `file` parçası ve isteğe bağlı `settings` JSON dizesi ile `multipart/form-data` gönderin. Ön ayarlar, temel aracın yanıt sözleşmesini takip eder. Hızlı ön ayarlar genellikle bir `downloadUrl` ile `200` döndürür, ancak senkron bekleme penceresini aşarlarsa `202` döndürebilirler. Video ön ayarları ve uzun dosya/belge ön ayarları `202` döndürür ve ilerleme akışlarını `/api/v1/jobs/<jobId>/progress` üzerinden yayınlar. PDF'ten görüntüye ön ayarları sayfa indirme URL'leri artı bir ZIP URL'si döndürür.

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG'den PNG'ye | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG'den JPG'ye | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG'den WebP'ye | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG'den WebP'ye | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP'den JPG'ye | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP'den PNG'ye | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG'den AVIF'e | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG'den AVIF'e | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP'den AVIF'e | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC'ten JPG'ye | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC'ten PNG'ye | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC'ten AVIF'e | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG'den GIF'e | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG'den GIF'e | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF'ten JPG'ye | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF'ten PNG'ye | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP'den GIF'e | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG'den TIFF'e | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG'den TIFF'e | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF'ten JPG'ye | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF'ten PNG'ye | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD'den JPG'ye | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD'den PNG'ye | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG'den EPS'e | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG'den EPS'e | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS'ten PNG'ye | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS'ten JPG'ye | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG'den SVG'ye | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG'den SVG'ye | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | none |
| `tiff-to-svg` | TIFF'ten SVG'ye | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | none |
| `psd-to-svg` | PSD'den SVG'ye | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS'ten SVG'ye | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG'den PNG'ye | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG'den JPG'ye | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG'den PDF'e | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG'den PDF'e | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC'ten PDF'e | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF'ten PDF'e | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP'den PDF'e | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF'ten PDF'e | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS'ten PDF'e | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV'dan MP4'e | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM'den MP4'e | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV'den MP4'e | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI'den MP4'e | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4'ten MOV'a | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4'ten WEBM'e | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM'den MOV'a | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV'den MOV'a | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI'den MOV'a | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4'ten AVI'ye | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV'dan AVI'ye | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV'den AVI'ye | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI'den MKV'ye | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4'ten GIF'e | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV'dan GIF'e | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV'den GIF'e | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI'den GIF'e | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF'ten MP4'e | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF'ten WEBM'e | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF'ten MOV'a | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4'ten MP3'e | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV'dan MP3'e | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV'den MP3'e | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM'den MP3'e | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI'den MP3'e | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4'ten WAV'a | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV'dan WAV'a | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4'ten OGG'ye | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |
| `srt-to-vtt` | SRT'ten VTT'ye | `/api/v1/tools/video/srt-to-vtt` | `convert-subtitles` | `.srt` | none |
| `vtt-to-srt` | VTT'ten SRT'ye | `/api/v1/tools/video/vtt-to-srt` | `convert-subtitles` | `.vtt` | none |
| `ass-to-srt` | ASS'ten SRT'ye | `/api/v1/tools/video/ass-to-srt` | `convert-subtitles` | `.ass` | none |
| `srt-to-ass` | SRT'ten ASS'e | `/api/v1/tools/video/srt-to-ass` | `convert-subtitles` | `.srt` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A'dan MP3'e | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A'dan WAV'a | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC'den MP3'e | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC'den WAV'a | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC'den FLAC'e | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG'den MP3'e | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG'den WAV'a | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV'dan MP3'e | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3'ten WAV'a | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC'ten MP3'e | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |
| `mp3-to-flac` | MP3'ten FLAC'e | `/api/v1/tools/audio/mp3-to-flac` | `convert-audio` | `.mp3` | none |
| `mp3-to-ogg` | MP3'ten OGG'e | `/api/v1/tools/audio/mp3-to-ogg` | `convert-audio` | `.mp3` | none |
| `mp3-to-m4a` | MP3'ten M4A'e | `/api/v1/tools/audio/mp3-to-m4a` | `convert-audio` | `.mp3` | none |
| `wav-to-flac` | WAV'ten FLAC'e | `/api/v1/tools/audio/wav-to-flac` | `convert-audio` | `.wav` | none |
| `wav-to-ogg` | WAV'ten OGG'e | `/api/v1/tools/audio/wav-to-ogg` | `convert-audio` | `.wav` | none |
| `wav-to-m4a` | WAV'ten M4A'e | `/api/v1/tools/audio/wav-to-m4a` | `convert-audio` | `.wav` | none |
| `flac-to-wav` | FLAC'ten WAV'e | `/api/v1/tools/audio/flac-to-wav` | `convert-audio` | `.flac` | none |
| `flac-to-ogg` | FLAC'ten OGG'e | `/api/v1/tools/audio/flac-to-ogg` | `convert-audio` | `.flac` | none |
| `flac-to-m4a` | FLAC'ten M4A'e | `/api/v1/tools/audio/flac-to-m4a` | `convert-audio` | `.flac` | none |
| `ogg-to-flac` | OGG'ten FLAC'e | `/api/v1/tools/audio/ogg-to-flac` | `convert-audio` | `.ogg` | none |
| `ogg-to-m4a` | OGG'ten M4A'e | `/api/v1/tools/audio/ogg-to-m4a` | `convert-audio` | `.ogg` | none |
| `m4a-to-flac` | M4A'ten FLAC'e | `/api/v1/tools/audio/m4a-to-flac` | `convert-audio` | `.m4a` | none |
| `m4a-to-ogg` | M4A'ten OGG'e | `/api/v1/tools/audio/m4a-to-ogg` | `convert-audio` | `.m4a` | none |
| `aac-to-ogg` | AAC'ten OGG'e | `/api/v1/tools/audio/aac-to-ogg` | `convert-audio` | `.aac` | none |
| `aac-to-m4a` | AAC'ten M4A'e | `/api/v1/tools/audio/aac-to-m4a` | `convert-audio` | `.aac` | none |
| `opus-to-mp3` | Opus'ten MP3'e | `/api/v1/tools/audio/opus-to-mp3` | `convert-audio` | `.opus` | none |
| `opus-to-wav` | Opus'ten WAV'e | `/api/v1/tools/audio/opus-to-wav` | `convert-audio` | `.opus` | none |
| `opus-to-flac` | Opus'ten FLAC'e | `/api/v1/tools/audio/opus-to-flac` | `convert-audio` | `.opus` | none |
| `opus-to-ogg` | Opus'ten OGG'e | `/api/v1/tools/audio/opus-to-ogg` | `convert-audio` | `.opus` | none |
| `opus-to-m4a` | Opus'ten M4A'e | `/api/v1/tools/audio/opus-to-m4a` | `convert-audio` | `.opus` | none |
| `wma-to-mp3` | WMA'ten MP3'e | `/api/v1/tools/audio/wma-to-mp3` | `convert-audio` | `.wma` | none |
| `wma-to-wav` | WMA'ten WAV'e | `/api/v1/tools/audio/wma-to-wav` | `convert-audio` | `.wma` | none |
| `wma-to-flac` | WMA'ten FLAC'e | `/api/v1/tools/audio/wma-to-flac` | `convert-audio` | `.wma` | none |
| `wma-to-ogg` | WMA'ten OGG'e | `/api/v1/tools/audio/wma-to-ogg` | `convert-audio` | `.wma` | none |
| `wma-to-m4a` | WMA'ten M4A'e | `/api/v1/tools/audio/wma-to-m4a` | `convert-audio` | `.wma` | none |
| `aiff-to-mp3` | AIFF'ten MP3'e | `/api/v1/tools/audio/aiff-to-mp3` | `convert-audio` | `.aiff` | none |
| `aiff-to-wav` | AIFF'ten WAV'e | `/api/v1/tools/audio/aiff-to-wav` | `convert-audio` | `.aiff` | none |
| `aiff-to-flac` | AIFF'ten FLAC'e | `/api/v1/tools/audio/aiff-to-flac` | `convert-audio` | `.aiff` | none |
| `aiff-to-ogg` | AIFF'ten OGG'e | `/api/v1/tools/audio/aiff-to-ogg` | `convert-audio` | `.aiff` | none |
| `aiff-to-m4a` | AIFF'ten M4A'e | `/api/v1/tools/audio/aiff-to-m4a` | `convert-audio` | `.aiff` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF'ten JPG'ye | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF'ten PNG'ye | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF'ten TIFF'e | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel'den CSV'ye | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | none |
| `otf-to-ttf` | OTF'den TTF'ye | `/api/v1/tools/files/otf-to-ttf` | `convert-font` | `.otf` | none |
| `woff-to-ttf` | WOFF'den TTF'ye | `/api/v1/tools/files/woff-to-ttf` | `convert-font` | `.woff` | none |
| `woff2-to-ttf` | WOFF2'den TTF'ye | `/api/v1/tools/files/woff2-to-ttf` | `convert-font` | `.woff2` | none |
| `ttf-to-woff2` | TTF'den WOFF2'ye | `/api/v1/tools/files/ttf-to-woff2` | `convert-font` | `.ttf`, `.otf` | none |

## Notes {#notes}

- Ön ayarlar birinci sınıf API uç noktalarıdır ve temel rotalarının toplu işlemeyi desteklediği toplu isteklerde de geçerlidir.
- Video dönüştürmeyi kullanan ön ayarlar `202 Accepted` döndürebilir; sonucu indirmeden önce iş ilerleme SSE uç noktasına bağlanın.
- Bir ön ayar tarafından sunulmayan gelişmiş seçenekler için, temel dönüştürücü aracı doğrudan çağırın ve çıktı formatını `settings` içinde ayarlayın.
