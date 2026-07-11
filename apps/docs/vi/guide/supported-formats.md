---
description: "Các định dạng tệp được hỗ trợ trên tất cả các modality - hơn 55 định dạng đầu vào hình ảnh, video, audio, PDF, và các định dạng tệp."
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 5b1dbbf657f1
---

# Các định dạng được hỗ trợ {#supported-formats}

SnapOtter xử lý tệp trên năm modality: hình ảnh, video, audio, PDF, và tệp. Trang này liệt kê tất cả các định dạng được hỗ trợ.

## Định dạng hình ảnh {#image-formats}

SnapOtter hỗ trợ hơn 55 định dạng hình ảnh đầu vào và 13 định dạng đầu ra.

## Định dạng đầu vào {#input-formats}

### Chuẩn Web (9) {#web-standards-9}

| Định dạng | Phần mở rộng | Bộ giải mã | Ghi chú |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | Trích xuất khung hình đầu tiên của APNG |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | Hỗ trợ ảnh động |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | Được làm sạch chống XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | Bảo vệ chống Gzip bomb |
| APNG | .apng | Sharp (native) | Chỉ khung hình đầu tiên |
| JPEG XL | .jxl | djxl / ImageMagick | Dự phòng hai tầng |

### Chuyên nghiệp (7) {#professional-7}

| Định dạng | Phần mở rộng | Bộ giải mã | Ghi chú |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | Hỗ trợ nhiều trang |
| PSD | .psd | ImageMagick | Composite được làm phẳng |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | Rasterize 300dpi, tăng cường bảo mật |
| OpenEXR | .exr | ImageMagick | Chuyển đổi Linear-to-sRGB |
| Radiance HDR | .hdr | ImageMagick | Chuyển đổi Linear-to-sRGB |
| DPX | .dpx | ImageMagick | Chuyển đổi Log-to-sRGB |
| Cineon | .cin | ImageMagick | Định dạng Film/VFX |

### Camera RAW (23) {#camera-raw-23}

| Định dạng | Phần mở rộng | Hãng máy ảnh | Bộ giải mã |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (phổ quát) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (trước 2018) | exiftool / ImageMagick + LibRaw |
| CR3 | .cr3 | Canon (2018+) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (cũ) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compact) | exiftool / ImageMagick + LibRaw |

### Định dạng hiện đại (3) {#modern-formats-3}

| Định dạng | Phần mở rộng | Bộ giải mã | Ghi chú |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | Điện ảnh số, chẩn đoán hình ảnh y tế |
| QOI | .qoi | Codec TypeScript nội tuyến | Phát triển game, hệ thống nhúng |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | Ảnh iPhone |

### Cũ/Hệ thống (4) {#legacy-system-4}

| Định dạng | Phần mở rộng | Bộ giải mã | Ghi chú |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | Trích xuất layer lớn nhất |
| CUR | .cur | ImageMagick | Con trỏ Windows (biến thể ICO) |
| TGA | .tga | ImageMagick | Chỉ phát hiện theo phần mở rộng |

### Khoa học và Game (2) {#scientific-and-gaming-2}

| Định dạng | Phần mở rộng | Bộ giải mã | Ghi chú |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | Thiên văn học (chuẩn NASA) |
| DDS | .dds | ImageMagick | Texture game (DirectX) |

### Trao đổi (6) {#interchange-6}

| Định dạng | Phần mở rộng | Bộ giải mã | Ghi chú |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | Pixmap màu |
| PGM | .pgm | Sharp (native) | Thang xám |
| PBM | .pbm | Sharp (native) | Bitmap 1-bit |
| PNM | .pnm | Sharp (native) | Định dạng tổng hợp |
| PAM | .pam | Sharp (native) | Bản đồ tùy ý |
| PFM | .pfm | Sharp (native) | Bản đồ số thực |

## Định dạng đầu ra (13) {#output-formats-13}

| Định dạng | Bộ mã hóa | Kiểm soát chất lượng | Có sẵn trong |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | Tất cả công cụ |
| PNG | Sharp native | Nén 0-9 | Tất cả công cụ |
| WebP | Sharp native | 1-100 | Tất cả công cụ |
| AVIF | Sharp native | 1-100 | Tất cả công cụ |
| TIFF | Sharp native | 1-100 | Công cụ chuyển đổi đầy đủ |
| GIF | Sharp native | 1-100 | Công cụ chuyển đổi đầy đủ |
| JXL | Sharp native | 1-100 | Tất cả công cụ |
| HEIC | heif-enc CLI | 1-100 | Công cụ chuyển đổi đầy đủ |
| HEIF | heif-enc CLI | 1-100 | Công cụ chuyển đổi đầy đủ |
| BMP | ImageMagick CLI | Không mất dữ liệu | Công cụ chuyển đổi |
| ICO | ImageMagick CLI | Không mất dữ liệu | Công cụ chuyển đổi |
| JP2 | opj_compress CLI | Tỷ lệ nén | Công cụ chuyển đổi |
| QOI | Codec nội tuyến | Không mất dữ liệu | Công cụ chuyển đổi |

## Định dạng video {#video-formats}

Việc giải mã và mã hóa video được xử lý bởi FFmpeg (bản build tĩnh), nên mọi container và codec phổ biến đều được hỗ trợ ở đầu vào.

### Container đầu vào (15) {#input-containers-15}

| Định dạng | Phần mở rộng | Codec điển hình | Ghi chú |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | Container được dùng rộng rãi nhất |
| QuickTime | .mov | H.264, ProRes | Quay/chỉnh sửa của Apple |
| WebM | .webm | VP8, VP9, AV1 | Định dạng web miễn phí bản quyền |
| Matroska | .mkv | Bất kỳ | Container mở linh hoạt |
| AVI | .avi | Đa dạng | Container Microsoft cũ |
| M4V | .m4v | H.264 | Biến thể MP4 của Apple |
| AVCHD | .mts | H.264 | Bản ghi máy quay |
| BDAV | .m2ts | H.264 | Luồng truyền tải Blu-ray / AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | Quay trên di động |
| Flash Video | .flv | H.264, VP6 | Streaming cũ |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | Video thời DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | Luồng truyền tải phát sóng |
| Ogg | .ogv | Theora | Video Ogg mở |

### Định dạng đầu ra {#output-formats}

| Định dạng | Phần mở rộng | Codec video | Được tạo bởi |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | Chuyển đổi, nén, và hầu hết các công cụ video |
| QuickTime | .mov | H.264 | Convert Video |
| WebM | .webm | VP9 | Convert Video |
| GIF | .gif | - | Video to GIF |
| WebP | .webp | - | Video to WebP (ảnh động) |

### Phụ đề {#subtitles}

| Định dạng | Phần mở rộng | Thao tác |
|--------|-----------|-----------|
| SubRip | .srt | Nhúng, khắc lên hình, trích xuất, tự động tạo |
| WebVTT | .vtt | Nhúng, khắc lên hình, trích xuất, tự động tạo |
| ASS / SSA | .ass | Nhúng, khắc lên hình (hỗ trợ định kiểu) |

## Định dạng audio {#audio-formats}

Audio cũng được xử lý bởi FFmpeg.

### Định dạng đầu vào (11) {#input-formats-11}

| Định dạng | Phần mở rộng | Nén | Ghi chú |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | Có mất dữ liệu | Tương thích phổ quát |
| WAV | .wav | Không nén (PCM) | Studio / chỉnh sửa |
| FLAC | .flac | Không mất dữ liệu | Codec không mất dữ liệu mở |
| AAC | .aac | Có mất dữ liệu | Luồng AAC thô |
| M4A | .m4a | Có mất dữ liệu (AAC) / Không mất dữ liệu (ALAC) | Audio MPEG-4 |
| Ogg Vorbis | .ogg | Có mất dữ liệu | Định dạng mở |
| Opus | .opus | Có mất dữ liệu | Hiện đại, độ trễ thấp |
| WMA | .wma | Có mất dữ liệu | Windows Media Audio |
| AIFF | .aiff | Không nén (PCM) | Không nén của Apple |
| AMR | .amr | Có mất dữ liệu | Giọng nói / di động |
| AC-3 | .ac3 | Có mất dữ liệu | Dolby Digital |

### Định dạng đầu ra {#output-formats-1}

| Định dạng | Phần mở rộng | Codec | Được tạo bởi |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | Convert Audio, Extract Audio |
| WAV | .wav | PCM | Convert Audio, Extract Audio |
| FLAC | .flac | FLAC (không mất dữ liệu) | Convert Audio |
| Ogg | .ogg | Vorbis | Convert Audio |
| M4A | .m4a | AAC | Convert Audio, Extract Audio |

## Định dạng tài liệu {#document-formats}

Việc xử lý tài liệu dùng qpdf, LibreOffice, Ghostscript, Pandoc, và WeasyPrint.

### Định dạng đầu vào (15) {#input-formats-15}

| Định dạng | Phần mở rộng | Engine | Ghi chú |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | Định dạng tài liệu cốt lõi |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | Văn bản, bảng tính, thuyết trình |
| Rich Text | .rtf | LibreOffice | Văn bản định dạng đa ứng dụng |
| Plain Text | .txt | LibreOffice, Pandoc | Văn bản UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | Kết xuất thành PDF |
| EPUB | .epub | Pandoc, LibreOffice | Định dạng sách điện tử |

### Định dạng đầu ra {#output-formats-2}

| Định dạng | Phần mở rộng | Được tạo bởi |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint to PDF, Markdown to PDF, HTML to PDF |
| PDF/A | .pdf | PDF/A Convert (lưu trữ) |
| Word | .docx, .odt, .rtf, .txt | Convert Document, PDF to Word, Markdown to Word |
| Presentation | .pptx, .odp | Convert Presentation |
| Spreadsheet | .xlsx, .ods, .csv | Convert Spreadsheet |
| HTML | .html | Markdown to HTML |
| EPUB | .epub | Convert to EPUB |
| Images | .png, .jpg | PDF to Image |

## Định dạng tệp {#file-formats}

Các công cụ dữ liệu và lưu trữ chuyển đổi giữa các định dạng có cấu trúc và đóng gói tệp.

| Định dạng | Phần mở rộng | Chuyển đổi |
|--------|-----------|-------------|
| CSV | .csv | Sang/từ JSON và Excel; tách và gộp; từ XML |
| JSON | .json | Sang/từ CSV, XML, và YAML |
| XML | .xml | Sang/từ JSON; sang CSV |
| YAML | .yaml, .yml | Sang/từ JSON |
| Excel | .xlsx | Sang/từ CSV |
| ZIP | .zip | Tạo lưu trữ, trích xuất nội dung |
