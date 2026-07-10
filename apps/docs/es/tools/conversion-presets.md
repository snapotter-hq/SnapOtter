---
description: "Endpoints de preajustes de conversión dedicados generados a partir del catálogo de herramientas de SnapOtter."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: 3d4598d97958
---

# Preajustes de conversión {#conversion-presets}

SnapOtter expone 83 endpoints de preajustes de conversión dedicados además de las herramientas convertidoras base. Cada preajuste fija el formato de salida y delega en su canalización de procesamiento base, por lo que el comportamiento, la validación y el contrato de salida coinciden con la herramienta base indicada a continuación.

## Patrón del API Endpoint {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Envía `multipart/form-data` con una parte `file` y una cadena JSON `settings` opcional. Los preajustes siguen el contrato de respuesta de la herramienta base. Los preajustes rápidos suelen devolver `200` con un `downloadUrl`, pero pueden devolver `202` si superan la ventana de espera síncrona. Los preajustes de video y los preajustes largos de archivo/documento devuelven `202` y flujos de progreso desde `/api/v1/jobs/<jobId>/progress`. Los preajustes de PDF a imagen devuelven las URL de descarga de las páginas más una URL de ZIP.

## Preajustes de imagen {#image-presets}

| ID de preajuste | Convierte | Ruta | Herramienta base | Entradas aceptadas | Ajustes opcionales |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG a PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG a JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG a WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG a WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP a JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP a PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG a AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG a AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP a AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC a JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC a PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC a AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG a GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG a GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF a JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF a PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP a GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG a TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG a TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF a JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF a PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD a JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD a PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG a EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG a EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS a PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS a JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG a SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | ninguno |
| `jpg-to-svg` | JPG a SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | ninguno |
| `tiff-to-svg` | TIFF a SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | ninguno |
| `psd-to-svg` | PSD a SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | ninguno |
| `eps-to-svg` | EPS a SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | ninguno |
| `svg-to-png` | SVG a PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG a JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG a PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG a PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC a PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF a PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP a PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF a PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS a PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Preajustes de video {#video-presets}

| ID de preajuste | Convierte | Ruta | Herramienta base | Entradas aceptadas | Ajustes opcionales |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV a MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM a MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV a MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI a MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 a MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 a WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM a MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV a MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI a MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 a AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV a AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV a AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI a MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 a GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV a GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV a GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI a GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF a MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | ninguno |
| `gif-to-webm` | GIF a WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | ninguno |
| `gif-to-mov` | GIF a MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | ninguno |
| `mp4-to-mp3` | MP4 a MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | ninguno |
| `mov-to-mp3` | MOV a MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | ninguno |
| `mkv-to-mp3` | MKV a MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | ninguno |
| `webm-to-mp3` | WEBM a MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | ninguno |
| `avi-to-mp3` | AVI a MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | ninguno |
| `mp4-to-wav` | MP4 a WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | ninguno |
| `mov-to-wav` | MOV a WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | ninguno |
| `mp4-to-ogg` | MP4 a OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | ninguno |

## Preajustes de audio {#audio-presets}

| ID de preajuste | Convierte | Ruta | Herramienta base | Entradas aceptadas | Ajustes opcionales |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A a MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | ninguno |
| `m4a-to-wav` | M4A a WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | ninguno |
| `aac-to-mp3` | AAC a MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | ninguno |
| `aac-to-wav` | AAC a WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | ninguno |
| `aac-to-flac` | AAC a FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | ninguno |
| `ogg-to-mp3` | OGG a MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | ninguno |
| `ogg-to-wav` | OGG a WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | ninguno |
| `wav-to-mp3` | WAV a MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | ninguno |
| `mp3-to-wav` | MP3 a WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | ninguno |
| `flac-to-mp3` | FLAC a MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | ninguno |

## Preajustes de PDF {#pdf-presets}

| ID de preajuste | Convierte | Ruta | Herramienta base | Entradas aceptadas | Ajustes opcionales |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF a JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF a PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF a TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Preajustes de Files {#files-presets}

| ID de preajuste | Convierte | Ruta | Herramienta base | Entradas aceptadas | Ajustes opcionales |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel a CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | ninguno |

## Notas {#notes}

- Los preajustes son endpoints de API de primera clase y también son válidos en solicitudes por lotes donde su ruta base admite el procesamiento por lotes.
- Los preajustes que usan conversión de video pueden devolver `202 Accepted`; conéctate al endpoint SSE de progreso del trabajo antes de descargar el resultado.
- Para opciones avanzadas que un preajuste no expone, llama directamente a la herramienta convertidora base y define el formato de salida en `settings`.
