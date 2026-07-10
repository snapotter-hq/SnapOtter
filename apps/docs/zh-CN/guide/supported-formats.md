---
description: "跨所有模态支持的文件格式 - 55+ 种图像输入格式、视频、音频、PDF 和文件格式。"
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 9836bacf1cd8
---

# 支持的格式 {#supported-formats}

SnapOtter 跨五种模态处理文件：图像、视频、音频、PDF 和文件。本页列出所有支持的格式。

## 图像格式 {#image-formats}

SnapOtter 支持 55+ 种图像输入格式和 13 种输出格式。

## 输入格式 {#input-formats}

### Web 标准（9） {#web-standards-9}

| 格式 | 扩展名 | 解码器 | 备注 |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | 提取 APNG 首帧 |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | 支持动画 |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | 已针对 XXE/SSRF 净化 |
| SVGZ | .svgz | gunzip + Sharp | Gzip 炸弹防护 |
| APNG | .apng | Sharp (native) | 仅首帧 |
| JPEG XL | .jxl | djxl / ImageMagick | 两级回退 |

### 专业（7） {#professional-7}

| 格式 | 扩展名 | 解码器 | 备注 |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | 支持多页 |
| PSD | .psd | ImageMagick | 扁平化合成 |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi 栅格化，已安全加固 |
| OpenEXR | .exr | ImageMagick | 线性到 sRGB 转换 |
| Radiance HDR | .hdr | ImageMagick | 线性到 sRGB 转换 |
| DPX | .dpx | ImageMagick | 对数到 sRGB 转换 |
| Cineon | .cin | ImageMagick | 电影/VFX 格式 |

### 相机 RAW（23） {#camera-raw-23}

| 格式 | 扩展名 | 相机品牌 | 解码器 |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe（通用） | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon（2018 年前） | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon（2018 年及以后） | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad（旧版） | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax（紧凑型） | exiftool / ImageMagick + LibRaw |

### 现代格式（3） {#modern-formats-3}

| 格式 | 扩展名 | 解码器 | 备注 |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | 数字电影、医学影像 |
| QOI | .qoi | 内联 TypeScript 编解码器 | 游戏开发、嵌入式系统 |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone 照片 |

### 旧版/系统（4） {#legacy-system-4}

| 格式 | 扩展名 | 解码器 | 备注 |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | 提取最大图层 |
| CUR | .cur | ImageMagick | Windows 光标（ICO 变体） |
| TGA | .tga | ImageMagick | 仅按扩展名检测 |

### 科学与游戏（2） {#scientific-and-gaming-2}

| 格式 | 扩展名 | 解码器 | 备注 |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | 天文学（NASA 标准） |
| DDS | .dds | ImageMagick | 游戏纹理（DirectX） |

### 交换（6） {#interchange-6}

| 格式 | 扩展名 | 解码器 | 备注 |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | 彩色像素图 |
| PGM | .pgm | Sharp (native) | 灰度 |
| PBM | .pbm | Sharp (native) | 1 位位图 |
| PNM | .pnm | Sharp (native) | 通用格式 |
| PAM | .pam | Sharp (native) | 任意映射 |
| PFM | .pfm | Sharp (native) | 浮点映射 |

## 输出格式（13） {#output-formats-13}

| 格式 | 编码器 | 质量控制 | 可用于 |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | 所有工具 |
| PNG | Sharp native | 压缩级别 0-9 | 所有工具 |
| WebP | Sharp native | 1-100 | 所有工具 |
| AVIF | Sharp native | 1-100 | 所有工具 |
| TIFF | Sharp native | 1-100 | 完整转换工具 |
| GIF | Sharp native | 1-100 | 完整转换工具 |
| JXL | Sharp native | 1-100 | 所有工具 |
| HEIC | heif-enc CLI | 1-100 | 完整转换工具 |
| HEIF | heif-enc CLI | 1-100 | 完整转换工具 |
| BMP | ImageMagick CLI | 无损 | 转换工具 |
| ICO | ImageMagick CLI | 无损 | 转换工具 |
| JP2 | opj_compress CLI | 压缩比 | 转换工具 |
| QOI | 内联编解码器 | 无损 | 转换工具 |

## 视频格式 {#video-formats}

视频解码和编码由 FFmpeg（静态构建）处理，因此在输入端支持所有常见的容器和编解码器。

### 输入容器（15） {#input-containers-15}

| 格式 | 扩展名 | 典型编解码器 | 备注 |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | 使用最广泛的容器 |
| QuickTime | .mov | H.264, ProRes | Apple 采集/编辑 |
| WebM | .webm | VP8, VP9, AV1 | 免版税的 Web 格式 |
| Matroska | .mkv | 任意 | 灵活的开放容器 |
| AVI | .avi | 各种 | 旧版 Microsoft 容器 |
| M4V | .m4v | H.264 | Apple MP4 变体 |
| AVCHD | .mts | H.264 | 摄像机录制 |
| BDAV | .m2ts | H.264 | 蓝光 / AVCHD 传输流 |
| 3GP | .3gp | H.264, MPEG-4 | 移动设备采集 |
| Flash Video | .flv | H.264, VP6 | 旧版流媒体 |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD 时代视频 |
| MPEG-TS | .ts | MPEG-2, H.264 | 广播传输流 |
| Ogg | .ogv | Theora | 开放的 Ogg 视频 |

### 输出格式 {#output-formats}

| 格式 | 扩展名 | 视频编解码器 | 生成工具 |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | 转换、压缩以及大多数视频工具 |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP（动画） |

### 字幕 {#subtitles}

| 格式 | 扩展名 | 操作 |
|--------|-----------|-----------|
| SubRip | .srt | 嵌入、烧录、提取、自动生成 |
| WebVTT | .vtt | 嵌入、烧录、提取、自动生成 |
| ASS / SSA | .ass | 嵌入、烧录（支持样式） |

## 音频格式 {#audio-formats}

音频同样由 FFmpeg 处理。

### 输入格式（11） {#input-formats-11}

| 格式 | 扩展名 | 压缩 | 备注 |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | 有损 | 通用兼容性 |
| WAV | .wav | 无压缩 (PCM) | 录音室 / 编辑 |
| FLAC | .flac | 无损 | 开放的无损编解码器 |
| AAC | .aac | 有损 | 原始 AAC 流 |
| M4A | .m4a | 有损 (AAC) / 无损 (ALAC) | MPEG-4 音频 |
| Ogg Vorbis | .ogg | 有损 | 开放格式 |
| Opus | .opus | 有损 | 现代、低延迟 |
| WMA | .wma | 有损 | Windows Media Audio |
| AIFF | .aiff | 无压缩 (PCM) | Apple 无压缩 |
| AMR | .amr | 有损 | 语音 / 移动设备 |
| AC-3 | .ac3 | 有损 | Dolby Digital |

### 输出格式 {#output-formats-1}

| 格式 | 扩展名 | 编解码器 | 生成工具 |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC（无损） | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## 文档格式 {#document-formats}

文档处理使用 qpdf、LibreOffice、Ghostscript、Pandoc 和 WeasyPrint。

### 输入格式（15） {#input-formats-15}

| 格式 | 扩展名 | 引擎 | 备注 |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | 核心文档格式 |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | 文本、表格、演示文稿 |
| Rich Text | .rtf | LibreOffice | 跨应用富文本 |
| Plain Text | .txt | LibreOffice, Pandoc | UTF-8 文本 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | 渲染为 PDF |
| EPUB | .epub | Pandoc, LibreOffice | 电子书格式 |

### 输出格式 {#output-formats-2}

| 格式 | 扩展名 | 生成工具 |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF, Markdown to PDF, HTML to PDF |
| PDF/A | .pdf | PDF/A Convert（归档） |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF to Word, Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Images | .png, .jpg | PDF to Image |

## 文件格式 {#file-formats}

数据和归档工具在结构化格式之间转换并打包文件。

| 格式 | 扩展名 | 转换 |
|--------|-----------|-------------|
| CSV | .csv | 与 JSON 和 Excel 互转；拆分和合并；从 XML 转换 |
| JSON | .json | 与 CSV、XML 和 YAML 互转 |
| XML | .xml | 与 JSON 互转；转为 CSV |
| YAML | .yaml, .yml | 与 JSON 互转 |
| Excel | .xlsx | 与 CSV 互转 |
| ZIP | .zip | 创建归档、提取内容 |
