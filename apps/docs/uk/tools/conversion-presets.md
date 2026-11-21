---
description: "Спеціалізовані кінцеві точки пресетів конвертації, згенеровані з каталогу інструментів SnapOtter."
i18n_source_hash: a9dcab4c4e81
i18n_provenance: human
i18n_output_hash: e9e7c3fdf586
i18n_hash_version: 2
---

# Conversion Presets {#conversion-presets}

SnapOtter надає 117 спеціалізовані кінцеві точки пресетів конвертації на додаток до базових інструментів-конвертерів. Кожен пресет фіксує формат виводу та делегує обробку своєму базовому конвеєру, тому поведінка, валідація та контракт виводу відповідають базовому інструменту, зазначеному нижче.

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Надсилайте `multipart/form-data` із частиною `file` та необов'язковим JSON-рядком `settings`. Пресети дотримуються контракту відповіді базового інструменту. Швидкі пресети зазвичай повертають `200` із `downloadUrl`, але можуть повернути `202`, якщо перевищать вікно синхронного очікування. Відеопресети та тривалі пресети для файлів/документів повертають `202` і потоки прогресу з `/api/v1/jobs/<jobId>/progress`. Пресети PDF-to-image повертають URL-адреси завантаження сторінок плюс URL-адресу ZIP.

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG у PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG у JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG у WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG у WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP у JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP у PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG у AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG у AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP у AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC у JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC у PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC у AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG у GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG у GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF у JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF у PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP у GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG у TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG у TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF у JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF у PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD у JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD у PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG у EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG у EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS у PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS у JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG у SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG у SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | none |
| `tiff-to-svg` | TIFF у SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | none |
| `psd-to-svg` | PSD у SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS у SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG у PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG у JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG у PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG у PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC у PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF у PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP у PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF у PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS у PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV у MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM у MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV у MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI у MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 у MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 у WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM у MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV у MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI у MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 у AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV у AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV у AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI у MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 у GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV у GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV у GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI у GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF у MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF у WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF у MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 у MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV у MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV у MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM у MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI у MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 у WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV у WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 у OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |
| `srt-to-vtt` | SRT у VTT | `/api/v1/tools/video/srt-to-vtt` | `convert-subtitles` | `.srt` | none |
| `vtt-to-srt` | VTT у SRT | `/api/v1/tools/video/vtt-to-srt` | `convert-subtitles` | `.vtt` | none |
| `ass-to-srt` | ASS у SRT | `/api/v1/tools/video/ass-to-srt` | `convert-subtitles` | `.ass` | none |
| `srt-to-ass` | SRT у ASS | `/api/v1/tools/video/srt-to-ass` | `convert-subtitles` | `.srt` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A у MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A у WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC у MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC у WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC у FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG у MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG у WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV у MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 у WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC у MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |
| `mp3-to-flac` | MP3 у FLAC | `/api/v1/tools/audio/mp3-to-flac` | `convert-audio` | `.mp3` | none |
| `mp3-to-ogg` | MP3 у OGG | `/api/v1/tools/audio/mp3-to-ogg` | `convert-audio` | `.mp3` | none |
| `mp3-to-m4a` | MP3 у M4A | `/api/v1/tools/audio/mp3-to-m4a` | `convert-audio` | `.mp3` | none |
| `wav-to-flac` | WAV у FLAC | `/api/v1/tools/audio/wav-to-flac` | `convert-audio` | `.wav` | none |
| `wav-to-ogg` | WAV у OGG | `/api/v1/tools/audio/wav-to-ogg` | `convert-audio` | `.wav` | none |
| `wav-to-m4a` | WAV у M4A | `/api/v1/tools/audio/wav-to-m4a` | `convert-audio` | `.wav` | none |
| `flac-to-wav` | FLAC у WAV | `/api/v1/tools/audio/flac-to-wav` | `convert-audio` | `.flac` | none |
| `flac-to-ogg` | FLAC у OGG | `/api/v1/tools/audio/flac-to-ogg` | `convert-audio` | `.flac` | none |
| `flac-to-m4a` | FLAC у M4A | `/api/v1/tools/audio/flac-to-m4a` | `convert-audio` | `.flac` | none |
| `ogg-to-flac` | OGG у FLAC | `/api/v1/tools/audio/ogg-to-flac` | `convert-audio` | `.ogg` | none |
| `ogg-to-m4a` | OGG у M4A | `/api/v1/tools/audio/ogg-to-m4a` | `convert-audio` | `.ogg` | none |
| `m4a-to-flac` | M4A у FLAC | `/api/v1/tools/audio/m4a-to-flac` | `convert-audio` | `.m4a` | none |
| `m4a-to-ogg` | M4A у OGG | `/api/v1/tools/audio/m4a-to-ogg` | `convert-audio` | `.m4a` | none |
| `aac-to-ogg` | AAC у OGG | `/api/v1/tools/audio/aac-to-ogg` | `convert-audio` | `.aac` | none |
| `aac-to-m4a` | AAC у M4A | `/api/v1/tools/audio/aac-to-m4a` | `convert-audio` | `.aac` | none |
| `opus-to-mp3` | Opus у MP3 | `/api/v1/tools/audio/opus-to-mp3` | `convert-audio` | `.opus` | none |
| `opus-to-wav` | Opus у WAV | `/api/v1/tools/audio/opus-to-wav` | `convert-audio` | `.opus` | none |
| `opus-to-flac` | Opus у FLAC | `/api/v1/tools/audio/opus-to-flac` | `convert-audio` | `.opus` | none |
| `opus-to-ogg` | Opus у OGG | `/api/v1/tools/audio/opus-to-ogg` | `convert-audio` | `.opus` | none |
| `opus-to-m4a` | Opus у M4A | `/api/v1/tools/audio/opus-to-m4a` | `convert-audio` | `.opus` | none |
| `wma-to-mp3` | WMA у MP3 | `/api/v1/tools/audio/wma-to-mp3` | `convert-audio` | `.wma` | none |
| `wma-to-wav` | WMA у WAV | `/api/v1/tools/audio/wma-to-wav` | `convert-audio` | `.wma` | none |
| `wma-to-flac` | WMA у FLAC | `/api/v1/tools/audio/wma-to-flac` | `convert-audio` | `.wma` | none |
| `wma-to-ogg` | WMA у OGG | `/api/v1/tools/audio/wma-to-ogg` | `convert-audio` | `.wma` | none |
| `wma-to-m4a` | WMA у M4A | `/api/v1/tools/audio/wma-to-m4a` | `convert-audio` | `.wma` | none |
| `aiff-to-mp3` | AIFF у MP3 | `/api/v1/tools/audio/aiff-to-mp3` | `convert-audio` | `.aiff` | none |
| `aiff-to-wav` | AIFF у WAV | `/api/v1/tools/audio/aiff-to-wav` | `convert-audio` | `.aiff` | none |
| `aiff-to-flac` | AIFF у FLAC | `/api/v1/tools/audio/aiff-to-flac` | `convert-audio` | `.aiff` | none |
| `aiff-to-ogg` | AIFF у OGG | `/api/v1/tools/audio/aiff-to-ogg` | `convert-audio` | `.aiff` | none |
| `aiff-to-m4a` | AIFF у M4A | `/api/v1/tools/audio/aiff-to-m4a` | `convert-audio` | `.aiff` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF у JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF у PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF у TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel у CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | none |

## Notes {#notes}

- Пресети є повноцінними кінцевими точками API і також дійсні в пакетних запитах, де їхній базовий маршрут підтримує пакетну обробку.
- Пресети, що використовують відеоконвертацію, можуть повертати `202 Accepted`; під'єднайтеся до кінцевої точки SSE прогресу завдання перед завантаженням результату.
- Для розширених опцій, не доступних через пресет, викличте базовий інструмент-конвертер безпосередньо та встановіть формат виводу в `settings`.
