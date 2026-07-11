---
description: "涵蓋所有模態的支援檔案格式，55+ 種影像輸入格式，以及 video、audio、PDF 與檔案格式。"
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: cd6ab9dec9f1
---

# 支援的格式 {#supported-formats}

SnapOtter 可處理五種模態的檔案：影像、video、audio、PDF 與檔案。本頁列出所有支援的格式。

## 影像格式 {#image-formats}

SnapOtter 支援 55+ 種影像格式的輸入，以及 13 種格式的輸出。

## 輸入格式 {#input-formats}

### 網頁標準（9） {#web-standards-9}

| 格式 | 副檔名 | 解碼器 | 備註 |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp（原生） | |
| PNG | .png | Sharp（原生） | 擷取 APNG 第一幀 |
| WebP | .webp | Sharp（原生） | |
| GIF | .gif | Sharp（原生） | 支援動態 |
| AVIF | .avif | Sharp（原生） | |
| SVG | .svg | Sharp（librsvg） | 針對 XXE/SSRF 進行清理 |
| SVGZ | .svgz | gunzip + Sharp | Gzip 炸彈防護 |
| APNG | .apng | Sharp（原生） | 僅第一幀 |
| JPEG XL | .jxl | djxl / ImageMagick | 雙層回退 |

### 專業（7） {#professional-7}

| 格式 | 副檔名 | 解碼器 | 備註 |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp（原生） | 支援多頁 |
| PSD | .psd | ImageMagick | 扁平化合成 |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi 點陣化，安全強化 |
| OpenEXR | .exr | ImageMagick | Linear-to-sRGB 轉換 |
| Radiance HDR | .hdr | ImageMagick | Linear-to-sRGB 轉換 |
| DPX | .dpx | ImageMagick | Log-to-sRGB 轉換 |
| Cineon | .cin | ImageMagick | 電影/VFX 格式 |

### 相機 RAW（23） {#camera-raw-23}

| 格式 | 副檔名 | 相機品牌 | 解碼器 |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe（通用） | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon（2018 年前） | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon（2018 年起） | exiftool / ImageMagick + LibRaw |
| NEF | .nef | Nikon | exiftool / ImageMagick + LibRaw |
| NRW | .nrw | Nikon（Coolpix） | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad（舊版） | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax（輕便型） | exiftool / ImageMagick + LibRaw |

### 現代格式（3） {#modern-formats-3}

| 格式 | 副檔名 | 解碼器 | 備註 |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | 數位電影、醫療影像 |
| QOI | .qoi | 內嵌 TypeScript 編解碼器 | 遊戲開發、嵌入式系統 |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone 照片 |

### 舊版/系統（4） {#legacy-system-4}

| 格式 | 副檔名 | 解碼器 | 備註 |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | 擷取最大圖層 |
| CUR | .cur | ImageMagick | Windows 游標（ICO 變體） |
| TGA | .tga | ImageMagick | 僅依副檔名偵測 |

### 科學與遊戲（2） {#scientific-and-gaming-2}

| 格式 | 副檔名 | 解碼器 | 備註 |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | 天文學（NASA 標準） |
| DDS | .dds | ImageMagick | 遊戲紋理（DirectX） |

### 交換格式（6） {#interchange-6}

| 格式 | 副檔名 | 解碼器 | 備註 |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp（原生） | 彩色像素圖 |
| PGM | .pgm | Sharp（原生） | 灰階 |
| PBM | .pbm | Sharp（原生） | 1 位元點陣圖 |
| PNM | .pnm | Sharp（原生） | 通用格式 |
| PAM | .pam | Sharp（原生） | 任意映射 |
| PFM | .pfm | Sharp（原生） | 浮點映射 |

## 輸出格式（13） {#output-formats-13}

| 格式 | 編碼器 | 品質控制 | 可用於 |
|--------|---------|----------------|-------------|
| JPEG | Sharp 原生 | 1-100 | 所有工具 |
| PNG | Sharp 原生 | 壓縮 0-9 | 所有工具 |
| WebP | Sharp 原生 | 1-100 | 所有工具 |
| AVIF | Sharp 原生 | 1-100 | 所有工具 |
| TIFF | Sharp 原生 | 1-100 | 完整轉換工具 |
| GIF | Sharp 原生 | 1-100 | 完整轉換工具 |
| JXL | Sharp 原生 | 1-100 | 所有工具 |
| HEIC | heif-enc CLI | 1-100 | 完整轉換工具 |
| HEIF | heif-enc CLI | 1-100 | 完整轉換工具 |
| BMP | ImageMagick CLI | 無損 | Convert 工具 |
| ICO | ImageMagick CLI | 無損 | Convert 工具 |
| JP2 | opj_compress CLI | 壓縮比 | Convert 工具 |
| QOI | 內嵌編解碼器 | 無損 | Convert 工具 |

## Video 格式 {#video-formats}

Video 的解碼與編碼由 FFmpeg（靜態建置）處理，因此輸入時支援每一種常見的容器與編解碼器。

### 輸入容器（15） {#input-containers-15}

| 格式 | 副檔名 | 典型編解碼器 | 備註 |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | 使用最廣泛的容器 |
| QuickTime | .mov | H.264, ProRes | Apple 擷取/編輯 |
| WebM | .webm | VP8, VP9, AV1 | 免權利金網頁格式 |
| Matroska | .mkv | 任意 | 靈活的開放容器 |
| AVI | .avi | 各種 | 舊版 Microsoft 容器 |
| M4V | .m4v | H.264 | Apple MP4 變體 |
| AVCHD | .mts | H.264 | 攝影機錄影 |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD 傳輸串流 |
| 3GP | .3gp | H.264, MPEG-4 | 行動裝置擷取 |
| Flash Video | .flv | H.264, VP6 | 舊版串流 |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD 時代影片 |
| MPEG-TS | .ts | MPEG-2, H.264 | 廣播傳輸串流 |
| Ogg | .ogv | Theora | 開放的 Ogg 影片 |

### 輸出格式 {#output-formats}

| 格式 | 副檔名 | 影片編解碼器 | 由何者產生 |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convert、compress 及大多數 video 工具 |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP（動態） |

### 字幕 {#subtitles}

| 格式 | 副檔名 | 操作 |
|--------|-----------|-----------|
| SubRip | .srt | 內嵌、燒錄、擷取、自動產生 |
| WebVTT | .vtt | 內嵌、燒錄、擷取、自動產生 |
| ASS / SSA | .ass | 內嵌、燒錄（支援樣式） |

## Audio 格式 {#audio-formats}

Audio 同樣由 FFmpeg 處理。

### 輸入格式（11） {#input-formats-11}

| 格式 | 副檔名 | 壓縮 | 備註 |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | 有損 | 通用相容性 |
| WAV | .wav | 未壓縮（PCM） | 錄音室 / 編輯 |
| FLAC | .flac | 無損 | 開放無損編解碼器 |
| AAC | .aac | 有損 | 原始 AAC 串流 |
| M4A | .m4a | 有損（AAC）/ 無損（ALAC） | MPEG-4 音訊 |
| Ogg Vorbis | .ogg | 有損 | 開放格式 |
| Opus | .opus | 有損 | 現代、低延遲 |
| WMA | .wma | 有損 | Windows Media Audio |
| AIFF | .aiff | 未壓縮（PCM） | Apple 未壓縮 |
| AMR | .amr | 有損 | 語音 / 行動裝置 |
| AC-3 | .ac3 | 有損 | Dolby Digital |

### 輸出格式 {#output-formats-1}

| 格式 | 副檔名 | 編解碼器 | 由何者產生 |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio、Extract Audio |
| WAV | .wav | PCM | Convert Audio、Extract Audio |
| FLAC | .flac | FLAC（無損） | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio、Extract Audio |

## 文件格式 {#document-formats}

文件處理使用 qpdf、LibreOffice、Ghostscript、Pandoc 與 WeasyPrint。

### 輸入格式（15） {#input-formats-15}

| 格式 | 副檔名 | 引擎 | 備註 |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | 核心文件格式 |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | 文字、試算表、簡報 |
| Rich Text | .rtf | LibreOffice | 跨應用程式 rich text |
| Plain Text | .txt | LibreOffice, Pandoc | UTF-8 文字 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | 轉譯為 PDF |
| EPUB | .epub | Pandoc, LibreOffice | 電子書格式 |

### 輸出格式 {#output-formats-2}

| 格式 | 副檔名 | 由何者產生 |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF、Markdown to PDF、HTML to PDF |
| PDF/A | .pdf | PDF/A Convert（封存） |
| Word | .docx, .odt, .rtf, .txt | Convert Document、PDF to Word、Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Images | .png, .jpg | PDF to Image |

## 檔案格式 {#file-formats}

資料與封存工具可在結構化格式之間轉換，並打包檔案。

| 格式 | 副檔名 | 轉換 |
|--------|-----------|-------------|
| CSV | .csv | 與 JSON 及 Excel 互轉；分割與合併；從 XML 轉入 |
| JSON | .json | 與 CSV、XML 及 YAML 互轉 |
| XML | .xml | 與 JSON 互轉；轉為 CSV |
| YAML | .yaml, .yml | 與 JSON 互轉 |
| Excel | .xlsx | 與 CSV 互轉 |
| ZIP | .zip | 建立封存、擷取內容 |
