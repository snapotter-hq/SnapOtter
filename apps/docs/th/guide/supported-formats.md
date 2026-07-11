---
description: "รูปแบบไฟล์ที่รองรับในทุกโมดัลลิตี - รูปแบบอินพุตรูปภาพ 55+ รูปแบบ, วิดีโอ, เสียง, PDF และรูปแบบไฟล์"
i18n_source_hash: e53ecf65be25
i18n_provenance: human
i18n_output_hash: 22bb1a231aab
---

# รูปแบบที่รองรับ {#supported-formats}

SnapOtter ประมวลผลไฟล์ในห้าโมดัลลิตี ได้แก่ รูปภาพ วิดีโอ เสียง PDF และไฟล์ หน้านี้แสดงรายการรูปแบบที่รองรับทั้งหมด

## รูปแบบรูปภาพ {#image-formats}

SnapOtter รองรับรูปแบบรูปภาพ 55+ รูปแบบสำหรับอินพุต และ 13 รูปแบบสำหรับเอาต์พุต

## รูปแบบอินพุต {#input-formats}

### มาตรฐานเว็บ (9) {#web-standards-9}

| รูปแบบ | นามสกุล | ตัวถอดรหัส | หมายเหตุ |
|--------|-----------|---------|-------|
| JPEG | .jpg, .jpeg | Sharp (native) | |
| PNG | .png | Sharp (native) | สกัดเฟรมแรกของ APNG |
| WebP | .webp | Sharp (native) | |
| GIF | .gif | Sharp (native) | รองรับแบบเคลื่อนไหว |
| AVIF | .avif | Sharp (native) | |
| SVG | .svg | Sharp (librsvg) | ทำให้ปลอดภัยจาก XXE/SSRF |
| SVGZ | .svgz | gunzip + Sharp | ป้องกัน Gzip bomb |
| APNG | .apng | Sharp (native) | เฉพาะเฟรมแรก |
| JPEG XL | .jxl | djxl / ImageMagick | สำรองสองระดับ |

### ระดับมืออาชีพ (7) {#professional-7}

| รูปแบบ | นามสกุล | ตัวถอดรหัส | หมายเหตุ |
|--------|-----------|---------|-------|
| TIFF | .tiff, .tif | Sharp (native) | รองรับหลายหน้า |
| PSD | .psd | ImageMagick | รวมเลเยอร์แบบแบน |
| EPS | .eps, .epsf | ImageMagick + Ghostscript | แรสเตอร์ที่ 300dpi, เสริมความปลอดภัย |
| OpenEXR | .exr | ImageMagick | แปลง Linear เป็น sRGB |
| Radiance HDR | .hdr | ImageMagick | แปลง Linear เป็น sRGB |
| DPX | .dpx | ImageMagick | แปลง Log เป็น sRGB |
| Cineon | .cin | ImageMagick | รูปแบบ Film/VFX |

### กล้อง RAW (23) {#camera-raw-23}

| รูปแบบ | นามสกุล | แบรนด์กล้อง | ตัวถอดรหัส |
|--------|-----------|-------------|---------|
| DNG | .dng | Adobe (สากล) | exiftool / ImageMagick + LibRaw |
| CR2 | .cr2 | Canon (ก่อนปี 2018) | exiftool / ImageMagick + LibRaw |
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
| FFF | .fff | Hasselblad (รุ่นเก่า) | exiftool / ImageMagick + LibRaw |
| MRW | .mrw | Minolta | exiftool / ImageMagick + LibRaw |
| MEF | .mef | Mamiya | exiftool / ImageMagick + LibRaw |
| KDC | .kdc | Kodak | exiftool / ImageMagick + LibRaw |
| DCR | .dcr | Kodak | exiftool / ImageMagick + LibRaw |
| ERF | .erf | Epson | exiftool / ImageMagick + LibRaw |
| PTX | .ptx | Pentax (compact) | exiftool / ImageMagick + LibRaw |

### รูปแบบสมัยใหม่ (3) {#modern-formats-3}

| รูปแบบ | นามสกุล | ตัวถอดรหัส | หมายเหตุ |
|--------|-----------|---------|-------|
| JPEG 2000 | .jp2, .j2k, .j2c, .jpc, .jpf, .jpx | opj_decompress / ImageMagick | ภาพยนตร์ดิจิทัล, ภาพทางการแพทย์ |
| QOI | .qoi | ตัวเข้ารหัส TypeScript แบบอินไลน์ | พัฒนาเกม, ระบบฝังตัว |
| HEIC/HEIF | .heic, .heif | heif-convert / heif-dec | รูปภาพจาก iPhone |

### รูปแบบเก่า/ระบบ (4) {#legacy-system-4}

| รูปแบบ | นามสกุล | ตัวถอดรหัส | หมายเหตุ |
|--------|-----------|---------|-------|
| BMP | .bmp | ImageMagick | |
| ICO | .ico | ImageMagick | สกัดเลเยอร์ที่ใหญ่ที่สุด |
| CUR | .cur | ImageMagick | เคอร์เซอร์ Windows (ชนิดย่อยของ ICO) |
| TGA | .tga | ImageMagick | ตรวจจับจากนามสกุลเท่านั้น |

### วิทยาศาสตร์และเกม (2) {#scientific-and-gaming-2}

| รูปแบบ | นามสกุล | ตัวถอดรหัส | หมายเหตุ |
|--------|-----------|---------|-------|
| FITS | .fits, .fit, .fts | ImageMagick | ดาราศาสตร์ (มาตรฐาน NASA) |
| DDS | .dds | ImageMagick | เท็กซ์เจอร์เกม (DirectX) |

### แลกเปลี่ยน (6) {#interchange-6}

| รูปแบบ | นามสกุล | ตัวถอดรหัส | หมายเหตุ |
|--------|-----------|---------|-------|
| PPM | .ppm | Sharp (native) | pixmap แบบสี |
| PGM | .pgm | Sharp (native) | โทนสีเทา |
| PBM | .pbm | Sharp (native) | bitmap 1 บิต |
| PNM | .pnm | Sharp (native) | รูปแบบครอบคลุม |
| PAM | .pam | Sharp (native) | แผนที่ตามอำเภอใจ |
| PFM | .pfm | Sharp (native) | แผนที่แบบ float |

## รูปแบบเอาต์พุต (13) {#output-formats-13}

| รูปแบบ | ตัวเข้ารหัส | การควบคุมคุณภาพ | มีในเครื่องมือ |
|--------|---------|----------------|-------------|
| JPEG | Sharp native | 1-100 | ทุกเครื่องมือ |
| PNG | Sharp native | การบีบอัด 0-9 | ทุกเครื่องมือ |
| WebP | Sharp native | 1-100 | ทุกเครื่องมือ |
| AVIF | Sharp native | 1-100 | ทุกเครื่องมือ |
| TIFF | Sharp native | 1-100 | เครื่องมือแปลงเต็มรูปแบบ |
| GIF | Sharp native | 1-100 | เครื่องมือแปลงเต็มรูปแบบ |
| JXL | Sharp native | 1-100 | ทุกเครื่องมือ |
| HEIC | heif-enc CLI | 1-100 | เครื่องมือแปลงเต็มรูปแบบ |
| HEIF | heif-enc CLI | 1-100 | เครื่องมือแปลงเต็มรูปแบบ |
| BMP | ImageMagick CLI | ไม่สูญเสียคุณภาพ | เครื่องมือแปลง |
| ICO | ImageMagick CLI | ไม่สูญเสียคุณภาพ | เครื่องมือแปลง |
| JP2 | opj_compress CLI | อัตราการบีบอัด | เครื่องมือแปลง |
| QOI | ตัวเข้ารหัสแบบอินไลน์ | ไม่สูญเสียคุณภาพ | เครื่องมือแปลง |

## รูปแบบวิดีโอ {#video-formats}

การถอดรหัสและเข้ารหัสวิดีโอจัดการโดย FFmpeg (static build) ดังนั้นทุกคอนเทนเนอร์และโคเดกทั่วไปจึงรองรับในอินพุต

### คอนเทนเนอร์อินพุต (15) {#input-containers-15}

| รูปแบบ | นามสกุล | โคเดกทั่วไป | หมายเหตุ |
|--------|-----------|----------------|-------|
| MP4 | .mp4 | H.264, H.265, AV1 | คอนเทนเนอร์ที่ใช้กันแพร่หลายที่สุด |
| QuickTime | .mov | H.264, ProRes | การบันทึก/ตัดต่อของ Apple |
| WebM | .webm | VP8, VP9, AV1 | รูปแบบเว็บที่ไม่มีค่าลิขสิทธิ์ |
| Matroska | .mkv | ใดก็ได้ | คอนเทนเนอร์เปิดที่ยืดหยุ่น |
| AVI | .avi | หลากหลาย | คอนเทนเนอร์ Microsoft รุ่นเก่า |
| M4V | .m4v | H.264 | ชนิดย่อย MP4 ของ Apple |
| AVCHD | .mts | H.264 | การบันทึกจากกล้องวิดีโอ |
| BDAV | .m2ts | H.264 | Blu-ray / สตรีมส่งข้อมูล AVCHD |
| 3GP | .3gp | H.264, MPEG-4 | การบันทึกบนมือถือ |
| Flash Video | .flv | H.264, VP6 | สตรีมมิงรุ่นเก่า |
| Windows Media | .wmv | VC-1, WMV | Windows Media |
| MPEG | .mpg, .mpeg | MPEG-1, MPEG-2 | วิดีโอยุค DVD |
| MPEG-TS | .ts | MPEG-2, H.264 | สตรีมส่งข้อมูลออกอากาศ |
| Ogg | .ogv | Theora | วิดีโอ Ogg แบบเปิด |

### รูปแบบเอาต์พุต {#output-formats}

| รูปแบบ | นามสกุล | โคเดกวิดีโอ | สร้างโดย |
|--------|-----------|-------------|-------------|
| MP4 | .mp4 | H.264 | แปลง, บีบอัด และเครื่องมือวิดีโอส่วนใหญ่ |
| QuickTime | .mov | H.264 | แปลงวิดีโอ |
| WebM | .webm | VP9 | แปลงวิดีโอ |
| GIF | .gif | - | วิดีโอเป็น GIF |
| WebP | .webp | - | วิดีโอเป็น WebP (แบบเคลื่อนไหว) |

### คำบรรยาย {#subtitles}

| รูปแบบ | นามสกุล | การดำเนินการ |
|--------|-----------|-----------|
| SubRip | .srt | ฝัง, เบิร์นอิน, สกัด, สร้างอัตโนมัติ |
| WebVTT | .vtt | ฝัง, เบิร์นอิน, สกัด, สร้างอัตโนมัติ |
| ASS / SSA | .ass | ฝัง, เบิร์นอิน (รองรับการจัดรูปแบบ) |

## รูปแบบเสียง {#audio-formats}

เสียงก็ประมวลผลโดย FFmpeg เช่นกัน

### รูปแบบอินพุต (11) {#input-formats-11}

| รูปแบบ | นามสกุล | การบีบอัด | หมายเหตุ |
|--------|-----------|-------------|-------|
| MP3 | .mp3 | สูญเสียคุณภาพ | เข้ากันได้ทั่วไป |
| WAV | .wav | ไม่บีบอัด (PCM) | สตูดิโอ / ตัดต่อ |
| FLAC | .flac | ไม่สูญเสียคุณภาพ | โคเดกไม่สูญเสียคุณภาพแบบเปิด |
| AAC | .aac | สูญเสียคุณภาพ | สตรีม AAC แบบดิบ |
| M4A | .m4a | สูญเสียคุณภาพ (AAC) / ไม่สูญเสียคุณภาพ (ALAC) | เสียง MPEG-4 |
| Ogg Vorbis | .ogg | สูญเสียคุณภาพ | รูปแบบเปิด |
| Opus | .opus | สูญเสียคุณภาพ | สมัยใหม่, หน่วงเวลาต่ำ |
| WMA | .wma | สูญเสียคุณภาพ | Windows Media Audio |
| AIFF | .aiff | ไม่บีบอัด (PCM) | ไม่บีบอัดของ Apple |
| AMR | .amr | สูญเสียคุณภาพ | เสียงพูด / มือถือ |
| AC-3 | .ac3 | สูญเสียคุณภาพ | Dolby Digital |

### รูปแบบเอาต์พุต {#output-formats-1}

| รูปแบบ | นามสกุล | โคเดก | สร้างโดย |
|--------|-----------|-------|-------------|
| MP3 | .mp3 | LAME | แปลงเสียง, สกัดเสียง |
| WAV | .wav | PCM | แปลงเสียง, สกัดเสียง |
| FLAC | .flac | FLAC (ไม่สูญเสียคุณภาพ) | แปลงเสียง |
| Ogg | .ogg | Vorbis | แปลงเสียง |
| M4A | .m4a | AAC | แปลงเสียง, สกัดเสียง |

## รูปแบบเอกสาร {#document-formats}

การประมวลผลเอกสารใช้ qpdf, LibreOffice, Ghostscript, Pandoc และ WeasyPrint

### รูปแบบอินพุต (15) {#input-formats-15}

| รูปแบบ | นามสกุล | เอนจิน | หมายเหตุ |
|--------|-----------|--------|-------|
| PDF | .pdf | qpdf, Ghostscript, pdfcpu | รูปแบบเอกสารหลัก |
| Word | .docx, .doc | LibreOffice | Microsoft Word |
| Excel | .xlsx, .xls | LibreOffice | Microsoft Excel |
| PowerPoint | .pptx, .ppt | LibreOffice | Microsoft PowerPoint |
| OpenDocument | .odt, .ods, .odp | LibreOffice | ข้อความ, ตาราง, งานนำเสนอ |
| Rich Text | .rtf | LibreOffice | rich text ข้ามแอป |
| Plain Text | .txt | LibreOffice, Pandoc | ข้อความ UTF-8 |
| Markdown | .md | Pandoc | CommonMark / GFM |
| HTML | .html | WeasyPrint | เรนเดอร์เป็น PDF |
| EPUB | .epub | Pandoc, LibreOffice | รูปแบบ E-book |

### รูปแบบเอาต์พุต {#output-formats-2}

| รูปแบบ | นามสกุล | สร้างโดย |
|--------|-----------|-------------|
| PDF | .pdf | Word/Excel/PowerPoint เป็น PDF, Markdown เป็น PDF, HTML เป็น PDF |
| PDF/A | .pdf | แปลง PDF/A (เก็บถาวร) |
| Word | .docx, .odt, .rtf, .txt | แปลงเอกสาร, PDF เป็น Word, Markdown เป็น Word |
| Presentation | .pptx, .odp | แปลงงานนำเสนอ |
| Spreadsheet | .xlsx, .ods, .csv | แปลงสเปรดชีต |
| HTML | .html | Markdown เป็น HTML |
| EPUB | .epub | แปลงเป็น EPUB |
| Images | .png, .jpg | PDF เป็นรูปภาพ |

## รูปแบบไฟล์ {#file-formats}

เครื่องมือข้อมูลและไฟล์บีบอัดจะแปลงระหว่างรูปแบบที่มีโครงสร้างและรวมไฟล์เข้าด้วยกัน

| รูปแบบ | นามสกุล | การแปลง |
|--------|-----------|-------------|
| CSV | .csv | เป็น/จาก JSON และ Excel; แยกและรวม; จาก XML |
| JSON | .json | เป็น/จาก CSV, XML และ YAML |
| XML | .xml | เป็น/จาก JSON; เป็น CSV |
| YAML | .yaml, .yml | เป็น/จาก JSON |
| Excel | .xlsx | เป็น/จาก CSV |
| ZIP | .zip | สร้างไฟล์บีบอัด, สกัดเนื้อหา |
