---
description: "Referensi REST API lengkap. Endpoint tool, pemrosesan batch, pipeline, pustaka file, autentikasi, tim, dan operasi admin."
i18n_source_hash: eb73a14533a1
i18n_provenance: human
i18n_output_hash: 6e166e062a18
---

# Referensi REST API {#rest-api-reference}

Dokumentasi API interaktif dengan contoh request/response tersedia di [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Spesifikasi yang dapat dibaca mesin:
- `/api/v1/openapi.yaml` - Spesifikasi OpenAPI 3.1
- `/llms.txt` - Ringkasan ramah LLM
- `/llms-full.txt` - Dokumentasi lengkap ramah LLM

## Autentikasi {#authentication}

Semua endpoint memerlukan autentikasi kecuali `AUTH_ENABLED=false`.

### Token Sesi {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

Sesi kedaluwarsa setelah 7 hari (dapat dikonfigurasi melalui `SESSION_DURATION_HOURS`).

### API Key {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

Key diberi prefiks `si_` dan disimpan sebagai hash scrypt - key mentah ditampilkan sekali dan tidak pernah dapat diambil kembali.

### Endpoint Auth {#auth-endpoints}

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Publik | Login, dapatkan token sesi |
| `POST` | `/api/auth/logout` | Auth | Hapus sesi saat ini |
| `GET` | `/api/auth/session` | Auth | Validasi sesi saat ini |
| `POST` | `/api/auth/change-password` | Auth | Ubah kata sandi sendiri (membatalkan semua sesi lain + API key) |
| `GET` | `/api/auth/users` | Admin | Daftar semua pengguna |
| `POST` | `/api/auth/register` | Admin | Buat pengguna baru |
| `PUT` | `/api/auth/users/:id` | Admin | Perbarui peran atau tim pengguna |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Setel ulang kata sandi pengguna |
| `DELETE` | `/api/auth/users/:id` | Admin | Hapus pengguna |
| `GET` | `/api/v1/config/auth` | Publik | Periksa apakah autentikasi diaktifkan (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Auth | Mulai pendaftaran TOTP MFA. Memerlukan fitur enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Auth | Konfirmasi pendaftaran MFA dengan kode TOTP |
| `POST` | `/api/auth/mfa/complete` | Publik | Selesaikan tantangan login MFA yang tertunda |
| `POST` | `/api/auth/mfa/disable` | Auth | Nonaktifkan MFA untuk pengguna saat ini |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Setel ulang MFA untuk pengguna |
| `GET` | `/api/auth/oidc/login` | Publik | Mulai login OIDC saat OIDC diaktifkan |
| `GET` | `/api/auth/oidc/callback` | Publik | Callback otorisasi OIDC |
| `GET` | `/api/auth/saml/metadata` | Publik | XML metadata SAML SP saat SAML diaktifkan |
| `GET` | `/api/auth/saml/login` | Publik | Mulai login SAML |
| `POST` | `/api/auth/saml/callback` | Publik | SAML assertion consumer service |

Saat MFA diaktifkan untuk seorang pengguna, `POST /api/auth/login` mengembalikan `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` alih-alih token sesi. Kirim `mfaToken` tersebut beserta kode TOTP atau kode pemulihan ke `/api/auth/mfa/complete`.

### Izin {#permissions}

| Izin | Admin | User |
|-----------|:-----:|:----:|
| Gunakan tool | ✓ | ✓ |
| File/pipeline/API key milik sendiri | ✓ | ✓ |
| Lihat file/pipeline/key semua pengguna | ✓ | - |
| Tulis pengaturan | ✓ | - |
| Kelola pengguna & tim | ✓ | - |
| Kelola branding | ✓ | - |

## Health Check {#health-check}

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Publik | Health check dasar. Mengembalikan `{"status":"healthy","version":"..."}` dengan 200, atau `{"status":"unhealthy"}` dengan 503 jika basis data tidak dapat dijangkau. |
| `GET` | `/api/v1/readyz` | Publik | Readiness probe. Memeriksa PostgreSQL, Redis, ruang disk, dan S3 saat dikonfigurasi. Mengembalikan 503 saat instansi tidak seharusnya menerima trafik. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Diagnostik terperinci termasuk uptime, mode penyimpanan, status basis data, keadaan antrean, dan ketersediaan GPU. |

## Menggunakan Tool {#using-tools}

Setiap tool mengikuti pola yang sama:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` adalah salah satu dari `image`, `video`, `audio`, `pdf`, atau `files`.

- Unggahan bersifat `multipart/form-data`.
- `settings` adalah string JSON dengan opsi khusus tool.
- `clientJobId` adalah field form opsional untuk korelasi progres yang disediakan pemanggil.
- `fileId` adalah field form opsional yang merujuk item pustaka file yang sudah ada. Saat ada, output yang diproses disimpan sebagai versi baru dan response menyertakan `savedFileId`.
- **Tool cepat** biasanya mengembalikan JSON 200: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Ambil file yang diproses dari `downloadUrl`.
- **Setiap tool yang diantrekan** dapat mengembalikan JSON 202 jika berjalan lama atau melampaui jendela tunggu sinkron: `{"jobId":"...","async":true}`. Sambungkan ke SSE untuk progres, lalu unduh saat selesai (lihat [Pelacakan Progres](#progress-tracking)).
- **Batch** route mengembalikan arsip ZIP yang di-stream langsung (dengan header `X-Job-Id`) untuk tool yang terdaftar dalam registry batch generik.

## Referensi Tool {#tools-reference}

### Preset Konversi {#conversion-presets}

Katalog bersama mencakup 83 endpoint preset konversi khusus seperti `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg`, dan `excel-to-csv`. Preset adalah route tool kelas satu:

`POST /api/v1/tools/<section>/<presetId>`

Setiap preset mengunci format output dan mendelegasikan ke tool dasar seperti `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster`, atau `convert-spreadsheet`. Lihat [Preset Konversi](/id/tools/conversion-presets) untuk tabel route lengkap dan pengaturan opsional.

### Esensial {#essentials}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `resize` | Resize | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, ditambah 23 preset media sosial |
| `crop` | Crop | `left`, `top`, `width`, `height`, `unit` (px/persen) |
| `rotate` | Rotate & Flip | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Convert | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Compress | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Optimasi {#optimization}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `optimize-for-web` | Optimize for Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Strip Metadata | - |
| `edit-metadata` | Edit Metadata | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Bulk Rename | `pattern` (mendukung `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Image to PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon Generator | `padding`, `backgroundColor`, `borderRadius` - menghasilkan semua ukuran standar |

### Penyesuaian {#adjustments}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `adjust-colors` | Adjust Colors | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Sharpening | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Replace Color | `sourceColor`, `targetColor` (pengganti), `makeTransparent`, `tolerance` |
| `color-blindness` | Color Blindness Simulation | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, default "deuteranomaly") |
| `duotone` | Duotone | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelate | `blockSize` (2-128), `region` ({left, top, width, height} untuk pikselasi parsial) |
| `vignette` | Vignette | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Tool AI {#ai-tools}

Semua tool AI berjalan di perangkat keras Anda: CPU secara default, atau NVIDIA CUDA saat GPU NVIDIA yang didukung tersedia. Akselerasi iGPU Intel/AMD melalui VA-API, Quick Sync, atau OpenCL tidak didukung untuk inferensi AI saat ini. Tidak memerlukan internet.

| ID Tool | Nama | Model AI | Pengaturan utama |
|---------|------|---------|-------------|
| `remove-background` | Remove Background | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Image Upscaling | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Object Eraser | LaMa (ONNX) | Mask dikirim sebagai bagian file kedua (fieldname `mask`), `format`, `quality` |
| `ocr` | OCR / Text Extraction | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Face / PII Blur | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Smart Crop | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Image Enhancement | Berbasis analisis | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Face Enhancement | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | AI Colorization | DDColor | `intensity`, `model` |
| `noise-removal` | Noise Removal | Denoising berjenjang | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Red Eye Removal | Landmark wajah + analisis warna | `sensitivity`, `strength` |
| `restore-photo` | Photo Restoration | Pipeline multi-langkah | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Passport Photo | Landmark MediaPipe | Alur dua fase. Analyze menggunakan multipart `file`; generate menggunakan JSON dengan `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), landmark, dimensi gambar |
| `content-aware-resize` | Content-Aware Resize | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG Transparency Fixer | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Background Replace | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Blur Background | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | AI Canvas Expand | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Watermark & Overlay {#watermark-overlay}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `watermark-text` | Text Watermark | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Image Watermark | `opacity`, `position`, `scale` - file kedua adalah watermark |
| `text-overlay` | Text Overlay | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Image Composition | `x`, `y`, `opacity`, `blend` - file kedua dilapiskan di atas |
| `meme-generator` | Meme Generator | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Mendukung mode template (body JSON dengan `templateId`) atau mode gambar kustom (multipart dengan file). |

### Utilitas {#utilities}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `info` | Image Info | - (mengembalikan width, height, format, size, channels, hasAlpha, DPI, EXIF) |
| `compare` | Image Compare | `mode` (side-by-side/overlay/diff), `diffThreshold` - file kedua adalah target perbandingan |
| `find-duplicates` | Find Duplicates | `threshold` (jarak perceptual hash, default 8) - multi-file |
| `color-palette` | Color Palette | `count` (jumlah warna dominan), `format` (hex/rgb) |
| `qr-generate` | QR Code Generator | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (file opsional) |
| `barcode-read` | Barcode Reader | - (mendeteksi otomatis QR, EAN, Code128, DataMatrix, dll.) |
| `image-to-base64` | Image to Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML to Image | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - mengembalikan bagan histogram RGB + statistik per-channel |
| `lqip-placeholder` | LQIP Placeholder | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Barcode Generator | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Body JSON, tanpa unggahan file. |

### Tata Letak & Komposisi {#layout-composition}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `collage` | Collage / Grid | `template` (25+ tata letak), `gap`, `backgroundColor`, `borderRadius` - multi-file |
| `stitch` | Stitch / Combine | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - multi-file |
| `split` | Image Splitting | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Border & Frame | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Beautify Screenshot | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Circle Crop | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Image Pad | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - multi-file (2-64 gambar) |

### Format & Konversi {#format-conversion}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `svg-to-raster` | SVG to Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Image to SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF Tools | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), parameter khusus aksi |
| `gif-webp` | GIF/WebP Converter | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Tool Video {#video-tools}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `convert-video` | Convert Video | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Compress Video | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Trim Video | `startS`, `endS`, `precise` (bool, potongan akurat per frame) |
| `mute-video` | Mute Video | - |
| `video-to-gif` | Video to GIF | `fps` (1-30), `width`, `startS`, `durationS` (maks 60d) |
| `resize-video` | Resize Video | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Crop Video | `width`, `height`, `x`, `y` |
| `rotate-video` | Rotate Video | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Change FPS | `fps` (1-120) |
| `video-color` | Video Color | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Video Speed | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Reverse Video | - (maks 5 menit) |
| `video-loudnorm` | Normalize Audio | - (EBU R128) |
| `aspect-pad` | Aspect Pad | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Blur Pad | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Watermark Video | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Stabilize Video | `smoothing` (5-60, dalam frame) |
| `gif-to-video` | GIF to Video | `format` (mp4/webm/mov) |
| `video-to-webp` | Video to WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Video to Frames | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Merge Videos | - (multi-file, dinormalisasi ke resolusi video pertama) |
| `replace-audio` | Replace Audio | - (file video + audio, dua file) |
| `burn-subtitles` | Burn Subtitles | `fontSize` (8-72) - file video + subtitle |
| `embed-subtitles` | Embed Subtitles | `language` (kode ISO 639-2/B) - file video + subtitle |
| `extract-subtitles` | Extract Subtitles | - (menghasilkan SRT) |
| `images-to-video` | Images to Video | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - multi-file |
| `video-metadata` | Clean Video Metadata | - |
| `auto-subtitles` | Auto Subtitles (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extract Audio | `format` (mp3/wav/m4a/ogg) |

### Tool Audio {#audio-tools}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `convert-audio` | Convert Audio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Trim Audio | `startS`, `endS` |
| `volume-adjust` | Volume Adjust | `gainDb` (-30 sampai 30) |
| `normalize-audio` | Normalize Audio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fade Audio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Reverse Audio | - |
| `audio-speed` | Audio Speed | `factor` (0.25-4) |
| `pitch-shift` | Pitch Shift | `semitones` (-12 sampai 12) |
| `audio-channels` | Audio Channels | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Silence Removal | `thresholdDb` (-80 sampai -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Noise Reduction | `strength` (light/medium/strong) |
| `merge-audio` | Merge Audio | `format` (mp3/wav/flac/m4a) - multi-file |
| `split-audio` | Split Audio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Ringtone Maker | `startS`, `durationS` (1-30) |
| `waveform-image` | Waveform Image | `width`, `height`, `color` (hex) |
| `audio-metadata` | Audio Metadata | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transcribe Audio (AI) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Tool Dokumen {#document-tools}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `merge-pdf` | Merge PDFs | - (multi-file, hingga 20 PDF) |
| `split-pdf` | Split PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Compress PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Rotate PDF | `angle` (90/180/270), `range` (rentang halaman) |
| `extract-pages` | Extract Pages | `range` (sintaks qpdf, mis. "1-5,8,10-z") |
| `remove-pages` | Remove Pages | `pages` (rentang qpdf untuk dihapus) |
| `organize-pdf` | Organize PDF | `order` (urutan halaman qpdf, mis. "3,1,2,5-z") |
| `protect-pdf` | Protect PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Unlock PDF | `password` |
| `repair-pdf` | Repair PDF | - |
| `linearize-pdf` | Web-Optimize PDF | - (linearisasi untuk tampilan web cepat) |
| `grayscale-pdf` | Grayscale PDF | - |
| `pdfa-convert` | PDF/A Convert | - (PDF/A-2 arsip) |
| `crop-pdf` | Crop PDF | `margin` (0-2000 poin) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Booklet PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Watermark PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF Page Numbers | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Flatten PDF | - (memanggang formulir dan anotasi) |
| `redact-pdf` | Redact PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Sign PDF | Route multipart kustom dengan PDF `file`, file tanda tangan `sig0`, `sig1`, dan array JSON `placements` |
| `pdf-to-text` | PDF to Text | - |
| `pdf-to-word` | PDF to Word | - |
| `pdf-metadata` | PDF Metadata | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Convert Document | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Convert Presentation | `format` (pptx/odp) |
| `convert-spreadsheet` | Convert Spreadsheet | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel to PDF | - |
| `word-to-pdf` | Word to PDF | - |
| `powerpoint-to-pdf` | PowerPoint to PDF | - |
| `html-to-pdf` | HTML to PDF | - (sumber daya jarak jauh dinonaktifkan) |
| `markdown-to-docx` | Markdown to Word | - |
| `markdown-to-html` | Markdown to HTML | - |
| `markdown-to-pdf` | Markdown to PDF | - (sumber daya jarak jauh dinonaktifkan) |
| `epub-convert` | Convert EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Convert to EPUB | - (menerima .docx, .md, .html, .txt) |
| `ocr-pdf` | PDF OCR (AI) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF to Image | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF to JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF to PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF to TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Tool File {#file-tools}

| ID Tool | Nama | Pengaturan utama |
|---------|------|-------------|
| `chart-maker` | Chart Maker | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV to Excel | `sheet` (nomor worksheet untuk input XLSX) - dua arah |
| `csv-json` | CSV to JSON | `pretty` (bool) - dua arah |
| `json-xml` | JSON to XML | `pretty` (bool) - dua arah |
| `split-csv` | Split CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Merge CSVs | - (multi-file, kolom yang cocok) |
| `yaml-json` | YAML / JSON | - (dua arah) |
| `xml-to-csv` | XML to CSV | - (mencari otomatis elemen berulang) |
| `excel-to-csv` | Excel to CSV | preset konversi khusus yang didukung oleh `convert-spreadsheet` |
| `create-zip` | Create ZIP | - (multi-file, 2-50 file) |
| `extract-zip` | Extract ZIP | - (terlindung dari bomb) |

### HTML to Image {#html-to-image}

Tangkap halaman web sebagai gambar. Berbeda dari tool lain, endpoint ini menerima `application/json` alih-alih data form multipart (tidak perlu unggahan file).

**Endpoint:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parameter | Tipe | Default | Deskripsi |
|-----------|------|---------|-------------|
| `url` | string | (wajib) | URL untuk ditangkap (hanya http/https) |
| `format` | string | `"png"` | Format output: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Kualitas 1-100 (hanya JPG/WebP) |
| `fullPage` | boolean | `false` | Tangkap seluruh halaman yang dapat digulir |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Lebar viewport kustom 320-3840 |
| `viewportHeight` | number | `720` | Tinggi viewport kustom 320-2160 |

**Contoh:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Response:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Sub-Route Tool {#tool-sub-routes}

Beberapa tool memaparkan endpoint tambahan di luar `POST /api/v1/tools/<section>/<toolId>` standar:

| Method | Path | Deskripsi |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Mengembalikan ID tool populer, kembali ke daftar default yang dikurasi saat data penggunaan sedikit |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Terapkan efek latar (color/gradient/blur/shadow) tanpa menjalankan ulang AI. Menggunakan mask cache dari penghapusan awal. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Baca metadata EXIF/IPTC/XMP yang ada dari sebuah gambar |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspeksi field metadata sebelum penghapusan |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Fase 1: Deteksi wajah AI + penghapusan latar. Mengembalikan landmark wajah dan data cache. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Fase 2: Crop, resize, dan tile menggunakan analisis cache. Tanpa menjalankan ulang AI. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Dapatkan metadata GIF (jumlah frame, dimensi, durasi) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Dapatkan metadata PDF (jumlah halaman, dimensi) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Hasilkan pratinjau halaman PDF tertentu |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Dapatkan metadata PDF untuk preset JPG khusus |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Hasilkan pratinjau halaman PDF preset JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Dapatkan metadata PDF untuk preset PNG khusus |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Hasilkan pratinjau halaman PDF preset PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Dapatkan metadata PDF untuk preset TIFF khusus |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Hasilkan pratinjau halaman PDF preset TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Konversi batch beberapa SVG ke raster |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analisis kualitas gambar dan kembalikan rekomendasi peningkatan |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Pratinjau ringan untuk penyetelan parameter langsung. Mengembalikan gambar yang dioptimalkan dengan header ukuran. |

## Pemrosesan Batch {#batch-processing}

Terapkan tool berkemampuan batch generik ke beberapa file sekaligus. Mengembalikan arsip ZIP. Route multi-file atau multi-langkah kustom, seperti penandatanganan PDF, OCR PDF, dan route preset PDF-to-image, menggunakan kontrak endpoint tersendiri alih-alih route `/batch` generik.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Konkurensi dikontrol oleh `CONCURRENT_JOBS` (default: dideteksi otomatis dari core CPU). `MAX_BATCH_SIZE` membatasi jumlah file per batch (default: 100; setel 0 untuk tak terbatas).

## Pipeline {#pipelines}

### Menjalankan pipeline {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

Output setiap langkah menjadi input langkah berikutnya. Pipeline mengizinkan 20 langkah secara default, dapat dikonfigurasi melalui `MAX_PIPELINE_STEPS`. Setel `MAX_PIPELINE_STEPS=0` untuk menghapus batas.

### Menyimpan dan mengelola pipeline {#save-and-manage-pipelines}

| Method | Path | Deskripsi |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Simpan pipeline bernama (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Daftar pipeline tersimpan (admin lihat semua; pengguna lihat miliknya) |
| `DELETE` | `/api/v1/pipeline/:id` | Hapus (pemilik atau admin) |
| `GET` | `/api/v1/pipeline/tools` | Daftar ID tool yang valid untuk langkah pipeline |

## Pelacakan Progres {#progress-tracking}

Job yang berjalan lama, tool yang diantrekan, job batch, dan pipeline memancarkan progres real-time melalui Server-Sent Events. Aliran progres bersifat publik dan diberi kunci berdasarkan job ID, jadi klien tidak perlu mengirim header Authorization untuk membacanya.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Format event:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Anda dapat meminta pembatalan untuk job yang diantrekan atau sedang berjalan dengan `POST /api/v1/jobs/:jobId/cancel`. Response-nya adalah `{"canceled":true|false}`.

## Pustaka File {#file-library}

Penyimpanan file persisten dengan riwayat versi.

| Method | Path | Deskripsi |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Unggah file ke workspace (pemrosesan sementara) |
| `POST` | `/api/v1/files/upload` | Unggah file ke pustaka file persisten |
| `POST` | `/api/v1/files/save-result` | Simpan hasil pemrosesan tool sebagai versi file baru |
| `GET` | `/api/v1/files` | Daftar file tersimpan (berpaginasi, dengan pencarian) |
| `GET` | `/api/v1/files/:id` | Dapatkan metadata file + rantai versi |
| `GET` | `/api/v1/files/:id/download` | Unduh file |
| `GET` | `/api/v1/files/:id/thumbnail` | Dapatkan thumbnail JPEG 300px |
| `DELETE` | `/api/v1/files` | Hapus massal file dan rantai versinya (body: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Ambil URL jarak jauh ke workspace untuk impor berbasis URL |
| `POST` | `/api/v1/preview` | Hasilkan pratinjau WebP yang kompatibel dengan browser (untuk format HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Stream pratinjau kompatibel browser yang di-cache atau dihasilkan untuk file PDF, dokumen office, video, atau audio tersimpan |
| `POST` | `/api/v1/preview/generate` | Hasilkan pratinjau MP4 atau MP3 on-demand untuk file media yang diunggah tanpa menyimpannya terlebih dahulu |
| `GET` | `/api/v1/download/:jobId/:filename` | Unduh file yang diproses dari workspace |

Untuk menyimpan otomatis hasil tool ke pustaka, sertakan `fileId` sebagai field form multipart yang merujuk file pustaka yang sudah ada. Hasil yang diproses akan disimpan sebagai versi baru.

## Manajemen API Key {#api-key-management}

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Auth | Hasilkan key baru - ditampilkan sekali |
| `GET` | `/api/v1/api-keys` | Auth | Daftar key (name, id, lastUsedAt - bukan key mentah) |
| `DELETE` | `/api/v1/api-keys/:id` | Auth | Hapus key |

## Tim {#teams}

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Daftar tim |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Buat tim |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Ubah nama tim |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Hapus tim (tidak dapat menghapus tim default atau tim yang memiliki anggota) |

## Pengaturan {#settings}

Konfigurasi key-value runtime (dibaca oleh pengguna terautentikasi mana pun, ditulis hanya oleh admin).

| Method | Path | Deskripsi |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Dapatkan semua pengaturan |
| `PUT` | `/api/v1/settings` | Perbarui pengaturan secara massal (body JSON dengan pasangan key-value) |
| `GET` | `/api/v1/settings/:key` | Dapatkan pengaturan tertentu berdasarkan key |

Key yang diketahui: `disabledTools` (array JSON dari ID tool), `enableExperimentalTools` (string bool), `loginAttemptLimit` (number).

## Preferensi {#preferences}

Preferensi per-pengguna terpisah dari pengaturan instansi. Setiap pengguna terautentikasi dapat membaca dan memperbarui peta preferensinya sendiri.

| Method | Path | Deskripsi |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Dapatkan preferensi pengguna saat ini sebagai `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Upsert satu atau lebih key preferensi untuk pengguna saat ini |

## Peran {#roles}

Manajemen peran kustom dengan izin granular.

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Daftar semua peran dengan jumlah pengguna |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Buat peran kustom (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Perbarui peran kustom (tidak dapat memodifikasi peran bawaan) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Hapus peran kustom (tidak dapat menghapus peran bawaan; pengguna terdampak kembali ke peran `user`) |

Izin yang tersedia (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Log Audit {#audit-log}

Endpoint khusus admin untuk meninjau tindakan yang relevan dengan keamanan.

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Log audit berpaginasi dengan filter opsional |

Parameter kueri:

| Parameter | Deskripsi |
|-----------|-------------|
| `page` | Nomor halaman (default: 1) |
| `limit` | Entri per halaman (default: 50, maks: 100) |
| `action` | Filter berdasarkan jenis aksi (mis. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filter berdasarkan alamat IP sumber |
| `from` | Filter entri setelah tanggal ISO 8601 ini |
| `to` | Filter entri sebelum tanggal ISO 8601 ini |

## Analytics {#analytics}

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Publik | Dapatkan konfigurasi analytics yang berlaku (key PostHog, DSN Sentry, sample rate). Key, DSN, dan ID instansi kosong saat analytics nonaktif, baik dari bake waktu kompilasi maupun pengaturan instansi `analyticsEnabled`. |
| `POST` | `/api/v1/feedback` | Auth | Kirim umpan balik pengguna eksplisit ke proyek PostHog yang dikonfigurasi sebagai `feedback_submitted`. Route ini menghormati gate analytics, membatasi laju pengiriman, menghapus field kontak kecuali `contactOk` bernilai true, dan tidak pernah menerima konten file, nama file, jalur unggahan, atau teks error privat mentah. Saat analytics dinonaktifkan, ia mengembalikan `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Setel opt-out seluruh instansi. Kirim body JSON `{ "analyticsEnabled": "false" }` untuk menonaktifkan analytics bagi semua orang, atau `"true"` untuk mengaktifkannya kembali. |

## Fitur / Bundle AI {#features-ai-bundles}

Kelola bundle fitur AI (instal/hapus paket model AI di lingkungan Docker).

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Auth | Daftar semua bundle fitur dan status instalasinya |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Instal bundle fitur (async, mengembalikan `jobId` untuk pelacakan progres) |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Hapus bundle fitur dan bersihkan file model |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Dapatkan total penggunaan disk model AI |
| `POST` | `/api/v1/admin/features/import` | Admin (`features:manage`) | Impor arsip bundle AI offline |

## Operasi Admin {#admin-operations}

Endpoint operasional untuk observabilitas, dukungan, pelaporan penggunaan, dan status backup.

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Baca level log runtime saat ini |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Ubah level log runtime (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, atau `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Metrik Prometheus dalam format teks |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Unduh ZIP bundle dukungan diagnostik yang telah diredaksi |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Data dasbor penggunaan, dengan parameter kueri `days` opsional |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Baca metadata backup terakhir dan status kesegaran |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Catat backup yang selesai (`type`, `sizeBytes` opsional, `notes` opsional) |

## API Enterprise {#enterprise-apis}

Route ini dibatasi lisensi oleh fitur enterprise terkaitnya. Mereka tetap memerlukan izin SnapOtter yang tercantum.

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Ekspor entri audit sebagai JSON atau CSV dengan filter |
| `GET` | `/api/v1/enterprise/config/export` | Admin (`system:health`) | Ekspor konfigurasi instansi yang diredaksi, peran kustom, dan tim |
| `POST` | `/api/v1/enterprise/config/import` | Admin (`system:health`) | Impor konfigurasi, dengan dry run opsional |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Baca allowlist CIDR yang dikonfigurasi |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Perbarui allowlist CIDR dengan pencegahan self-lockout |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Daftar legal hold pengguna dan tim |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Terapkan atau lepas legal hold pada pengguna atau tim |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Hasilkan token bearer SCIM, dikembalikan sekali |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Cabut token bearer SCIM saat ini |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Baca konfigurasi penerusan SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Perbarui konfigurasi penerusan SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Daftar tujuan webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Buat tujuan webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Perbarui tujuan webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Hapus tujuan webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Kirim payload webhook uji |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Mulai job ekspor pengguna GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Baca status ekspor GDPR dan URL unduhan |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Hapus permanen data pengguna setelah konfirmasi |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Hapus permanen data tim setelah konfirmasi |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Baca metadata versi aplikasi, build, Node, dan skema |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Bandingkan migrasi yang dipaket dengan migrasi yang diterapkan |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Jalankan pemeriksaan kesiapan upgrade |

### SCIM 2.0 {#scim-2-0}

Endpoint discovery SCIM bersifat publik. Endpoint pengguna dan grup memerlukan token bearer SCIM yang dihasilkan di atas.

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Publik | Kapabilitas server SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Publik | Discovery skema SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Publik | Discovery jenis resource SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Daftar pengguna, dengan filter SCIM opsional |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Buat pengguna |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Dapatkan pengguna |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Ganti pengguna |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Nonaktifkan lunak seorang pengguna |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Daftar tim sebagai grup SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Buat tim |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Dapatkan tim |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Ganti tim dan keanggotaan grup |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Hapus tim |

## Template Meme {#meme-templates}

API pendukung untuk tool generator meme.

| Method | Path | Akses | Deskripsi |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Auth | Daftar semua template meme yang tersedia dengan posisi kotak teks |
| `GET` | `/api/v1/meme-templates/full/:filename` | Auth | Sajikan gambar template ukuran penuh |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Auth | Sajikan thumbnail template |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Auth | Sajikan file font yang digunakan untuk render teks meme |

## Response Error {#error-responses}

Semua error mengembalikan JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Arti |
|--------|---------|
| 400 | Request tidak valid / validasi gagal |
| 401 | Tidak terautentikasi |
| 403 | Izin tidak mencukupi |
| 404 | Resource tidak ditemukan |
| 413 | File terlalu besar (lihat `MAX_UPLOAD_SIZE_MB`) |
| 422 | Pemrosesan gagal setelah validasi |
| 429 | Dibatasi laju (lihat `RATE_LIMIT_PER_MIN`) |
| 501 | Bundle fitur AI yang diperlukan tidak terinstal (`FEATURE_NOT_INSTALLED`) |
| 500 | Kesalahan server internal |
