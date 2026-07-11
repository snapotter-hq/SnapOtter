---
description: "Dedizierte Konvertierungs-Preset-Endpunkte, generiert aus dem SnapOtter-Tool-Katalog."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: 28080b85604b
---

# Conversion Presets {#conversion-presets}

SnapOtter stellt zusätzlich zu den Basis-Konverter-Tools 83 dedizierte Konvertierungs-Preset-Endpunkte bereit. Jedes Preset legt das Ausgabeformat fest und delegiert an seine Basis-Verarbeitungspipeline, sodass Verhalten, Validierung und Ausgabekontrakt dem unten aufgeführten Basis-Tool entsprechen.

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Sende `multipart/form-data` mit einem `file`-Teil und einem optionalen JSON-String `settings`. Presets folgen dem Antwortkontrakt des Basis-Tools. Schnelle Presets geben in der Regel `200` mit einer `downloadUrl` zurück, können aber `202` zurückgeben, wenn sie das synchrone Wartefenster überschreiten. Video-Presets und lange Datei-/Dokument-Presets geben `202` zurück und streamen den Fortschritt von `/api/v1/jobs/<jobId>/progress`. PDF-zu-Bild-Presets geben Download-URLs für die Seiten plus eine ZIP-URL zurück.

## Image Presets {#image-presets}

| Preset-ID | Konvertiert | Route | Basis-Tool | Akzeptierte Eingaben | Optionale Einstellungen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG zu PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG zu JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG zu WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG zu WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP zu JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP zu PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG zu AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG zu AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP zu AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC zu JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC zu PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC zu AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG zu GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG zu GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF zu JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF zu PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP zu GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG zu TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG zu TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF zu JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF zu PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD zu JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD zu PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG zu EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG zu EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS zu PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS zu JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG zu SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | keine |
| `jpg-to-svg` | JPG zu SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | keine |
| `tiff-to-svg` | TIFF zu SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | keine |
| `psd-to-svg` | PSD zu SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | keine |
| `eps-to-svg` | EPS zu SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | keine |
| `svg-to-png` | SVG zu PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG zu JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG zu PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG zu PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC zu PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF zu PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP zu PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF zu PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS zu PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset-ID | Konvertiert | Route | Basis-Tool | Akzeptierte Eingaben | Optionale Einstellungen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV zu MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM zu MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV zu MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI zu MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 zu MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 zu WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM zu MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV zu MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI zu MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 zu AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV zu AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV zu AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI zu MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 zu GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV zu GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV zu GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI zu GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF zu MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | keine |
| `gif-to-webm` | GIF zu WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | keine |
| `gif-to-mov` | GIF zu MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | keine |
| `mp4-to-mp3` | MP4 zu MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | keine |
| `mov-to-mp3` | MOV zu MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | keine |
| `mkv-to-mp3` | MKV zu MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | keine |
| `webm-to-mp3` | WEBM zu MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | keine |
| `avi-to-mp3` | AVI zu MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | keine |
| `mp4-to-wav` | MP4 zu WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | keine |
| `mov-to-wav` | MOV zu WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | keine |
| `mp4-to-ogg` | MP4 zu OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | keine |

## Audio Presets {#audio-presets}

| Preset-ID | Konvertiert | Route | Basis-Tool | Akzeptierte Eingaben | Optionale Einstellungen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A zu MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | keine |
| `m4a-to-wav` | M4A zu WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | keine |
| `aac-to-mp3` | AAC zu MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | keine |
| `aac-to-wav` | AAC zu WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | keine |
| `aac-to-flac` | AAC zu FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | keine |
| `ogg-to-mp3` | OGG zu MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | keine |
| `ogg-to-wav` | OGG zu WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | keine |
| `wav-to-mp3` | WAV zu MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | keine |
| `mp3-to-wav` | MP3 zu WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | keine |
| `flac-to-mp3` | FLAC zu MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | keine |

## PDF Presets {#pdf-presets}

| Preset-ID | Konvertiert | Route | Basis-Tool | Akzeptierte Eingaben | Optionale Einstellungen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF zu JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF zu PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF zu TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset-ID | Konvertiert | Route | Basis-Tool | Akzeptierte Eingaben | Optionale Einstellungen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel zu CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | keine |

## Notes {#notes}

- Presets sind vollwertige API-Endpunkte und auch in Batch-Anfragen gültig, sofern ihre Basis-Route die Batch-Verarbeitung unterstützt.
- Presets, die Videokonvertierung nutzen, können `202 Accepted` zurückgeben; verbinde dich mit dem SSE-Endpunkt für den Job-Fortschritt, bevor du das Ergebnis herunterlädst.
- Für erweiterte Optionen, die ein Preset nicht bereitstellt, rufe das Basis-Konverter-Tool direkt auf und lege das Ausgabeformat in `settings` fest.
