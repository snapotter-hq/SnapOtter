---
description: "모든 모달리티에 걸친 지원 파일 형식 - 55개 이상의 이미지 입력 형식, 비디오, 오디오, PDF, 파일 형식."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: efecd9f818d0
---

# 지원 형식 {#supported-formats}

SnapOtter는 이미지, 비디오, 오디오, PDF, 파일의 다섯 가지 모달리티에 걸쳐 파일을 처리합니다. 이 페이지는 지원되는 모든 형식을 나열합니다.

## 이미지 형식 {#image-formats}

SnapOtter는 입력에 55개 이상, 출력에 13개 이미지 형식을 지원합니다.

## 입력 형식 {#input-formats}

### 웹 표준 (9) {#web-standards-9}

| 형식 | 확장자 | 디코더 | 비고 |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (네이티브) | |
| PNG | .png | Sharp (네이티브) | APNG 첫 프레임 추출 |
| WebP | .webp | Sharp (네이티브) | |
| GIF | .gif | Sharp (네이티브) | 애니메이션 지원 |
| AVIF | .avif | Sharp (네이티브) | |
| SVG | .svg | Sharp (librsvg) | XXE/SSRF에 대해 정화됨 |
| SVGZ | .svgz | gunzip + Sharp | Gzip 폭탄 보호 |
| APNG | .apng | Sharp (네이티브) | 첫 프레임만 |
| JPEG XL | .jxl | djxl / ImageMagick | 2단계 폴백 |

### 프로페셔널 (7) {#professional-7}

| 형식 | 확장자 | 디코더 | 비고 |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (네이티브) | 다중 페이지 지원 |
| PSD | .psd | ImageMagick | 병합된 컴포지트 |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | 300dpi 래스터화, 보안 강화 |
| OpenEXR | .exr | ImageMagick | Linear-to-sRGB 변환 |
| Radiance HDR | .hdr | ImageMagick | Linear-to-sRGB 변환 |
| DPX | .dpx | ImageMagick | Log-to-sRGB 변환 |
| Cineon | .cin | ImageMagick | 필름/VFX 형식 |

### 카메라 RAW (23) {#camera-raw-23}

| 형식 | 확장자 | 카메라 브랜드 | 디코더 |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (범용) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (2018년 이전) | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon (2018년 이후) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (레거시) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (컴팩트) | exiftool / ImageMagick + LibRaw |

### 최신 형식 (3) {#modern-formats-3}

| 형식 | 확장자 | 디코더 | 비고 |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | 디지털 시네마, 의료 영상 |
| QOI | .qoi | 인라인 TypeScript 코덱 | 게임 개발, 임베디드 시스템 |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | iPhone 사진 |

### 레거시/시스템 (4) {#legacy-system-4}

| 형식 | 확장자 | 디코더 | 비고 |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | 가장 큰 레이어 추출 |
| CUR | .cur | ImageMagick | Windows 커서 (ICO 변형) |
| TGA | .tga | ImageMagick | 확장자 전용 감지 |

### 과학 및 게임 (2) {#scientific-and-gaming-2}

| 형식 | 확장자 | 디코더 | 비고 |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | 천문학 (NASA 표준) |
| DDS | .dds | ImageMagick | 게임 텍스처 (DirectX) |

### 인터체인지 (6) {#interchange-6}

| 형식 | 확장자 | 디코더 | 비고 |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (네이티브) | 컬러 픽스맵 |
| PGM | .pgm | Sharp (네이티브) | 그레이스케일 |
| PBM | .pbm | Sharp (네이티브) | 1비트 비트맵 |
| PNM | .pnm | Sharp (네이티브) | 포괄 형식 |
| PAM | .pam | Sharp (네이티브) | 임의 맵 |
| PFM | .pfm | Sharp (네이티브) | 부동소수점 맵 |

## 출력 형식 (13) {#output-formats-13}

| 형식 | 인코더 | 품질 제어 | 사용 가능 위치 |
|--------|---------|----------------|-------------|
| JPEG | Sharp 네이티브 | 1-100 | 모든 도구 |
| PNG | Sharp 네이티브 | 압축 0-9 | 모든 도구 |
| WebP | Sharp 네이티브 | 1-100 | 모든 도구 |
| AVIF | Sharp 네이티브 | 1-100 | 모든 도구 |
| TIFF | Sharp 네이티브 | 1-100 | 전체 변환 도구 |
| GIF | Sharp 네이티브 | 1-100 | 전체 변환 도구 |
| JXL | Sharp 네이티브 | 1-100 | 모든 도구 |
| HEIC | heif-enc CLI | 1-100 | 전체 변환 도구 |
| HEIF | heif-enc CLI | 1-100 | 전체 변환 도구 |
| BMP | ImageMagick CLI | 무손실 | Convert 도구 |
| ICO | ImageMagick CLI | 무손실 | Convert 도구 |
| JP2 | opj_compress CLI | 압축비 | Convert 도구 |
| QOI | 인라인 코덱 | 무손실 | Convert 도구 |

## 비디오 형식 {#video-formats}

비디오 디코딩과 인코딩은 FFmpeg(정적 빌드)로 처리되므로 모든 일반적인 컨테이너와 코덱이 입력에서 지원됩니다.

### 입력 컨테이너 (15) {#input-containers-15}

| 형식 | 확장자 | 일반적인 코덱 | 비고 |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | 가장 널리 사용되는 컨테이너 |
| QuickTime | .mov | H.264, ProRes | Apple 캡처/편집 |
| WebM | .webm | VP8, VP9, AV1 | 로열티 없는 웹 형식 |
| Matroska | .mkv | 모든 코덱 | 유연한 오픈 컨테이너 |
| AVI | .avi | 다양 | 레거시 Microsoft 컨테이너 |
| M4V | .m4v | H.264 | Apple MP4 변형 |
| AVCHD | .mts | H.264 | 캠코더 녹화 |
| BDAV | .m2ts | H.264 | Blu-ray / AVCHD 전송 스트림 |
| 3GP | .3gp | H.264, MPEG-4 | 모바일 캡처 |
| Flash Video | .flv | H.264, VP6 | 레거시 스트리밍 |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | DVD 시대 비디오 |
| MPEG-TS | .ts | MPEG-2, H.264 | 방송 전송 스트림 |
| Ogg | .ogv | Theora | 오픈 Ogg 비디오 |

### 출력 형식 {#output-formats}

| 형식 | 확장자 | 비디오 코덱 | 생성 도구 |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Convert, compress 및 대부분의 비디오 도구 |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP (애니메이션) |

### 자막 {#subtitles}

| 형식 | 확장자 | 작업 |
|--------|-----------|-----------|
| SubRip | .srt | 임베드, 번인, 추출, 자동 생성 |
| WebVTT | .vtt | 임베드, 번인, 추출, 자동 생성 |
| ASS / SSA | .ass | 임베드, 번인 (스타일링 지원) |

## 오디오 형식 {#audio-formats}

오디오도 FFmpeg로 처리됩니다.

### 입력 형식 (11) {#input-formats-11}

| 형식 | 확장자 | 압축 | 비고 |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | 손실 | 범용 호환성 |
| WAV | .wav | 무압축 (PCM) | 스튜디오 / 편집 |
| FLAC | .flac | 무손실 | 오픈 무손실 코덱 |
| AAC | .aac | 손실 | 원시 AAC 스트림 |
| M4A | .m4a | 손실 (AAC) / 무손실 (ALAC) | MPEG-4 오디오 |
| Ogg Vorbis | .ogg | 손실 | 오픈 형식 |
| Opus | .opus | 손실 | 최신, 저지연 |
| WMA | .wma | 손실 | Windows Media Audio |
| AIFF | .aiff | 무압축 (PCM) | Apple 무압축 |
| AMR | .amr | 손실 | 음성 / 모바일 |
| AC-3 | .ac3 | 손실 | Dolby Digital |

### 출력 형식 {#output-formats-1}

| 형식 | 확장자 | 코덱 | 생성 도구 |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (무손실) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## 문서 형식 {#document-formats}

문서 처리는 qpdf, LibreOffice, Ghostscript, Pandoc, WeasyPrint를 사용합니다.

### 입력 형식 (15) {#input-formats-15}

| 형식 | 확장자 | 엔진 | 비고 |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | 핵심 문서 형식 |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | 텍스트, 시트, 프레젠테이션 |
| Rich Text | .rtf | LibreOffice | 앱 간 서식 있는 텍스트 |
| Plain Text | .txt | LibreOffice, Pandoc | UTF-8 텍스트 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | PDF로 렌더링 |
| EPUB | .epub | Pandoc, LibreOffice | 전자책 형식 |

### 출력 형식 {#output-formats-2}

| 형식 | 확장자 | 생성 도구 |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF, Markdown to PDF, HTML to PDF |
| PDF/A | .pdf | PDF/A Convert (아카이브용) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF to Word, Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Images | .png, .jpg | PDF to Image |

## 파일 형식 {#file-formats}

데이터 및 아카이브 도구는 구조화된 형식 간 변환과 파일 번들링을 수행합니다.

| 형식 | 확장자 | 변환 |
|--------|-----------|-------------|
| CSV | .csv | JSON 및 Excel과 상호 변환, 분할 및 병합, XML에서 변환 |
| JSON | .json | CSV, XML, YAML과 상호 변환 |
| XML | .xml | JSON과 상호 변환, CSV로 변환 |
| YAML | .yaml, .yml | JSON과 상호 변환 |
| Excel | .xlsx | CSV와 상호 변환 |
| ZIP | .zip | 아카이브 생성, 내용 추출 |
