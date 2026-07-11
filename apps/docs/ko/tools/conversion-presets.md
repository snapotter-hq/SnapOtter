---
description: "SnapOtter 도구 카탈로그에서 생성된 전용 변환 프리셋 엔드포인트."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: 6389ae7ec3bb
---

# 변환 프리셋 {#conversion-presets}

SnapOtter는 기본 변환기 도구 외에도 83개의 전용 변환 프리셋 엔드포인트를 제공합니다. 각 프리셋은 출력 형식을 고정하고 기본 처리 파이프라인에 위임하므로, 동작, 검증, 출력 계약이 아래에 나열된 기본 도구와 일치합니다.

## API 엔드포인트 패턴 {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

`file` 파트와 선택적 `settings` JSON 문자열을 포함하여 `multipart/form-data`를 전송하세요. 프리셋은 기본 도구의 응답 계약을 따릅니다. 빠른 프리셋은 보통 `downloadUrl`와 함께 `200`를 반환하지만, 동기 대기 창을 초과하면 `202`을 반환할 수 있습니다. 비디오 프리셋과 긴 파일/문서 프리셋은 `202`을 반환하고 `/api/v1/jobs/<jobId>/progress`에서 진행 상황을 스트리밍합니다. PDF-to-image 프리셋은 페이지 다운로드 URL과 ZIP URL을 반환합니다.

## 이미지 프리셋 {#image-presets}

| 프리셋 ID | 변환 | 라우트 | 기본 도구 | 허용 입력 | 선택 설정 |
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

## 비디오 프리셋 {#video-presets}

| 프리셋 ID | 변환 | 라우트 | 기본 도구 | 허용 입력 | 선택 설정 |
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

## 오디오 프리셋 {#audio-presets}

| 프리셋 ID | 변환 | 라우트 | 기본 도구 | 허용 입력 | 선택 설정 |
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

## PDF 프리셋 {#pdf-presets}

| 프리셋 ID | 변환 | 라우트 | 기본 도구 | 허용 입력 | 선택 설정 |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF to JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF to PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF to TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files 프리셋 {#files-presets}

| 프리셋 ID | 변환 | 라우트 | 기본 도구 | 허용 입력 | 선택 설정 |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel to CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | none |

## 참고 사항 {#notes}

- 프리셋은 일급 API 엔드포인트이며, 기본 라우트가 배치 처리를 지원하는 경우 배치 요청에서도 유효합니다.
- 비디오 변환을 사용하는 프리셋은 `202 Accepted`을 반환할 수 있습니다. 결과를 다운로드하기 전에 작업 진행 상황 SSE 엔드포인트에 연결하세요.
- 프리셋이 노출하지 않는 고급 옵션은 기본 변환기 도구를 직접 호출하고 `settings`에서 출력 형식을 설정하세요.
