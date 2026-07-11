---
description: "Endpoints de predefinições de conversão dedicados, gerados a partir do catálogo de ferramentas do SnapOtter."
i18n_source_hash: faad6efcb9a9
i18n_provenance: human
i18n_output_hash: ba6a5cf43488
---

# Predefinições de Conversão {#conversion-presets}

O SnapOtter expõe 83 endpoints de predefinições de conversão dedicados, além das ferramentas conversoras base. Cada predefinição fixa o formato de saída e delega ao seu pipeline de processamento base, de modo que o comportamento, a validação e o contrato de saída correspondam à ferramenta base listada abaixo.

## Padrão de Endpoint da API {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

Envie `multipart/form-data` com uma parte `file` e uma string JSON opcional `settings`. As predefinições seguem o contrato de resposta da ferramenta base. Predefinições rápidas geralmente retornam `200` com um `downloadUrl`, mas podem retornar `202` se excederem a janela de espera síncrona. Predefinições de vídeo e predefinições longas de arquivo/documento retornam `202` e transmitem o progresso a partir de `/api/v1/jobs/<jobId>/progress`. Predefinições de PDF para imagem retornam URLs de download por página, além de uma URL de ZIP.

## Predefinições de Imagem {#image-presets}

| ID da Predefinição | Converte | Rota | Ferramenta base | Entradas aceitas | Configurações opcionais |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG para PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-jpg` | PNG para JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG para WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-webp` | PNG para WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP para JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP para PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG para AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-avif` | PNG para AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP para AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC para JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-png` | HEIC para PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`, `.heif` | quality |
| `heic-to-avif` | HEIC para AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`, `.heif` | quality |
| `jpg-to-gif` | JPG para GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-gif` | PNG para GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF para JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF para PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP para GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG para TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`, `.jpeg` | quality |
| `png-to-tiff` | PNG para TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF para JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`, `.tif` | quality |
| `tiff-to-png` | TIFF para PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`, `.tif` | quality |
| `psd-to-jpg` | PSD para JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD para PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG para EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG para EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`, `.jpeg` | quality |
| `eps-to-png` | EPS para PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS para JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG para SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | nenhuma |
| `jpg-to-svg` | JPG para SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`, `.jpeg` | nenhuma |
| `tiff-to-svg` | TIFF para SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`, `.tif` | nenhuma |
| `psd-to-svg` | PSD para SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | nenhuma |
| `eps-to-svg` | EPS para SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | nenhuma |
| `svg-to-png` | SVG para PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG para JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`, `.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG para PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`, `.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG para PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC para PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`, `.heif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF para PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`, `.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP para PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF para PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS para PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Predefinições de Vídeo {#video-presets}

| ID da Predefinição | Converte | Rota | Ferramenta base | Entradas aceitas | Configurações opcionais |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV para MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM para MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV para MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI para MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 para MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 para WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM para MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV para MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI para MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 para AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV para AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV para AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI para MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 para GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV para GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV para GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI para GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF para MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | nenhuma |
| `gif-to-webm` | GIF para WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | nenhuma |
| `gif-to-mov` | GIF para MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | nenhuma |
| `mp4-to-mp3` | MP4 para MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | nenhuma |
| `mov-to-mp3` | MOV para MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | nenhuma |
| `mkv-to-mp3` | MKV para MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | nenhuma |
| `webm-to-mp3` | WEBM para MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | nenhuma |
| `avi-to-mp3` | AVI para MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | nenhuma |
| `mp4-to-wav` | MP4 para WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | nenhuma |
| `mov-to-wav` | MOV para WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | nenhuma |
| `mp4-to-ogg` | MP4 para OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | nenhuma |

## Predefinições de Áudio {#audio-presets}

| ID da Predefinição | Converte | Rota | Ferramenta base | Entradas aceitas | Configurações opcionais |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A para MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | nenhuma |
| `m4a-to-wav` | M4A para WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | nenhuma |
| `aac-to-mp3` | AAC para MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | nenhuma |
| `aac-to-wav` | AAC para WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | nenhuma |
| `aac-to-flac` | AAC para FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | nenhuma |
| `ogg-to-mp3` | OGG para MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | nenhuma |
| `ogg-to-wav` | OGG para WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | nenhuma |
| `wav-to-mp3` | WAV para MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | nenhuma |
| `mp3-to-wav` | MP3 para WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | nenhuma |
| `flac-to-mp3` | FLAC para MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | nenhuma |

## Predefinições de PDF {#pdf-presets}

| ID da Predefinição | Converte | Rota | Ferramenta base | Entradas aceitas | Configurações opcionais |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF para JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF para PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF para TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Predefinições de Arquivos {#files-presets}

| ID da Predefinição | Converte | Rota | Ferramenta base | Entradas aceitas | Configurações opcionais |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel para CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`, `.xls` | nenhuma |

## Notas {#notes}

- As predefinições são endpoints de API de primeira classe e também são válidas em requisições em lote, sempre que sua rota base suportar processamento em lote.
- Predefinições que usam conversão de vídeo podem retornar `202 Accepted`; conecte-se ao endpoint SSE de progresso do job antes de baixar o resultado.
- Para opções avançadas não expostas por uma predefinição, chame diretamente a ferramenta conversora base e defina o formato de saída em `settings`.
