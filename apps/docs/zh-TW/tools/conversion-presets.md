---
description: "從 SnapOtter 工具目錄產生的專用轉換預設端點。"
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: 4dde4980da6b
---

# 轉換預設 {#conversion-presets}

除了基礎轉換工具之外，SnapOtter 還提供 83 個專用的轉換預設端點。每個預設都會鎖定輸出格式並委派給其基礎處理管線，因此行為、驗證與輸出約定都會與下方所列的基礎工具相符。

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

傳送 `multipart/form-data`，其中包含一個 `file` 部分以及選填的 `settings` JSON 字串。預設會遵循基礎工具的回應約定。快速預設通常會回傳 `200` 並帶有 `downloadUrl`，但若超過同步等待視窗，則可能回傳 `202`。影片預設以及長時間執行的檔案／文件預設會回傳 `202`，並從 `/api/v1/jobs/<jobId>/progress` 進行進度串流。PDF 轉影像的預設會回傳各頁的下載 URL 以及一個 ZIP URL。

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG 轉 PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-jpg` | PNG 轉 JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG 轉 WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-webp` | PNG 轉 WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP 轉 JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP 轉 PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG 轉 AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-avif` | PNG 轉 AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP 轉 AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC 轉 JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`、`.heif` | quality |
| `heic-to-png` | HEIC 轉 PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`、`.heif` | quality |
| `heic-to-avif` | HEIC 轉 AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`、`.heif` | quality |
| `jpg-to-gif` | JPG 轉 GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-gif` | PNG 轉 GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF 轉 JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF 轉 PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP 轉 GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG 轉 TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-tiff` | PNG 轉 TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF 轉 JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`、`.tif` | quality |
| `tiff-to-png` | TIFF 轉 PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`、`.tif` | quality |
| `psd-to-jpg` | PSD 轉 JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD 轉 PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG 轉 EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG 轉 EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`、`.jpeg` | quality |
| `eps-to-png` | EPS 轉 PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS 轉 JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG 轉 SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG 轉 SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`、`.jpeg` | none |
| `tiff-to-svg` | TIFF 轉 SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`、`.tif` | none |
| `psd-to-svg` | PSD 轉 SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS 轉 SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG 轉 PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`、`.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG 轉 JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`、`.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG 轉 PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`、`.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG 轉 PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC 轉 PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`、`.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF 轉 PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`、`.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP 轉 PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF 轉 PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS 轉 PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV 轉 MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM 轉 MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV 轉 MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI 轉 MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 轉 MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 轉 WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM 轉 MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV 轉 MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI 轉 MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 轉 AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV 轉 AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV 轉 AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI 轉 MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 轉 GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV 轉 GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV 轉 GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI 轉 GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF 轉 MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF 轉 WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF 轉 MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 轉 MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV 轉 MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV 轉 MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM 轉 MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI 轉 MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 轉 WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV 轉 WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 轉 OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A 轉 MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A 轉 WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC 轉 MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC 轉 WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC 轉 FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG 轉 MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG 轉 WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV 轉 MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 轉 WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC 轉 MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF 轉 JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF 轉 PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF 轉 TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel 轉 CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`、`.xls` | none |

## Notes {#notes}

- 預設是一等的 API 端點，並且在其基礎路由支援批次處理的情況下，也可用於批次請求中。
- 使用影片轉換的預設可能會回傳 `202 Accepted`；請在下載結果前連接到工作進度的 SSE 端點。
- 若需要預設未提供的進階選項，請直接呼叫基礎轉換工具，並在 `settings` 中設定輸出格式。
