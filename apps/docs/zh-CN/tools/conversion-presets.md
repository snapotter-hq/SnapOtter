---
description: "由 SnapOtter 工具目录生成的专用转换预设端点。"
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: 79839a307027
---

# Conversion Presets {#conversion-presets}

除了基础转换器工具外，SnapOtter 还提供 83 个专用的转换预设端点。每个预设锁定输出格式并委托给其基础处理流程，因此其行为、校验和输出约定与下面列出的基础工具一致。

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

发送 `multipart/form-data`，其中包含一个 `file` 部分和可选的 `settings` JSON 字符串。预设遵循基础工具的响应约定。快速预设通常返回 `200` 及一个 `downloadUrl`，但如果超出同步等待窗口，则可能返回 `202`。视频预设以及耗时较长的文件/文档预设返回 `202`，并从 `/api/v1/jobs/<jobId>/progress` 提供进度流。PDF 转图片预设返回各页的下载 URL 加一个 ZIP URL。

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG 转 PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-jpg` | PNG 转 JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG 转 WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-webp` | PNG 转 WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP 转 JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP 转 PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG 转 AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-avif` | PNG 转 AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP 转 AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC 转 JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`、`.heif` | quality |
| `heic-to-png` | HEIC 转 PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`、`.heif` | quality |
| `heic-to-avif` | HEIC 转 AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`、`.heif` | quality |
| `jpg-to-gif` | JPG 转 GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-gif` | PNG 转 GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF 转 JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF 转 PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP 转 GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG 转 TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-tiff` | PNG 转 TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF 转 JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`、`.tif` | quality |
| `tiff-to-png` | TIFF 转 PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`、`.tif` | quality |
| `psd-to-jpg` | PSD 转 JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD 转 PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG 转 EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG 转 EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`、`.jpeg` | quality |
| `eps-to-png` | EPS 转 PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS 转 JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG 转 SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG 转 SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`、`.jpeg` | none |
| `tiff-to-svg` | TIFF 转 SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`、`.tif` | none |
| `psd-to-svg` | PSD 转 SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS 转 SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG 转 PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`、`.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG 转 JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`、`.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG 转 PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`、`.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG 转 PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC 转 PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`、`.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF 转 PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`、`.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP 转 PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF 转 PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS 转 PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV 转 MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM 转 MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV 转 MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI 转 MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 转 MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 转 WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM 转 MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV 转 MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI 转 MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 转 AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV 转 AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV 转 AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI 转 MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 转 GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV 转 GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV 转 GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI 转 GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF 转 MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF 转 WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF 转 MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 转 MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV 转 MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV 转 MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM 转 MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI 转 MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 转 WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV 转 WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 转 OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A 转 MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A 转 WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC 转 MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC 转 WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC 转 FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG 转 MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG 转 WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV 转 MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 转 WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC 转 MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF 转 JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF 转 PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF 转 TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel 转 CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`、`.xls` | none |

## Notes {#notes}

- 预设是一等的 API 端点，在其基础路由支持批处理的场景下，也可用于批处理请求。
- 使用视频转换的预设可能返回 `202 Accepted`；在下载结果前，请连接到作业进度 SSE 端点。
- 对于预设未暴露的高级选项，可直接调用基础转换器工具，并在 `settings` 中设置输出格式。
