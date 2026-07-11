---
description: "全モダリティにわたるサポート対象ファイルフォーマット。55種類以上の画像入力フォーマット、ビデオ、オーディオ、PDF、ファイルフォーマット。"
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: a5872e4aab51
---

# サポートされるフォーマット {#supported-formats}

SnapOtterは、画像、ビデオ、オーディオ、PDF、ファイルの5つのモダリティにわたってファイルを処理します。このページでは、サポートされるすべてのフォーマットを一覧します。

## 画像フォーマット {#image-formats}

SnapOtterは入力で55種類以上、出力で13種類の画像フォーマットをサポートします。

## 入力フォーマット {#input-formats}

### Web標準 (9) {#web-standards-9}

| フォーマット | 拡張子 | デコーダ | 備考 |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | APNGは先頭フレームを抽出 |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | アニメーション対応 |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | XXE/SSRF対策済み |
| SVGZ | .svgz | gunzip + Sharp | Gzipボム保護 |
| APNG | .apng | Sharp (native) | 先頭フレームのみ |
| JPEG XL | .jxl | djxl / ImageMagick | 2段階フォールバック |

### プロフェッショナル (7) {#professional-7}

| フォーマット | 拡張子 | デコーダ | 備考 |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | マルチページ対応 |
| PSD | .psd | ImageMagick | フラット化されたコンポジット |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpiラスタライズ、セキュリティ強化済み |
| OpenEXR | .exr | ImageMagick | リニアからsRGBへの変換 |
| Radiance HDR | .hdr | ImageMagick | リニアからsRGBへの変換 |
| DPX | .dpx | ImageMagick | LogからsRGBへの変換 |
| Cineon | .cin | ImageMagick | フィルム/VFXフォーマット |

### カメラRAW (23) {#camera-raw-23}

| フォーマット | 拡張子 | カメラブランド | デコーダ |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (ユニバーサル) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (2018年以前) | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon (2018年以降) | exiftool / ImageMagick + LibRaw |
| NEF | .nef | Nikon | exiftool / ImageMagick + LibRaw |
| NRW | .nrw | Nikon (Coolpix) | exiftool / ImageMagick + LibRaw |
| ARW | .arw | Sony | exiftool / ImageMagick + LibRaw |
| ORF | .orf | Olympus | exiftool / ImageMagick + LibRaw |
| RW2 | .rw2 | Panasonic | exiftool / ImageMagick + LibRaw |
| RAF | .raf | Fujifilm | exiftool / ImageMagick + LibRaw |
| PEF | .pef | Pentax/Ricoh | exiftool / ImageMagick + LibRaw |
| 3FR | .3fr | Hasselblad | exiftool / ImageMagick + LibRaw |
| IIQ | .iiq | Phase One | exiftool / ImageMagick + LibRaw |
| SRW | .srw | Samsung | exiftool / ImageMagick + LibRaw |
| X3F | .x3f | Sigma | exiftool / ImageMagick + LibRaw |
| RWL | .rwl | Leica | exiftool / ImageMagick + LibRaw |
| GPR | .gpr | GoPro | exiftool / ImageMagick + LibRaw |
| FFF | .fff | Hasselblad (レガシー) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (コンパクト) | exiftool / ImageMagick + LibRaw |

### モダンフォーマット (3) {#modern-formats-3}

| フォーマット | 拡張子 | デコーダ | 備考 |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | デジタルシネマ、医用画像 |
| QOI | .qoi | インラインTypeScriptコーデック | ゲーム開発、組み込みシステム |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhoneの写真 |

### レガシー/システム (4) {#legacy-system-4}

| フォーマット | 拡張子 | デコーダ | 備考 |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | 最大のレイヤーを抽出 |
| CUR | .cur | ImageMagick | Windowsカーソル(ICOの派生) |
| TGA | .tga | ImageMagick | 拡張子のみで検出 |

### 科学・ゲーミング (2) {#scientific-and-gaming-2}

| フォーマット | 拡張子 | デコーダ | 備考 |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | 天文学(NASA標準) |
| DDS | .dds | ImageMagick | ゲームテクスチャ(DirectX) |

### インターチェンジ (6) {#interchange-6}

| フォーマット | 拡張子 | デコーダ | 備考 |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | カラーピクスマップ |
| PGM | .pgm | Sharp (native) | グレースケール |
| PBM | .pbm | Sharp (native) | 1ビットビットマップ |
| PNM | .pnm | Sharp (native) | 総称フォーマット |
| PAM | .pam | Sharp (native) | 任意マップ |
| PFM | .pfm | Sharp (native) | 浮動小数点マップ |

## 出力フォーマット (13) {#output-formats-13}

| フォーマット | エンコーダ | 品質制御 | 利用可能なツール |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | すべてのツール |
| PNG | Sharp native | 圧縮 0-9 | すべてのツール |
| WebP | Sharp native | 1-100 | すべてのツール |
| AVIF | Sharp native | 1-100 | すべてのツール |
| TIFF | Sharp native | 1-100 | フル変換ツール |
| GIF | Sharp native | 1-100 | フル変換ツール |
| JXL | Sharp native | 1-100 | すべてのツール |
| HEIC | heif-enc CLI | 1-100 | フル変換ツール |
| HEIF | heif-enc CLI | 1-100 | フル変換ツール |
| BMP | ImageMagick CLI | ロスレス | 変換ツール |
| ICO | ImageMagick CLI | ロスレス | 変換ツール |
| JP2 | opj_compress CLI | 圧縮率 | 変換ツール |
| QOI | インラインコーデック | ロスレス | 変換ツール |

## ビデオフォーマット {#video-formats}

ビデオのデコードとエンコードはFFmpeg(静的ビルド)で処理されるため、一般的なコンテナとコーデックはすべて入力でサポートされます。

### 入力コンテナ (15) {#input-containers-15}

| フォーマット | 拡張子 | 代表的なコーデック | 備考 |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | 最も広く使われるコンテナ |
| QuickTime | .mov | H.264, ProRes | Appleのキャプチャ/編集 |
| WebM | .webm | VP8, VP9, AV1 | ロイヤリティフリーのWebフォーマット |
| Matroska | .mkv | 任意 | 柔軟なオープンコンテナ |
| AVI | .avi | 各種 | レガシーMicrosoftコンテナ |
| M4V | .m4v | H.264 | AppleのMP4派生 |
| AVCHD | .mts | H.264 | カムコーダーの録画 |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHDトランスポートストリーム |
| 3GP | .3gp | H.264, MPEG-4 | モバイルキャプチャ |
| Flash Video | .flv | H.264, VP6 | レガシーストリーミング |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD時代のビデオ |
| MPEG-TS | .ts | MPEG-2, H.264 | 放送トランスポートストリーム |
| Ogg | .ogv | Theora | オープンなOggビデオ |

### 出力フォーマット {#output-formats}

| フォーマット | 拡張子 | ビデオコーデック | 生成元 |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | 変換、圧縮、および大半のビデオツール |
| QuickTime | .mov | H.264 | ビデオ変換 |
| WebM | .webm | VP9 | ビデオ変換 |
| GIF | .gif | - | ビデオからGIF |
| WebP | .webp | - | ビデオからWebP(アニメーション) |

### 字幕 {#subtitles}

| フォーマット | 拡張子 | 操作 |
|--------|-----------|-----------|
| SubRip | .srt | 埋め込み、焼き込み、抽出、自動生成 |
| WebVTT | .vtt | 埋め込み、焼き込み、抽出、自動生成 |
| ASS / SSA | .ass | 埋め込み、焼き込み(スタイリング対応) |

## オーディオフォーマット {#audio-formats}

オーディオもFFmpegで処理されます。

### 入力フォーマット (11) {#input-formats-11}

| フォーマット | 拡張子 | 圧縮 | 備考 |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | 非可逆 | あらゆる環境で互換 |
| WAV | .wav | 無圧縮 (PCM) | スタジオ/編集 |
| FLAC | .flac | 可逆 | オープンな可逆コーデック |
| AAC | .aac | 非可逆 | 生のAACストリーム |
| M4A | .m4a | 非可逆 (AAC) / 可逆 (ALAC) | MPEG-4オーディオ |
| Ogg Vorbis | .ogg | 非可逆 | オープンフォーマット |
| Opus | .opus | 非可逆 | モダンで低遅延 |
| WMA | .wma | 非可逆 | Windows Media Audio |
| AIFF | .aiff | 無圧縮 (PCM) | Appleの無圧縮 |
| AMR | .amr | 非可逆 | 音声/モバイル |
| AC-3 | .ac3 | 非可逆 | Dolby Digital |

### 出力フォーマット {#output-formats-1}

| フォーマット | 拡張子 | コーデック | 生成元 |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | オーディオ変換、オーディオ抽出 |
| WAV | .wav | PCM | オーディオ変換、オーディオ抽出 |
| FLAC | .flac | FLAC (可逆) | オーディオ変換 |
| Ogg | .ogg | Vorbis | オーディオ変換 |
| M4A | .m4a | AAC | オーディオ変換、オーディオ抽出 |

## ドキュメントフォーマット {#document-formats}

ドキュメント処理には、qpdf、LibreOffice、Ghostscript、Pandoc、WeasyPrintを使用します。

### 入力フォーマット (15) {#input-formats-15}

| フォーマット | 拡張子 | エンジン | 備考 |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | 中核となるドキュメントフォーマット |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | テキスト、シート、プレゼンテーション |
| Rich Text | .rtf | LibreOffice | アプリ間のリッチテキスト |
| Plain Text | .txt | LibreOffice, Pandoc | UTF-8テキスト |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | PDFにレンダリング |
| EPUB | .epub | Pandoc, LibreOffice | 電子書籍フォーマット |

### 出力フォーマット {#output-formats-2}

| フォーマット | 拡張子 | 生成元 |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPointからPDF、MarkdownからPDF、HTMLからPDF |
| PDF/A | .pdf | PDF/A変換(アーカイブ用) |
| Word | .docx, .odt, .rtf, .txt | ドキュメント変換、PDFからWord、MarkdownからWord |
| プレゼンテーション | .pptx, .odp | プレゼンテーション変換 |
| スプレッドシート | .xlsx, .ods, .csv | スプレッドシート変換 |
| HTML | .html | MarkdownからHTML |
| EPUB | .epub | EPUBへ変換 |
| 画像 | .png, .jpg | PDFから画像 |

## ファイルフォーマット {#file-formats}

データとアーカイブのツールは、構造化フォーマット間の変換とファイルのバンドルを行います。

| フォーマット | 拡張子 | 変換 |
|--------|-----------|-------------|
| CSV | .csv | JSONおよびExcelとの相互変換、分割と結合、XMLから |
| JSON | .json | CSV、XML、YAMLとの相互変換 |
| XML | .xml | JSONとの相互変換、CSVへ |
| YAML | .yaml, .yml | JSONとの相互変換 |
| Excel | .xlsx | CSVとの相互変換 |
| ZIP | .zip | アーカイブの作成、内容の展開 |
