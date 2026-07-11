---
description: "Speciale conversiepreset-endpoints gegenereerd uit de SnapOtter-toolcatalogus."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: cc9f15364d1f
---

# Conversion Presets {#conversion-presets}

SnapOtter biedt naast de basisconvertertools 83 speciale conversiepreset-endpoints. Elke preset vergrendelt het uitvoerformaat en delegeert naar de bijbehorende basisverwerkingspijplijn, zodat het gedrag, de validatie en het uitvoercontract overeenkomen met de hieronder vermelde basistool.

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Stuur `multipart/form-data` met een `file`-deel en een optionele `settings` JSON-string. Presets volgen het antwoordcontract van de basistool. Snelle presets retourneren meestal `200` met een `downloadUrl`, maar kunnen `202` retourneren als ze het synchrone wachtvenster overschrijden. Videopresets en langlopende bestands-/documentpresets retourneren `202` en voortgangsstreams van `/api/v1/jobs/<jobId>/progress`. PDF-naar-afbeeldingpresets retourneren download-URL's per pagina plus een ZIP-URL.

## Image Presets {#image-presets}

| Preset-ID | Converteert | Route | Basistool | Geaccepteerde invoer | Optionele instellingen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG naar PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG naar JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG naar WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG naar WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP naar JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP naar PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG naar AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG naar AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP naar AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC naar JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC naar PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC naar AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG naar GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG naar GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF naar JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF naar PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP naar GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG naar TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG naar TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF naar JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF naar PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD naar JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD naar PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG naar EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG naar EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS naar PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS naar JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG naar SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | geen |
| `jpg-to-svg` | JPG naar SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | geen |
| `tiff-to-svg` | TIFF naar SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | geen |
| `psd-to-svg` | PSD naar SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | geen |
| `eps-to-svg` | EPS naar SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | geen |
| `svg-to-png` | SVG naar PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG naar JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG naar PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG naar PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC naar PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF naar PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP naar PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF naar PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS naar PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset-ID | Converteert | Route | Basistool | Geaccepteerde invoer | Optionele instellingen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV naar MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM naar MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV naar MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI naar MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 naar MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 naar WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM naar MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV naar MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI naar MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 naar AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV naar AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV naar AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI naar MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 naar GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV naar GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV naar GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI naar GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF naar MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | geen |
| `gif-to-webm` | GIF naar WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | geen |
| `gif-to-mov` | GIF naar MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | geen |
| `mp4-to-mp3` | MP4 naar MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | geen |
| `mov-to-mp3` | MOV naar MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | geen |
| `mkv-to-mp3` | MKV naar MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | geen |
| `webm-to-mp3` | WEBM naar MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | geen |
| `avi-to-mp3` | AVI naar MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | geen |
| `mp4-to-wav` | MP4 naar WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | geen |
| `mov-to-wav` | MOV naar WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | geen |
| `mp4-to-ogg` | MP4 naar OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | geen |

## Audio Presets {#audio-presets}

| Preset-ID | Converteert | Route | Basistool | Geaccepteerde invoer | Optionele instellingen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A naar MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | geen |
| `m4a-to-wav` | M4A naar WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | geen |
| `aac-to-mp3` | AAC naar MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | geen |
| `aac-to-wav` | AAC naar WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | geen |
| `aac-to-flac` | AAC naar FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | geen |
| `ogg-to-mp3` | OGG naar MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | geen |
| `ogg-to-wav` | OGG naar WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | geen |
| `wav-to-mp3` | WAV naar MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | geen |
| `mp3-to-wav` | MP3 naar WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | geen |
| `flac-to-mp3` | FLAC naar MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | geen |

## PDF Presets {#pdf-presets}

| Preset-ID | Converteert | Route | Basistool | Geaccepteerde invoer | Optionele instellingen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF naar JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF naar PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF naar TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset-ID | Converteert | Route | Basistool | Geaccepteerde invoer | Optionele instellingen |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel naar CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | geen |

## Notes {#notes}

- Presets zijn eersteklas API-endpoints en zijn ook geldig in batchverzoeken waar hun basisroute batchverwerking ondersteunt.
- Presets die videoconversie gebruiken, kunnen `202 Accepted` retourneren; maak verbinding met het SSE-endpoint voor taakvoortgang voordat je het resultaat downloadt.
- Voor geavanceerde opties die niet door een preset worden aangeboden, roep je de basisconvertertool rechtstreeks aan en stel je het uitvoerformaat in via `settings`.
