---
description: "SnapOtter のツールカタログから生成された専用の変換プリセットエンドポイント。"
i18n_source_hash: 0dcd6c6c61d5
i18n_provenance: human
i18n_output_hash: a6aa0d84ccfd
i18n_hash_version: 2
---

# Conversion Presets {#conversion-presets}

SnapOtter は、ベースとなるコンバーターツールに加えて、121 個の専用変換プリセットエンドポイントを公開しています。各プリセットは出力形式を固定し、ベースの処理パイプラインに委譲するため、動作、検証、出力の仕様は下記に挙げるベースツールと一致します。

## API Endpoint Pattern {#api-endpoint-pattern}

`POST /api/v1/tools/<section>/<presetId>`

`file` パートと、任意の `settings` JSON 文字列を含む `multipart/form-data` を送信します。プリセットはベースツールのレスポンス仕様に従います。高速なプリセットは通常 `downloadUrl` とともに `200` を返しますが、同期待機ウィンドウを超えると `202` を返すことがあります。動画プリセットおよび実行時間の長いファイル／ドキュメントのプリセットは `202` を返し、`/api/v1/jobs/<jobId>/progress` から進捗をストリーミングします。PDF から画像へのプリセットは、ページのダウンロード URL と ZIP の URL を返します。

## Image Presets {#image-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `jpg-to-png` | JPG から PNG | `/api/v1/tools/image/jpg-to-png` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-jpg` | PNG から JPG | `/api/v1/tools/image/png-to-jpg` | `convert` | `.png` | quality |
| `jpg-to-webp` | JPG から WebP | `/api/v1/tools/image/jpg-to-webp` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-webp` | PNG から WebP | `/api/v1/tools/image/png-to-webp` | `convert` | `.png` | quality |
| `webp-to-jpg` | WebP から JPG | `/api/v1/tools/image/webp-to-jpg` | `convert` | `.webp` | quality |
| `webp-to-png` | WebP から PNG | `/api/v1/tools/image/webp-to-png` | `convert` | `.webp` | quality |
| `jpg-to-avif` | JPG から AVIF | `/api/v1/tools/image/jpg-to-avif` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-avif` | PNG から AVIF | `/api/v1/tools/image/png-to-avif` | `convert` | `.png` | quality |
| `webp-to-avif` | WebP から AVIF | `/api/v1/tools/image/webp-to-avif` | `convert` | `.webp` | quality |
| `heic-to-jpg` | HEIC から JPG | `/api/v1/tools/image/heic-to-jpg` | `convert` | `.heic`、`.heif`、`.hif` | quality |
| `heic-to-png` | HEIC から PNG | `/api/v1/tools/image/heic-to-png` | `convert` | `.heic`、`.heif`、`.hif` | quality |
| `heic-to-avif` | HEIC から AVIF | `/api/v1/tools/image/heic-to-avif` | `convert` | `.heic`、`.heif`、`.hif` | quality |
| `jpg-to-gif` | JPG から GIF | `/api/v1/tools/image/jpg-to-gif` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-gif` | PNG から GIF | `/api/v1/tools/image/png-to-gif` | `convert` | `.png` | quality |
| `gif-to-jpg` | GIF から JPG | `/api/v1/tools/image/gif-to-jpg` | `convert` | `.gif` | quality |
| `gif-to-png` | GIF から PNG | `/api/v1/tools/image/gif-to-png` | `convert` | `.gif` | quality |
| `webp-to-gif` | WebP から GIF | `/api/v1/tools/image/webp-to-gif` | `convert` | `.webp` | quality |
| `jpg-to-tiff` | JPG から TIFF | `/api/v1/tools/image/jpg-to-tiff` | `convert` | `.jpg`、`.jpeg` | quality |
| `png-to-tiff` | PNG から TIFF | `/api/v1/tools/image/png-to-tiff` | `convert` | `.png` | quality |
| `tiff-to-jpg` | TIFF から JPG | `/api/v1/tools/image/tiff-to-jpg` | `convert` | `.tiff`、`.tif` | quality |
| `tiff-to-png` | TIFF から PNG | `/api/v1/tools/image/tiff-to-png` | `convert` | `.tiff`、`.tif` | quality |
| `psd-to-jpg` | PSD から JPG | `/api/v1/tools/image/psd-to-jpg` | `convert` | `.psd` | quality |
| `psd-to-png` | PSD から PNG | `/api/v1/tools/image/psd-to-png` | `convert` | `.psd` | quality |
| `png-to-eps` | PNG から EPS | `/api/v1/tools/image/png-to-eps` | `convert` | `.png` | quality |
| `jpg-to-eps` | JPG から EPS | `/api/v1/tools/image/jpg-to-eps` | `convert` | `.jpg`、`.jpeg` | quality |
| `eps-to-png` | EPS から PNG | `/api/v1/tools/image/eps-to-png` | `convert` | `.eps` | quality |
| `eps-to-jpg` | EPS から JPG | `/api/v1/tools/image/eps-to-jpg` | `convert` | `.eps` | quality |
| `png-to-svg` | PNG から SVG | `/api/v1/tools/image/png-to-svg` | `vectorize` | `.png` | none |
| `jpg-to-svg` | JPG から SVG | `/api/v1/tools/image/jpg-to-svg` | `vectorize` | `.jpg`、`.jpeg` | none |
| `tiff-to-svg` | TIFF から SVG | `/api/v1/tools/image/tiff-to-svg` | `vectorize` | `.tiff`、`.tif` | none |
| `psd-to-svg` | PSD から SVG | `/api/v1/tools/image/psd-to-svg` | `vectorize` | `.psd` | none |
| `eps-to-svg` | EPS から SVG | `/api/v1/tools/image/eps-to-svg` | `vectorize` | `.eps` | none |
| `svg-to-png` | SVG から PNG | `/api/v1/tools/image/svg-to-png` | `svg-to-raster` | `.svg`、`.svgz` | quality, width, height, dpi, backgroundColor |
| `svg-to-jpg` | SVG から JPG | `/api/v1/tools/image/svg-to-jpg` | `svg-to-raster` | `.svg`、`.svgz` | quality, width, height, dpi, backgroundColor |
| `jpg-to-pdf` | JPG から PDF | `/api/v1/tools/image/jpg-to-pdf` | `image-to-pdf` | `.jpg`、`.jpeg` | pageSize, orientation, margin, targetSize, collate |
| `png-to-pdf` | PNG から PDF | `/api/v1/tools/image/png-to-pdf` | `image-to-pdf` | `.png` | pageSize, orientation, margin, targetSize, collate |
| `heic-to-pdf` | HEIC から PDF | `/api/v1/tools/image/heic-to-pdf` | `image-to-pdf` | `.heic`、`.heif`、`.hif` | pageSize, orientation, margin, targetSize, collate |
| `tiff-to-pdf` | TIFF から PDF | `/api/v1/tools/image/tiff-to-pdf` | `image-to-pdf` | `.tiff`、`.tif` | pageSize, orientation, margin, targetSize, collate |
| `webp-to-pdf` | WebP から PDF | `/api/v1/tools/image/webp-to-pdf` | `image-to-pdf` | `.webp` | pageSize, orientation, margin, targetSize, collate |
| `gif-to-pdf` | GIF から PDF | `/api/v1/tools/image/gif-to-pdf` | `image-to-pdf` | `.gif` | pageSize, orientation, margin, targetSize, collate |
| `eps-to-pdf` | EPS から PDF | `/api/v1/tools/image/eps-to-pdf` | `image-to-pdf` | `.eps` | pageSize, orientation, margin, targetSize, collate |

## Video Presets {#video-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `mov-to-mp4` | MOV から MP4 | `/api/v1/tools/video/mov-to-mp4` | `convert-video` | `.mov` | quality |
| `webm-to-mp4` | WEBM から MP4 | `/api/v1/tools/video/webm-to-mp4` | `convert-video` | `.webm` | quality |
| `mkv-to-mp4` | MKV から MP4 | `/api/v1/tools/video/mkv-to-mp4` | `convert-video` | `.mkv` | quality |
| `avi-to-mp4` | AVI から MP4 | `/api/v1/tools/video/avi-to-mp4` | `convert-video` | `.avi` | quality |
| `mp4-to-mov` | MP4 から MOV | `/api/v1/tools/video/mp4-to-mov` | `convert-video` | `.mp4` | quality |
| `mp4-to-webm` | MP4 から WEBM | `/api/v1/tools/video/mp4-to-webm` | `convert-video` | `.mp4` | quality |
| `webm-to-mov` | WEBM から MOV | `/api/v1/tools/video/webm-to-mov` | `convert-video` | `.webm` | quality |
| `mkv-to-mov` | MKV から MOV | `/api/v1/tools/video/mkv-to-mov` | `convert-video` | `.mkv` | quality |
| `avi-to-mov` | AVI から MOV | `/api/v1/tools/video/avi-to-mov` | `convert-video` | `.avi` | quality |
| `mp4-to-avi` | MP4 から AVI | `/api/v1/tools/video/mp4-to-avi` | `convert-video` | `.mp4` | quality |
| `mov-to-avi` | MOV から AVI | `/api/v1/tools/video/mov-to-avi` | `convert-video` | `.mov` | quality |
| `mkv-to-avi` | MKV から AVI | `/api/v1/tools/video/mkv-to-avi` | `convert-video` | `.mkv` | quality |
| `avi-to-mkv` | AVI から MKV | `/api/v1/tools/video/avi-to-mkv` | `convert-video` | `.avi` | quality |
| `mp4-to-gif` | MP4 から GIF | `/api/v1/tools/video/mp4-to-gif` | `video-to-gif` | `.mp4` | fps, width, startS, durationS |
| `mov-to-gif` | MOV から GIF | `/api/v1/tools/video/mov-to-gif` | `video-to-gif` | `.mov` | fps, width, startS, durationS |
| `mkv-to-gif` | MKV から GIF | `/api/v1/tools/video/mkv-to-gif` | `video-to-gif` | `.mkv` | fps, width, startS, durationS |
| `avi-to-gif` | AVI から GIF | `/api/v1/tools/video/avi-to-gif` | `video-to-gif` | `.avi` | fps, width, startS, durationS |
| `gif-to-mp4` | GIF から MP4 | `/api/v1/tools/video/gif-to-mp4` | `gif-to-video` | `.gif` | none |
| `gif-to-webm` | GIF から WEBM | `/api/v1/tools/video/gif-to-webm` | `gif-to-video` | `.gif` | none |
| `gif-to-mov` | GIF から MOV | `/api/v1/tools/video/gif-to-mov` | `gif-to-video` | `.gif` | none |
| `mp4-to-mp3` | MP4 から MP3 | `/api/v1/tools/video/mp4-to-mp3` | `extract-audio` | `.mp4` | none |
| `mov-to-mp3` | MOV から MP3 | `/api/v1/tools/video/mov-to-mp3` | `extract-audio` | `.mov` | none |
| `mkv-to-mp3` | MKV から MP3 | `/api/v1/tools/video/mkv-to-mp3` | `extract-audio` | `.mkv` | none |
| `webm-to-mp3` | WEBM から MP3 | `/api/v1/tools/video/webm-to-mp3` | `extract-audio` | `.webm` | none |
| `avi-to-mp3` | AVI から MP3 | `/api/v1/tools/video/avi-to-mp3` | `extract-audio` | `.avi` | none |
| `mp4-to-wav` | MP4 から WAV | `/api/v1/tools/video/mp4-to-wav` | `extract-audio` | `.mp4` | none |
| `mov-to-wav` | MOV から WAV | `/api/v1/tools/video/mov-to-wav` | `extract-audio` | `.mov` | none |
| `mp4-to-ogg` | MP4 から OGG | `/api/v1/tools/video/mp4-to-ogg` | `extract-audio` | `.mp4` | none |
| `srt-to-vtt` | SRT から VTT | `/api/v1/tools/video/srt-to-vtt` | `convert-subtitles` | `.srt` | none |
| `vtt-to-srt` | VTT から SRT | `/api/v1/tools/video/vtt-to-srt` | `convert-subtitles` | `.vtt` | none |
| `ass-to-srt` | ASS から SRT | `/api/v1/tools/video/ass-to-srt` | `convert-subtitles` | `.ass` | none |
| `srt-to-ass` | SRT から ASS | `/api/v1/tools/video/srt-to-ass` | `convert-subtitles` | `.srt` | none |

## Audio Presets {#audio-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `m4a-to-mp3` | M4A から MP3 | `/api/v1/tools/audio/m4a-to-mp3` | `convert-audio` | `.m4a` | none |
| `m4a-to-wav` | M4A から WAV | `/api/v1/tools/audio/m4a-to-wav` | `convert-audio` | `.m4a` | none |
| `aac-to-mp3` | AAC から MP3 | `/api/v1/tools/audio/aac-to-mp3` | `convert-audio` | `.aac` | none |
| `aac-to-wav` | AAC から WAV | `/api/v1/tools/audio/aac-to-wav` | `convert-audio` | `.aac` | none |
| `aac-to-flac` | AAC から FLAC | `/api/v1/tools/audio/aac-to-flac` | `convert-audio` | `.aac` | none |
| `ogg-to-mp3` | OGG から MP3 | `/api/v1/tools/audio/ogg-to-mp3` | `convert-audio` | `.ogg` | none |
| `ogg-to-wav` | OGG から WAV | `/api/v1/tools/audio/ogg-to-wav` | `convert-audio` | `.ogg` | none |
| `wav-to-mp3` | WAV から MP3 | `/api/v1/tools/audio/wav-to-mp3` | `convert-audio` | `.wav` | none |
| `mp3-to-wav` | MP3 から WAV | `/api/v1/tools/audio/mp3-to-wav` | `convert-audio` | `.mp3` | none |
| `flac-to-mp3` | FLAC から MP3 | `/api/v1/tools/audio/flac-to-mp3` | `convert-audio` | `.flac` | none |
| `mp3-to-flac` | MP3 から FLAC | `/api/v1/tools/audio/mp3-to-flac` | `convert-audio` | `.mp3` | none |
| `mp3-to-ogg` | MP3 から OGG | `/api/v1/tools/audio/mp3-to-ogg` | `convert-audio` | `.mp3` | none |
| `mp3-to-m4a` | MP3 から M4A | `/api/v1/tools/audio/mp3-to-m4a` | `convert-audio` | `.mp3` | none |
| `wav-to-flac` | WAV から FLAC | `/api/v1/tools/audio/wav-to-flac` | `convert-audio` | `.wav` | none |
| `wav-to-ogg` | WAV から OGG | `/api/v1/tools/audio/wav-to-ogg` | `convert-audio` | `.wav` | none |
| `wav-to-m4a` | WAV から M4A | `/api/v1/tools/audio/wav-to-m4a` | `convert-audio` | `.wav` | none |
| `flac-to-wav` | FLAC から WAV | `/api/v1/tools/audio/flac-to-wav` | `convert-audio` | `.flac` | none |
| `flac-to-ogg` | FLAC から OGG | `/api/v1/tools/audio/flac-to-ogg` | `convert-audio` | `.flac` | none |
| `flac-to-m4a` | FLAC から M4A | `/api/v1/tools/audio/flac-to-m4a` | `convert-audio` | `.flac` | none |
| `ogg-to-flac` | OGG から FLAC | `/api/v1/tools/audio/ogg-to-flac` | `convert-audio` | `.ogg` | none |
| `ogg-to-m4a` | OGG から M4A | `/api/v1/tools/audio/ogg-to-m4a` | `convert-audio` | `.ogg` | none |
| `m4a-to-flac` | M4A から FLAC | `/api/v1/tools/audio/m4a-to-flac` | `convert-audio` | `.m4a` | none |
| `m4a-to-ogg` | M4A から OGG | `/api/v1/tools/audio/m4a-to-ogg` | `convert-audio` | `.m4a` | none |
| `aac-to-ogg` | AAC から OGG | `/api/v1/tools/audio/aac-to-ogg` | `convert-audio` | `.aac` | none |
| `aac-to-m4a` | AAC から M4A | `/api/v1/tools/audio/aac-to-m4a` | `convert-audio` | `.aac` | none |
| `opus-to-mp3` | Opus から MP3 | `/api/v1/tools/audio/opus-to-mp3` | `convert-audio` | `.opus` | none |
| `opus-to-wav` | Opus から WAV | `/api/v1/tools/audio/opus-to-wav` | `convert-audio` | `.opus` | none |
| `opus-to-flac` | Opus から FLAC | `/api/v1/tools/audio/opus-to-flac` | `convert-audio` | `.opus` | none |
| `opus-to-ogg` | Opus から OGG | `/api/v1/tools/audio/opus-to-ogg` | `convert-audio` | `.opus` | none |
| `opus-to-m4a` | Opus から M4A | `/api/v1/tools/audio/opus-to-m4a` | `convert-audio` | `.opus` | none |
| `wma-to-mp3` | WMA から MP3 | `/api/v1/tools/audio/wma-to-mp3` | `convert-audio` | `.wma` | none |
| `wma-to-wav` | WMA から WAV | `/api/v1/tools/audio/wma-to-wav` | `convert-audio` | `.wma` | none |
| `wma-to-flac` | WMA から FLAC | `/api/v1/tools/audio/wma-to-flac` | `convert-audio` | `.wma` | none |
| `wma-to-ogg` | WMA から OGG | `/api/v1/tools/audio/wma-to-ogg` | `convert-audio` | `.wma` | none |
| `wma-to-m4a` | WMA から M4A | `/api/v1/tools/audio/wma-to-m4a` | `convert-audio` | `.wma` | none |
| `aiff-to-mp3` | AIFF から MP3 | `/api/v1/tools/audio/aiff-to-mp3` | `convert-audio` | `.aiff` | none |
| `aiff-to-wav` | AIFF から WAV | `/api/v1/tools/audio/aiff-to-wav` | `convert-audio` | `.aiff` | none |
| `aiff-to-flac` | AIFF から FLAC | `/api/v1/tools/audio/aiff-to-flac` | `convert-audio` | `.aiff` | none |
| `aiff-to-ogg` | AIFF から OGG | `/api/v1/tools/audio/aiff-to-ogg` | `convert-audio` | `.aiff` | none |
| `aiff-to-m4a` | AIFF から M4A | `/api/v1/tools/audio/aiff-to-m4a` | `convert-audio` | `.aiff` | none |

## PDF Presets {#pdf-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `pdf-to-jpg` | PDF から JPG | `/api/v1/tools/pdf/pdf-to-jpg` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-png` | PDF から PNG | `/api/v1/tools/pdf/pdf-to-png` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |
| `pdf-to-tiff` | PDF から TIFF | `/api/v1/tools/pdf/pdf-to-tiff` | `pdf-to-image` | `.pdf` | dpi, quality, colorMode, pages |

## Files Presets {#files-presets}

| Preset ID | Converts | Route | Base tool | Accepted inputs | Optional settings |
|-----------|----------|-------|-----------|-----------------|-------------------|
| `excel-to-csv` | Excel から CSV | `/api/v1/tools/files/excel-to-csv` | `convert-spreadsheet` | `.xlsx`、`.xls` | none |
| `otf-to-ttf` | OTF から TTF | `/api/v1/tools/files/otf-to-ttf` | `convert-font` | `.otf` | none |
| `woff-to-ttf` | WOFF から TTF | `/api/v1/tools/files/woff-to-ttf` | `convert-font` | `.woff` | none |
| `woff2-to-ttf` | WOFF2 から TTF | `/api/v1/tools/files/woff2-to-ttf` | `convert-font` | `.woff2` | none |
| `ttf-to-woff2` | TTF から WOFF2 | `/api/v1/tools/files/ttf-to-woff2` | `convert-font` | `.ttf`、`.otf` | none |

## Notes {#notes}

- プリセットはファーストクラスの API エンドポイントであり、ベースルートがバッチ処理をサポートしている場合はバッチリクエストでも有効です。
- 動画変換を使用するプリセットは `202 Accepted` を返すことがあります。結果をダウンロードする前に、ジョブ進捗の SSE エンドポイントに接続してください。
- プリセットで公開されていない詳細オプションを利用するには、ベースのコンバーターツールを直接呼び出し、`settings` で出力形式を設定してください。
