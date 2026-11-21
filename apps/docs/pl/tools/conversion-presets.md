---
description: "Dedykowane endpointy predefiniowanych konwersji generowane z katalogu narzędzi SnapOtter."
i18n_source_hash: a9dcab4c4e81
i18n_provenance: human
i18n_output_hash: 7a0c1d9c47b5
i18n_hash_version: 2
---

# Conversion Presets {#conversion-presets}

SnapOtter udostępnia 117 dedykowanych endpointów predefiniowanych konwersji oprócz podstawowych narzędzi konwertujących. Każdy preset blokuje format wyjściowy i deleguje do swojego podstawowego potoku przetwarzania, więc jego zachowanie, walidacja i kontrakt wyjściowy odpowiadają narzędziu podstawowemu wymienionemu poniżej.

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Wyślij `multipart/form-data` z częścią `file` oraz opcjonalnym ciągiem JSON `settings`. Presety stosują kontrakt odpowiedzi narzędzia podstawowego. Szybkie presety zwykle zwracają `200` z `downloadUrl`, ale mogą zwrócić `202`, jeśli przekroczą synchroniczne okno oczekiwania. Presety wideo oraz długie presety plików/dokumentów zwracają `202` i strumienie postępu z `/api/v1/jobs/<jobId>/progress`. Presety PDF-do-obrazu zwracają adresy URL do pobrania stron oraz adres URL ZIP.

## Image Presets {#image-presets}

| ID presetu | Konwertuje | Trasa | Narzędzie podstawowe | Akceptowane wejścia | Ustawienia opcjonalne |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG na PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG na JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG na WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG na WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP na JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP na PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG na AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG na AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP na AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC na JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC na PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC na AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG na GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG na GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF na JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF na PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP na GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG na TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG na TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF na JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF na PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD na JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD na PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG na EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG na EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS na PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS na JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG na SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | brak |
| `jpg-to-svg` | JPG na SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | brak |
| `tiff-to-svg` | TIFF na SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | brak |
| `psd-to-svg` | PSD na SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | brak |
| `eps-to-svg` | EPS na SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | brak |
| `svg-to-png` | SVG na PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG na JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG na PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG na PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC na PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF na PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP na PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF na PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS na PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| ID presetu | Konwertuje | Trasa | Narzędzie podstawowe | Akceptowane wejścia | Ustawienia opcjonalne |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV na MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM na MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV na MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI na MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 na MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 na WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM na MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV na MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI na MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 na AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV na AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV na AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI na MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 na GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV na GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV na GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI na GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF na MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | brak |
| `gif-to-webm` | GIF na WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | brak |
| `gif-to-mov` | GIF na MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | brak |
| `mp4-to-mp3` | MP4 na MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | brak |
| `mov-to-mp3` | MOV na MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | brak |
| `mkv-to-mp3` | MKV na MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | brak |
| `webm-to-mp3` | WEBM na MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | brak |
| `avi-to-mp3` | AVI na MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | brak |
| `mp4-to-wav` | MP4 na WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | brak |
| `mov-to-wav` | MOV na WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | brak |
| `mp4-to-ogg` | MP4 na OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | brak |
| `srt-to-vtt` | SRT na VTT | `/api/v1/tools/video/srt-to-vtt` | `convert-subtitles` | `.srt` | brak |
| `vtt-to-srt` | VTT na SRT | `/api/v1/tools/video/vtt-to-srt` | `convert-subtitles` | `.vtt` | brak |
| `ass-to-srt` | ASS na SRT | `/api/v1/tools/video/ass-to-srt` | `convert-subtitles` | `.ass` | brak |
| `srt-to-ass` | SRT na ASS | `/api/v1/tools/video/srt-to-ass` | `convert-subtitles` | `.srt` | brak |

## Audio Presets {#audio-presets}

| ID presetu | Konwertuje | Trasa | Narzędzie podstawowe | Akceptowane wejścia | Ustawienia opcjonalne |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A na MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | brak |
| `m4a-to-wav` | M4A na WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | brak |
| `aac-to-mp3` | AAC na MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | brak |
| `aac-to-wav` | AAC na WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | brak |
| `aac-to-flac` | AAC na FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | brak |
| `ogg-to-mp3` | OGG na MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | brak |
| `ogg-to-wav` | OGG na WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | brak |
| `wav-to-mp3` | WAV na MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | brak |
| `mp3-to-wav` | MP3 na WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | brak |
| `flac-to-mp3` | FLAC na MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | brak |
| `mp3-to-flac` | MP3 na FLAC | `/api/v1/tools/audio/mp3-to-flac` | `convert-audio` | `.mp3` | brak |
| `mp3-to-ogg` | MP3 na OGG | `/api/v1/tools/audio/mp3-to-ogg` | `convert-audio` | `.mp3` | brak |
| `mp3-to-m4a` | MP3 na M4A | `/api/v1/tools/audio/mp3-to-m4a` | `convert-audio` | `.mp3` | brak |
| `wav-to-flac` | WAV na FLAC | `/api/v1/tools/audio/wav-to-flac` | `convert-audio` | `.wav` | brak |
| `wav-to-ogg` | WAV na OGG | `/api/v1/tools/audio/wav-to-ogg` | `convert-audio` | `.wav` | brak |
| `wav-to-m4a` | WAV na M4A | `/api/v1/tools/audio/wav-to-m4a` | `convert-audio` | `.wav` | brak |
| `flac-to-wav` | FLAC na WAV | `/api/v1/tools/audio/flac-to-wav` | `convert-audio` | `.flac` | brak |
| `flac-to-ogg` | FLAC na OGG | `/api/v1/tools/audio/flac-to-ogg` | `convert-audio` | `.flac` | brak |
| `flac-to-m4a` | FLAC na M4A | `/api/v1/tools/audio/flac-to-m4a` | `convert-audio` | `.flac` | brak |
| `ogg-to-flac` | OGG na FLAC | `/api/v1/tools/audio/ogg-to-flac` | `convert-audio` | `.ogg` | brak |
| `ogg-to-m4a` | OGG na M4A | `/api/v1/tools/audio/ogg-to-m4a` | `convert-audio` | `.ogg` | brak |
| `m4a-to-flac` | M4A na FLAC | `/api/v1/tools/audio/m4a-to-flac` | `convert-audio` | `.m4a` | brak |
| `m4a-to-ogg` | M4A na OGG | `/api/v1/tools/audio/m4a-to-ogg` | `convert-audio` | `.m4a` | brak |
| `aac-to-ogg` | AAC na OGG | `/api/v1/tools/audio/aac-to-ogg` | `convert-audio` | `.aac` | brak |
| `aac-to-m4a` | AAC na M4A | `/api/v1/tools/audio/aac-to-m4a` | `convert-audio` | `.aac` | brak |
| `opus-to-mp3` | Opus na MP3 | `/api/v1/tools/audio/opus-to-mp3` | `convert-audio` | `.opus` | brak |
| `opus-to-wav` | Opus na WAV | `/api/v1/tools/audio/opus-to-wav` | `convert-audio` | `.opus` | brak |
| `opus-to-flac` | Opus na FLAC | `/api/v1/tools/audio/opus-to-flac` | `convert-audio` | `.opus` | brak |
| `opus-to-ogg` | Opus na OGG | `/api/v1/tools/audio/opus-to-ogg` | `convert-audio` | `.opus` | brak |
| `opus-to-m4a` | Opus na M4A | `/api/v1/tools/audio/opus-to-m4a` | `convert-audio` | `.opus` | brak |
| `wma-to-mp3` | WMA na MP3 | `/api/v1/tools/audio/wma-to-mp3` | `convert-audio` | `.wma` | brak |
| `wma-to-wav` | WMA na WAV | `/api/v1/tools/audio/wma-to-wav` | `convert-audio` | `.wma` | brak |
| `wma-to-flac` | WMA na FLAC | `/api/v1/tools/audio/wma-to-flac` | `convert-audio` | `.wma` | brak |
| `wma-to-ogg` | WMA na OGG | `/api/v1/tools/audio/wma-to-ogg` | `convert-audio` | `.wma` | brak |
| `wma-to-m4a` | WMA na M4A | `/api/v1/tools/audio/wma-to-m4a` | `convert-audio` | `.wma` | brak |
| `aiff-to-mp3` | AIFF na MP3 | `/api/v1/tools/audio/aiff-to-mp3` | `convert-audio` | `.aiff` | brak |
| `aiff-to-wav` | AIFF na WAV | `/api/v1/tools/audio/aiff-to-wav` | `convert-audio` | `.aiff` | brak |
| `aiff-to-flac` | AIFF na FLAC | `/api/v1/tools/audio/aiff-to-flac` | `convert-audio` | `.aiff` | brak |
| `aiff-to-ogg` | AIFF na OGG | `/api/v1/tools/audio/aiff-to-ogg` | `convert-audio` | `.aiff` | brak |
| `aiff-to-m4a` | AIFF na M4A | `/api/v1/tools/audio/aiff-to-m4a` | `convert-audio` | `.aiff` | brak |

## PDF Presets {#pdf-presets}

| ID presetu | Konwertuje | Trasa | Narzędzie podstawowe | Akceptowane wejścia | Ustawienia opcjonalne |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF na JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF na PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF na TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| ID presetu | Konwertuje | Trasa | Narzędzie podstawowe | Akceptowane wejścia | Ustawienia opcjonalne |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel na CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | brak |
| `otf-to-ttf` | OTF na TTF | `/api/v1/tools/files/otf-to-ttf` | `convert-font` | `.otf` | brak |
| `woff-to-ttf` | WOFF na TTF | `/api/v1/tools/files/woff-to-ttf` | `convert-font` | `.woff` | brak |
| `woff2-to-ttf` | WOFF2 na TTF | `/api/v1/tools/files/woff2-to-ttf` | `convert-font` | `.woff2` | brak |
| `ttf-to-woff2` | TTF na WOFF2 | `/api/v1/tools/files/ttf-to-woff2` | `convert-font` | `.ttf`, `.otf` | brak |

## Notes {#notes}

- Presety są pełnoprawnymi endpointami API i są też ważne w żądaniach wsadowych, o ile ich trasa podstawowa obsługuje przetwarzanie wsadowe.
- Presety korzystające z konwersji wideo mogą zwrócić `202 Accepted`; połącz się z endpointem SSE postępu zadania przed pobraniem wyniku.
- W przypadku opcji zaawansowanych nieudostępnianych przez preset wywołaj bezpośrednio podstawowe narzędzie konwertujące i ustaw format wyjściowy w `settings`.
