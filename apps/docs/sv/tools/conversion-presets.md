---
description: "Dedikerade konverteringsförinställningsslutpunkter genererade från SnapOtters verktygskatalog."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: df94ff3dae8c
---

# Conversion Presets {#conversion-presets}

SnapOtter exponerar 83 dedikerade konverteringsförinställningsslutpunkter utöver bas-konverteringsverktygen. Varje förinställning låser utdataformatet och delegerar till sin bas-bearbetningspipeline, så att beteendet, valideringen och utdatakontraktet matchar bas-verktyget som listas nedan.

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Skicka `multipart/form-data` med en `file`-del och en valfri JSON-sträng `settings`. Förinställningar följer bas-verktygets svarskontrakt. Snabba förinställningar returnerar vanligtvis `200` med en `downloadUrl`, men kan returnera `202` om de överskrider det synkrona väntefönstret. Videoförinställningar och långa fil-/dokumentförinställningar returnerar `202` och förloppsströmmar från `/api/v1/jobs/<jobId>/progress`. PDF-till-bild-förinställningar returnerar nedladdnings-URL:er för sidorna plus en ZIP-URL.

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG till PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG till JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG till WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG till WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP till JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP till PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG till AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG till AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP till AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC till JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC till PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC till AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG till GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG till GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF till JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF till PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP till GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG till TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG till TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF till JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF till PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD till JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD till PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG till EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG till EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS till PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS till JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG till SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG till SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | none |
| `tiff-to-svg` | TIFF till SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | none |
| `psd-to-svg` | PSD till SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS till SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG till PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG till JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG till PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG till PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC till PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF till PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP till PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF till PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS till PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV till MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM till MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV till MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI till MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 till MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 till WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM till MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV till MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI till MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 till AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV till AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV till AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI till MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 till GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV till GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV till GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI till GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF till MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF till WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF till MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 till MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV till MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV till MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM till MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI till MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 till WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV till WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 till OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A till MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A till WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC till MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC till WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC till FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG till MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG till WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV till MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 till WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC till MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF till JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF till PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF till TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel till CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | none |

## Notes {#notes}

- Förinställningar är förstklassiga API-slutpunkter och är även giltiga i batch-förfrågningar där deras bas-route stöder batch-bearbetning.
- Förinställningar som använder videokonvertering kan returnera `202 Accepted`; anslut till jobbets förlopps-SSE-slutpunkt innan du laddar ner resultatet.
- För avancerade alternativ som inte exponeras av en förinställning, anropa bas-konverteringsverktyget direkt och ange utdataformatet i `settings`.
