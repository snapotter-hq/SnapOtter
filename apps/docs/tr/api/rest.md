---
description: "Eksiksiz REST API başvurusu. Araç uç noktaları, toplu işleme, işlem hatları, dosya kitaplığı, kimlik doğrulama, ekipler ve yönetici işlemleri."
i18n_source_hash: 8646977f7cc9
i18n_provenance: machine
i18n_output_hash: 4ae115bf377e
---

# REST API Başvurusu {#rest-api-reference}

İstek/yanıt örnekleriyle etkileşimli API belgeleri [http://localhost:1349/api/docs](http://localhost:1349/api/docs) adresinde mevcuttur.

Makine tarafından okunabilir belirtimler:
- `/api/v1/openapi.yaml` - OpenAPI 3.1 belirtimi
- `/llms.txt` - LLM dostu özet
- `/llms-full.txt` - Eksiksiz LLM dostu belgeler

## Kimlik Doğrulama {#authentication}

`AUTH_ENABLED=false` olmadıkça tüm uç noktalar kimlik doğrulaması gerektirir.

### Oturum Belirteci {#session-token}

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

Oturumların süresi 7 gün sonra dolar (`SESSION_DURATION_HOURS` ile yapılandırılabilir).

### API Anahtarları {#api-keys}

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

Anahtarlar `si_` ön ekiyle işaretlenir ve scrypt karma değerleri olarak saklanır; ham anahtar bir kez gösterilir ve bir daha asla alınamaz.

### Kimlik Doğrulama Uç Noktaları {#auth-endpoints}

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Herkese açık | Oturum aç, oturum belirteci al |
| `POST` | `/api/auth/logout` | Kimlik doğrulamalı | Geçerli oturumu sonlandır |
| `GET` | `/api/auth/session` | Kimlik doğrulamalı | Geçerli oturumu doğrula |
| `POST` | `/api/auth/change-password` | Kimlik doğrulamalı | Kendi parolanı değiştir (diğer tüm oturumları + API anahtarlarını geçersiz kılar) |
| `GET` | `/api/auth/users` | Yönetici | Tüm kullanıcıları listele |
| `POST` | `/api/auth/register` | Yönetici | Yeni bir kullanıcı oluştur |
| `PUT` | `/api/auth/users/:id` | Yönetici | Kullanıcı rolünü veya ekibini güncelle |
| `POST` | `/api/auth/users/:id/reset-password` | Yönetici | Kullanıcının parolasını sıfırla |
| `DELETE` | `/api/auth/users/:id` | Yönetici | Bir kullanıcıyı sil |
| `GET` | `/api/v1/config/auth` | Herkese açık | Kimlik doğrulamanın etkin olup olmadığını kontrol et (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Kimlik doğrulamalı | TOTP MFA kaydını başlat. Kurumsal `mfa` özelliğini gerektirir |
| `POST` | `/api/auth/mfa/verify` | Kimlik doğrulamalı | MFA kaydını bir TOTP koduyla onayla |
| `POST` | `/api/auth/mfa/complete` | Herkese açık | Bekleyen bir MFA oturum açma doğrulamasını tamamla |
| `POST` | `/api/auth/mfa/disable` | Kimlik doğrulamalı | Geçerli kullanıcı için MFA'yı devre dışı bırak |
| `POST` | `/api/auth/users/:id/mfa/reset` | Yönetici (`users:manage`) | Bir kullanıcı için MFA'yı sıfırla |
| `GET` | `/api/auth/oidc/login` | Herkese açık | OIDC etkinleştirildiğinde OIDC oturum açmayı başlat |
| `GET` | `/api/auth/oidc/callback` | Herkese açık | OIDC yetkilendirme geri çağırması |
| `GET` | `/api/auth/saml/metadata` | Herkese açık | SAML etkinleştirildiğinde SAML SP meta veri XML'i |
| `GET` | `/api/auth/saml/login` | Herkese açık | SAML oturum açmayı başlat |
| `POST` | `/api/auth/saml/callback` | Herkese açık | SAML doğrulama tüketici hizmeti |

Bir kullanıcı için MFA etkinleştirildiğinde, `POST /api/auth/login` bir oturum belirteci yerine `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` döndürür. Bu `mfaToken` değerini bir TOTP veya kurtarma kodu ile birlikte `/api/auth/mfa/complete` adresine gönderin.

### İzinler {#permissions}

| İzin | Yönetici | Kullanıcı |
|-----------|:-----:|:----:|
| Araçları kullan | ✓ | ✓ |
| Kendi dosyaları/işlem hatları/API anahtarları | ✓ | ✓ |
| Tüm kullanıcıların dosyalarını/işlem hatlarını/anahtarlarını gör | ✓ | - |
| Ayarları yaz | ✓ | - |
| Kullanıcıları ve ekipleri yönet | ✓ | - |
| Markalamayı yönet | ✓ | - |

## Sağlık Kontrolü {#health-check}

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Herkese açık | Temel sağlık kontrolü. 200 ile `{"status":"healthy","version":"..."}` döndürür veya veritabanına erişilemiyorsa 503 ile `{"status":"unhealthy"}` döndürür. |
| `GET` | `/api/v1/readyz` | Herkese açık | Hazır olma yoklaması. Yapılandırıldığında PostgreSQL, Redis, disk alanı ve S3'ü kontrol eder. Örnek trafik almaması gerektiğinde 503 döndürür. |
| `GET` | `/api/v1/admin/health` | Yönetici (`system:health`) | Çalışma süresi, depolama modu, veritabanı durumu, kuyruk durumu ve GPU kullanılabilirliği dahil ayrıntılı tanılama. |

## Araçları Kullanma {#using-tools}

Her araç aynı deseni izler:

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

`<section>` şunlardan biridir: `image`, `video`, `audio`, `pdf` veya `files`.

- Yükleme `multipart/form-data` şeklindedir.
- `settings`, araca özgü seçeneklere sahip bir JSON dizesidir.
- `clientJobId`, çağırana özgü ilerleme ilişkilendirmesi için isteğe bağlı bir form alanıdır.
- `fileId`, mevcut bir dosya kitaplığı öğesine başvuran isteğe bağlı bir form alanıdır. Bulunduğunda, işlenen çıktı yeni bir sürüm olarak kaydedilir ve yanıt `savedFileId` içerir.
- **Hızlı araçlar** genellikle 200 JSON döndürür: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. İşlenen dosyayı `downloadUrl` adresinden alın.
- **Kuyruğa alınan herhangi bir araç**, uzun süre çalışıyorsa veya eşzamanlı bekleme penceresini aşarsa 202 JSON döndürebilir: `{"jobId":"...","async":true}`. İlerleme için SSE'ye bağlanın, ardından tamamlandığında indirin ([İlerleme İzleme](#progress-tracking) bölümüne bakın).
- **Toplu** yollar, genel toplu kayıt defterinde kayıtlı araçlar için doğrudan akışa alınan (`X-Job-Id` başlığıyla) bir ZIP arşivi döndürür.

## Araçlar Başvurusu {#tools-reference}

### Dönüştürme Ön Ayarları {#conversion-presets}

Paylaşılan katalog, `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` ve `excel-to-csv` gibi 83 özel dönüştürme ön ayarı uç noktası içerir. Ön ayarlar birinci sınıf araç yollarıdır:

`POST /api/v1/tools/<section>/<presetId>`

Her ön ayar çıktı biçimini kilitler ve `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` veya `convert-spreadsheet` gibi bir temel araca yetki devreder. Eksiksiz yol tablosu ve isteğe bağlı ayarlar için [Dönüştürme Ön Ayarları](/tr/tools/conversion-presets) bölümüne bakın.

### Temel Öğeler {#essentials}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `resize` | Yeniden Boyutlandır | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement` ve 23 sosyal medya ön ayarı |
| `crop` | Kırp | `left`, `top`, `width`, `height`, `unit` (px/yüzde) |
| `rotate` | Döndür ve Çevir | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Dönüştür | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Sıkıştır | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### İyileştirme {#optimization}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `optimize-for-web` | Web İçin İyileştir | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Meta Verileri Kaldır | - |
| `edit-metadata` | Meta Verileri Düzenle | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (enlem/boylam), `dateTime` |
| `bulk-rename` | Toplu Yeniden Adlandır | `pattern` (`{n}`, `{date}`, `{original}` destekler), `startIndex`, `padding` |
| `image-to-pdf` | Görüntüden PDF'ye | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Favicon Oluşturucu | `padding`, `backgroundColor`, `borderRadius` - tüm standart boyutları oluşturur |

### Ayarlamalar {#adjustments}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `adjust-colors` | Renkleri Ayarla | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Keskinleştirme | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Rengi Değiştir | `sourceColor`, `targetColor` (değiştirme), `makeTransparent`, `tolerance` |
| `color-blindness` | Renk Körlüğü Simülasyonu | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, varsayılan "deuteranomaly") |
| `duotone` | İkili Ton | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pikselleştir | `blockSize` (2-128), `region` (kısmi pikselleştirme için {left, top, width, height}) |
| `vignette` | Vinyet | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Yapay Zeka Araçları {#ai-tools}

Tüm yapay zeka araçları kendi donanımınızda çalışır: varsayılan olarak CPU'da veya desteklenen bir NVIDIA GPU mevcut olduğunda NVIDIA CUDA'da. VA-API, Quick Sync veya OpenCL aracılığıyla Intel/AMD iGPU hızlandırması yapay zeka çıkarımı için bugün desteklenmemektedir. İnternet gerekmez.

| Araç Kimliği | Ad | Yapay Zeka Modeli | Anahtar ayarlar |
|---------|------|---------|-------------|
| `remove-background` | Arka Planı Kaldır | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Görüntü Ölçek Büyütme | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Nesne Silici | LaMa (ONNX) | Maske ikinci dosya parçası olarak gönderilir (alan adı `mask`), `format`, `quality` |
| `ocr` | OCR / Metin Çıkarma | PaddleOCR / Tesseract | `quality` (fast/balanced/best), `language`, `enhance` |
| `blur-faces` | Yüz / PII Bulanıklaştırma | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Akıllı Kırpma | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Görüntü İyileştirme | Analiz tabanlı | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Yüz İyileştirme | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Yapay Zeka Renklendirme | DDColor | `intensity`, `model` |
| `noise-removal` | Gürültü Kaldırma | Kademeli gürültü giderme | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Kırmızı Göz Giderme | Yüz işaret noktası + renk analizi | `sensitivity`, `strength` |
| `restore-photo` | Fotoğraf Onarımı | Çok adımlı işlem hattı | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Vesikalık Fotoğraf | MediaPipe işaret noktaları | İki aşamalı akış. Çözümleme, multipart `file` kullanır; oluşturma, `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), işaret noktaları, görüntü boyutları içeren JSON kullanır |
| `content-aware-resize` | İçerik Duyarlı Yeniden Boyutlandırma | Dikiş oyma (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | PNG Saydamlık Düzeltici | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Arka Plan Değiştir | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Arka Planı Bulanıklaştır | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Yapay Zeka Tuval Genişletme | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Filigran ve Yer Paylaşımı {#watermark-overlay}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `watermark-text` | Metin Filigranı | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Görüntü Filigranı | `opacity`, `position`, `scale` - ikinci dosya filigrandır |
| `text-overlay` | Metin Yer Paylaşımı | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Görüntü Kompozisyonu | `x`, `y`, `opacity`, `blend` - ikinci dosya üstte katmanlanır |
| `meme-generator` | Meme Oluşturucu | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Şablon modunu (`templateId` içeren JSON gövdesi) veya özel görüntü modunu (dosya içeren multipart) destekler. |

### Yardımcı Programlar {#utilities}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `info` | Görüntü Bilgisi | - (genişlik, yükseklik, biçim, boyut, kanallar, hasAlpha, DPI, EXIF döndürür) |
| `compare` | Görüntü Karşılaştırma | `mode` (side-by-side/overlay/diff), `diffThreshold` - ikinci dosya karşılaştırma hedefidir |
| `find-duplicates` | Yinelenenleri Bul | `threshold` (algısal karma mesafesi, varsayılan 8) - çok dosyalı |
| `color-palette` | Renk Paleti | `count` (baskın renk sayısı), `format` (hex/rgb) |
| `qr-generate` | QR Kod Oluşturucu | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (isteğe bağlı dosya) |
| `barcode-read` | Barkod Okuyucu | - (QR, EAN, Code128, DataMatrix vb. otomatik algılar) |
| `image-to-base64` | Görüntüden Base64'e | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML'den Görüntüye | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histogram | `scale` (linear/log) - RGB histogram grafiği + kanal başına istatistikler döndürür |
| `lqip-placeholder` | LQIP Yer Tutucu | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Barkod Oluşturucu | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). JSON gövdesi, dosya yükleme yok. |

### Düzen ve Kompozisyon {#layout-composition}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `collage` | Kolaj / Izgara | `template` (25+ düzen), `gap`, `backgroundColor`, `borderRadius` - çok dosyalı |
| `stitch` | Birleştir / Bir Araya Getir | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - çok dosyalı |
| `split` | Görüntü Bölme | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Kenarlık ve Çerçeve | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Ekran Görüntüsünü Güzelleştir | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Dairesel Kırpma | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Görüntü Dolgusu | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sayfası | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - çok dosyalı (2-64 görüntü) |

### Biçim ve Dönüştürme {#format-conversion}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `svg-to-raster` | SVG'den Rastere | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Görüntüden SVG'ye | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | GIF Araçları | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), eyleme özgü parametreler |
| `gif-webp` | GIF/WebP Dönüştürücü | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Video Araçları {#video-tools}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `convert-video` | Video Dönüştür | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Video Sıkıştır | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Video Kırp | `startS`, `endS`, `precise` (bool, kare tam kesim) |
| `mute-video` | Videoyu Sustur | - |
| `video-to-gif` | Videodan GIF'e | `fps` (1-30), `width`, `startS`, `durationS` (maks. 60sn) |
| `resize-video` | Videoyu Yeniden Boyutlandır | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Video Kırpma | `width`, `height`, `x`, `y` |
| `rotate-video` | Videoyu Döndür | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | FPS'yi Değiştir | `fps` (1-120) |
| `video-color` | Video Rengi | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Video Hızı | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Videoyu Ters Çevir | - (maks. 5 dakika) |
| `video-loudnorm` | Sesi Normalleştir | - (EBU R128) |
| `aspect-pad` | En Boy Dolgusu | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Bulanık Dolgu | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Videoya Filigran Ekle | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Videoyu Sabitle | `smoothing` (5-60, kare cinsinden) |
| `gif-to-video` | GIF'den Videoya | `format` (mp4/webm/mov) |
| `video-to-webp` | Videodan WebP'ye | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Videodan Karelere | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Videoları Birleştir | - (çok dosyalı, ilk videonun çözünürlüğüne normalleştirilir) |
| `replace-audio` | Sesi Değiştir | - (video + ses dosyası, iki dosya) |
| `burn-subtitles` | Altyazıları Göm | `fontSize` (8-72) - video + altyazı dosyası |
| `embed-subtitles` | Altyazıları Yerleştir | `language` (ISO 639-2/B kodu) - video + altyazı dosyası |
| `extract-subtitles` | Altyazıları Çıkar | - (SRT çıktısı verir) |
| `images-to-video` | Görüntülerden Videoya | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/kare), `fps` - çok dosyalı |
| `video-metadata` | Video Meta Verilerini Temizle | - |
| `auto-subtitles` | Otomatik Altyazılar (Yapay Zeka) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Sesi Çıkar | `format` (mp3/wav/m4a/ogg) |

### Ses Araçları {#audio-tools}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `convert-audio` | Ses Dönüştür | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Sesi Kırp | `startS`, `endS` |
| `volume-adjust` | Ses Düzeyini Ayarla | `gainDb` (-30 ile 30 arası) |
| `normalize-audio` | Sesi Normalleştir | - (EBU R128, -16 LUFS) |
| `fade-audio` | Sesi Soldur | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Sesi Ters Çevir | - |
| `audio-speed` | Ses Hızı | `factor` (0.25-4) |
| `pitch-shift` | Perde Kaydırma | `semitones` (-12 ile 12 arası) |
| `audio-channels` | Ses Kanalları | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Sessizlik Kaldırma | `thresholdDb` (-80 ile -20 arası), `minSilenceS` (0.1-5) |
| `noise-reduction` | Gürültü Azaltma | `strength` (light/medium/strong) |
| `merge-audio` | Sesi Birleştir | `format` (mp3/wav/flac/m4a) - çok dosyalı |
| `split-audio` | Sesi Böl | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Zil Sesi Oluşturucu | `startS`, `durationS` (1-30) |
| `waveform-image` | Dalga Formu Görüntüsü | `width`, `height`, `color` (hex) |
| `audio-metadata` | Ses Meta Verileri | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Sesi Metne Dök (Yapay Zeka) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Belge Araçları {#document-tools}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `merge-pdf` | PDF'leri Birleştir | - (çok dosyalı, en fazla 20 PDF) |
| `split-pdf` | PDF'yi Böl | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | PDF'yi Sıkıştır | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | PDF'yi Döndür | `angle` (90/180/270), `range` (sayfa aralığı) |
| `extract-pages` | Sayfaları Çıkar | `range` (qpdf söz dizimi, örn. "1-5,8,10-z") |
| `remove-pages` | Sayfaları Kaldır | `pages` (kaldırılacak qpdf aralığı) |
| `organize-pdf` | PDF'yi Düzenle | `order` (qpdf sayfa sırası, örn. "3,1,2,5-z") |
| `protect-pdf` | PDF'yi Koru | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | PDF Kilidini Aç | `password` |
| `repair-pdf` | PDF'yi Onar | - |
| `linearize-pdf` | PDF'yi Web İçin İyileştir | - (hızlı web görüntüleme için doğrusallaştırır) |
| `grayscale-pdf` | PDF'yi Gri Tonlamaya Çevir | - |
| `pdfa-convert` | PDF/A Dönüştür | - (arşiv PDF/A-2) |
| `crop-pdf` | PDF'yi Kırp | `margin` (0-2000 punto) |
| `nup-pdf` | N-up PDF | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | Kitapçık PDF | `perSheet` (2/4/6/8) |
| `watermark-pdf` | PDF'ye Filigran Ekle | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | PDF Sayfa Numaraları | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | PDF'yi Düzleştir | - (formları ve ek açıklamaları sabitler) |
| `redact-pdf` | PDF'yi Redakte Et | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | PDF İmzala | PDF `file`, imza dosyaları `sig0`, `sig1` ve `placements` JSON dizisi içeren özel multipart yol |
| `pdf-to-text` | PDF'den Metne | - |
| `pdf-to-word` | PDF'den Word'e | - |
| `pdf-metadata` | PDF Meta Verileri | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Belge Dönüştür | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Sunum Dönüştür | `format` (pptx/odp) |
| `convert-spreadsheet` | Elektronik Tablo Dönüştür | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel'den PDF'ye | - |
| `word-to-pdf` | Word'den PDF'ye | - |
| `powerpoint-to-pdf` | PowerPoint'ten PDF'ye | - |
| `html-to-pdf` | HTML'den PDF'ye | - (uzak kaynaklar devre dışı) |
| `markdown-to-docx` | Markdown'dan Word'e | - |
| `markdown-to-html` | Markdown'dan HTML'ye | - |
| `markdown-to-pdf` | Markdown'dan PDF'ye | - (uzak kaynaklar devre dışı) |
| `epub-convert` | EPUB Dönüştür | `format` (pdf/docx/html/md) |
| `to-epub` | EPUB'a Dönüştür | - (.docx, .md, .html, .txt kabul eder) |
| `ocr-pdf` | PDF OCR (Yapay Zeka) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF'den Görüntüye | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF'den JPG'ye | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF'den PNG'ye | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF'den TIFF'e | `pages`, `dpi`, `quality`, `colorMode` |

### Dosya Araçları {#file-tools}

| Araç Kimliği | Ad | Anahtar ayarlar |
|---------|------|-------------|
| `chart-maker` | Grafik Oluşturucu | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV'den Excel'e | `sheet` (XLSX girişi için çalışma sayfası numarası) - çift yönlü |
| `csv-json` | CSV'den JSON'a | `pretty` (bool) - çift yönlü |
| `json-xml` | JSON'dan XML'e | `pretty` (bool) - çift yönlü |
| `split-csv` | CSV'yi Böl | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | CSV'leri Birleştir | - (çok dosyalı, eşleşen sütunlar) |
| `yaml-json` | YAML / JSON | - (çift yönlü) |
| `xml-to-csv` | XML'den CSV'ye | - (yinelenen öğeleri otomatik bulur) |
| `excel-to-csv` | Excel'den CSV'ye | `convert-spreadsheet` tarafından desteklenen özel dönüştürme ön ayarı |
| `create-zip` | ZIP Oluştur | - (çok dosyalı, 2-50 dosya) |
| `extract-zip` | ZIP Ayıkla | - (bomba korumalı) |

### HTML'den Görüntüye {#html-to-image}

Bir web sayfasını görüntü olarak yakalayın. Diğer araçların aksine bu uç nokta, multipart form verisi yerine `application/json` kabul eder (dosya yükleme gerekmez).

**Uç nokta:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `url` | string | (zorunlu) | Yakalanacak URL (yalnızca http/https) |
| `format` | string | `"png"` | Çıktı biçimi: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Kalite 1-100 (yalnızca JPG/WebP) |
| `fullPage` | boolean | `false` | Kaydırılabilir tüm sayfayı yakala |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Özel görüntü alanı genişliği 320-3840 |
| `viewportHeight` | number | `720` | Özel görüntü alanı yüksekliği 320-2160 |

**Örnek:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Yanıt:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Araç Alt Yolları {#tool-sub-routes}

Bazı araçlar standart `POST /api/v1/tools/<section>/<toolId>` dışında ek uç noktalar sunar:

| Yöntem | Yol | Açıklama |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Popüler araç kimliklerini döndürür, kullanım verileri az olduğunda özenle seçilmiş bir varsayılan listeye geri döner |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Yapay zekayı yeniden çalıştırmadan arka plan efektleri (renk/gradyan/bulanıklaştırma/gölge) uygula. İlk kaldırmadan önbelleğe alınan maskeyi kullanır. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Bir görüntüden mevcut EXIF/IPTC/XMP meta verilerini oku |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Kaldırmadan önce meta veri alanlarını incele |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | 1. Aşama: Yapay zeka yüz algılama + arka plan kaldırma. Yüz işaret noktalarını ve önbelleğe alınan verileri döndürür. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | 2. Aşama: Önbelleğe alınan analizi kullanarak kırp, yeniden boyutlandır ve döşe. Yapay zeka yeniden çalıştırılmaz. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | GIF meta verilerini al (kare sayısı, boyutlar, süre) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | PDF meta verilerini al (sayfa sayısı, boyutlar) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Belirli bir PDF sayfasının önizlemesini oluştur |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Özel JPG ön ayarı için PDF meta verilerini al |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | JPG ön ayarı PDF sayfa önizlemesi oluştur |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Özel PNG ön ayarı için PDF meta verilerini al |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | PNG ön ayarı PDF sayfa önizlemesi oluştur |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Özel TIFF ön ayarı için PDF meta verilerini al |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | TIFF ön ayarı PDF sayfa önizlemesi oluştur |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Birden çok SVG'yi toplu olarak rastere dönüştür |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Görüntü kalitesini analiz et ve iyileştirme önerileri döndür |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Canlı parametre ayarı için hafif önizleme. Boyut başlıklarıyla iyileştirilmiş görüntü döndürür. |

## Toplu İşleme {#batch-processing}

Toplu işlem etkin genel bir aracı bir kerede birden çok dosyaya uygulayın. Bir ZIP arşivi döndürür. PDF imzalama, PDF OCR ve PDF'den görüntüye ön ayar yolları gibi özel çok dosyalı veya çok adımlı yollar, genel `/batch` yolu yerine kendi uç nokta sözleşmelerini kullanır.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

Eşzamanlılık `CONCURRENT_JOBS` tarafından kontrol edilir (varsayılan: CPU çekirdeklerinden otomatik algılanır). `MAX_BATCH_SIZE`, toplu işlem başına dosya sayısını sınırlar (varsayılan: 100; sınırsız için 0 ayarlayın).

## İşlem Hatları {#pipelines}

### Bir işlem hattı çalıştır {#execute-a-pipeline}

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

Her adımın çıktısı bir sonraki adımın girdisidir. İşlem hatları varsayılan olarak 20 adıma izin verir; `MAX_PIPELINE_STEPS` ile yapılandırılabilir. Sınırı kaldırmak için `MAX_PIPELINE_STEPS=0` ayarlayın.

### İşlem hatlarını kaydet ve yönet {#save-and-manage-pipelines}

| Yöntem | Yol | Açıklama |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Adlandırılmış bir işlem hattı kaydet (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Kayıtlı işlem hatlarını listele (yöneticiler tümünü görür; kullanıcılar kendilerininkini görür) |
| `DELETE` | `/api/v1/pipeline/:id` | Sil (sahibi veya yöneticisi) |
| `GET` | `/api/v1/pipeline/tools` | İşlem hattı adımları için geçerli araç kimliklerini listele |

## İlerleme İzleme {#progress-tracking}

Uzun süre çalışan işler, kuyruğa alınan araçlar, toplu işler ve işlem hatları, Server-Sent Events aracılığıyla gerçek zamanlı ilerleme yayar. İlerleme akışı herkese açıktır ve iş kimliğiyle anahtarlanır, bu nedenle istemcilerin okumak için bir Authorization başlığı göndermesi gerekmez.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Olay biçimi:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Kuyruğa alınan veya çalışan bir iş için `POST /api/v1/jobs/:jobId/cancel` ile iptal talep edebilirsiniz. Yanıt `{"canceled":true|false}` şeklindedir.

## Dosya Kitaplığı {#file-library}

Sürüm geçmişiyle kalıcı dosya depolama.

| Yöntem | Yol | Açıklama |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Dosyaları çalışma alanına yükle (geçici işleme) |
| `POST` | `/api/v1/files/upload` | Dosyaları kalıcı dosya kitaplığına yükle |
| `POST` | `/api/v1/files/save-result` | Bir araç işleme sonucunu yeni bir dosya sürümü olarak kaydet |
| `GET` | `/api/v1/files` | Kayıtlı dosyaları listele (sayfalanmış, aramalı) |
| `GET` | `/api/v1/files/:id` | Dosya meta verilerini + sürüm zincirini al |
| `GET` | `/api/v1/files/:id/download` | Dosyayı indir |
| `GET` | `/api/v1/files/:id/thumbnail` | 300px JPEG küçük resmini al |
| `DELETE` | `/api/v1/files` | Dosyaları ve sürüm zincirlerini toplu olarak sil (gövde: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | URL tabanlı içe aktarmalar için uzak URL'leri çalışma alanına getir |
| `POST` | `/api/v1/preview` | Tarayıcı uyumlu bir WebP önizlemesi oluştur (HEIC/HEIF/RAW biçimleri için) |
| `GET` | `/api/v1/files/:id/preview` | Kayıtlı bir PDF, office belgesi, video veya ses dosyası için önbelleğe alınmış ya da oluşturulmuş tarayıcı uyumlu önizlemeyi akışa al |
| `POST` | `/api/v1/preview/generate` | Yüklenen bir medya dosyası için önce kaydetmeden isteğe bağlı bir MP4 veya MP3 önizlemesi oluştur |
| `GET` | `/api/v1/download/:jobId/:filename` | Bir çalışma alanından işlenmiş bir dosya indir |

Bir araç sonucunu kitaplığa otomatik kaydetmek için, mevcut bir kitaplık dosyasına başvuran bir multipart form alanı olarak `fileId` ekleyin. İşlenen sonuç yeni bir sürüm olarak kaydedilir.

## API Anahtarı Yönetimi {#api-key-management}

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Kimlik doğrulamalı | Yeni anahtar oluştur - bir kez gösterilir |
| `GET` | `/api/v1/api-keys` | Kimlik doğrulamalı | Anahtarları listele (ad, kimlik, lastUsedAt - ham anahtar değil) |
| `DELETE` | `/api/v1/api-keys/:id` | Kimlik doğrulamalı | Anahtarı sil |

## Ekipler {#teams}

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Yönetici (`teams:manage`) | Ekipleri listele |
| `POST` | `/api/v1/teams` | Yönetici (`teams:manage`) | Ekip oluştur |
| `PUT` | `/api/v1/teams/:id` | Yönetici (`teams:manage`) | Ekibi yeniden adlandır |
| `DELETE` | `/api/v1/teams/:id` | Yönetici (`teams:manage`) | Ekibi sil (varsayılan ekip veya üyeleri olan ekipler silinemez) |

## Ayarlar {#settings}

Çalışma zamanı anahtar-değer yapılandırması (kimliği doğrulanmış herhangi bir kullanıcı okur, yalnızca yönetici yazar).

| Yöntem | Yol | Açıklama |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Tüm ayarları al |
| `PUT` | `/api/v1/settings` | Ayarları toplu güncelle (anahtar-değer çiftleriyle JSON gövdesi) |
| `GET` | `/api/v1/settings/:key` | Anahtara göre belirli bir ayarı al |

Bilinen anahtarlar: `disabledTools` (araç kimliklerinin JSON dizisi), `enableExperimentalTools` (bool dizesi), `loginAttemptLimit` (sayı).

## Tercihler {#preferences}

Kullanıcı başına tercihler, örnek ayarlarından ayrıdır. Kimliği doğrulanmış herhangi bir kullanıcı kendi tercih haritasını okuyabilir ve güncelleyebilir.

| Yöntem | Yol | Açıklama |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Geçerli kullanıcının tercihlerini `{ "preferences": { ... } }` olarak al |
| `PUT` | `/api/v1/preferences` | Geçerli kullanıcı için bir veya daha fazla tercih anahtarını ekle/güncelle |

## Roller {#roles}

Ayrıntılı izinlerle özel rol yönetimi.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Yönetici (`audit:read`) | Kullanıcı sayılarıyla birlikte tüm rolleri listele |
| `POST` | `/api/v1/roles` | Yönetici (`security:manage`) | Özel bir rol oluştur (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Yönetici (`security:manage`) | Özel bir rolü güncelle (yerleşik roller değiştirilemez) |
| `DELETE` | `/api/v1/roles/:id` | Yönetici (`security:manage`) | Özel bir rolü sil (yerleşik roller silinemez; etkilenen kullanıcılar `user` rolüne geri döner) |

Kullanılabilir izinler (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Denetim Günlüğü {#audit-log}

Güvenlikle ilgili eylemleri incelemek için yalnızca yöneticiye özel uç nokta.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Yönetici (`audit:read`) | İsteğe bağlı filtrelerle sayfalanmış denetim günlüğü |

Sorgu parametreleri:

| Parametre | Açıklama |
|-----------|-------------|
| `page` | Sayfa numarası (varsayılan: 1) |
| `limit` | Sayfa başına girdi (varsayılan: 50, maks.: 100) |
| `action` | Eylem türüne göre filtrele (örn. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Kaynak IP adresine göre filtrele |
| `from` | Bu ISO 8601 tarihinden sonraki girdileri filtrele |
| `to` | Bu ISO 8601 tarihinden önceki girdileri filtrele |

## Analitik {#analytics}

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Herkese açık | Etkin analitik yapılandırmasını al (PostHog anahtarı, Sentry DSN, örnekleme oranı). Analitik kapalı olduğunda, ister derleme zamanı bakisinden ister örnek `analyticsEnabled` ayarından, anahtarlar, DSN ve örnek kimliği boş olur. |
| `POST` | `/api/v1/feedback` | Kimlik doğrulamalı | Yapılandırılmış PostHog projesine `feedback_submitted` olarak açık kullanıcı geri bildirimi gönder. Yol, analitik kapısına uyar, gönderimleri hız sınırlar, `contactOk` doğru olmadıkça iletişim alanlarını çıkarır ve dosya içeriklerini, dosya adlarını, yükleme yollarını veya ham özel hata metnini asla kabul etmez. Analitik devre dışıyken `{ "ok": true, "accepted": false }` döndürür. |
| `PUT` | `/api/v1/settings` | Yönetici (`settings:write`) | Örnek genelinde devre dışı bırakmayı ayarla. Analitiği herkes için kapatmak üzere `{ "analyticsEnabled": "false" }`, tekrar açmak üzere `"true"` JSON gövdesi gönderin. |

## Özellikler / Yapay Zeka Paketleri {#features-ai-bundles}

Yapay zeka özellik paketlerini yönetin (Docker ortamında yapay zeka modeli paketlerini kurun/kaldırın). Özel otomasyondan bir aracı etkinleştirirken araç düzeyindeki kurulum uç noktasını tercih edin: bazı yapay zeka araçları birden fazla paylaşılan pakete ihtiyaç duyar ve bu uç nokta zaten kurulu paketleri atlarken yalnızca eksik olanları kuyruğa alır.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Kimlik doğrulamalı | Tüm özellik paketlerini ve kurulum durumlarını listele |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Yönetici (`features:manage`) | Bir özellik paketi kur (eşzamansız, ilerleme izleme için `jobId` döndürür) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Yönetici (`features:manage`) | Bir aracın gerektirdiği her paketi kur; paket başına kuyruğa alınan/atlanan durumu döndürür |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Yönetici (`features:manage`) | Bir özellik paketini kaldır ve model dosyalarını temizle |
| `GET` | `/api/v1/admin/features/disk-usage` | Yönetici (`features:manage`) | Yapay zeka modellerinin toplam disk kullanımını al |
| `POST` | `/api/v1/admin/features/import` | Yönetici (`features:manage`) | Çevrimdışı bir yapay zeka paket arşivini içe aktar |

## Yönetici İşlemleri {#admin-operations}

Gözlemlenebilirlik, destek, kullanım raporlama ve yedekleme durumu için operasyonel uç noktalar.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Yönetici (`settings:write`) | Geçerli çalışma zamanı günlük düzeyini oku |
| `POST` | `/api/v1/admin/log-level` | Yönetici (`settings:write`) | Çalışma zamanı günlük düzeyini değiştir (`fatal`, `error`, `warn`, `info`, `debug`, `trace` veya `silent`) |
| `GET` | `/api/v1/metrics` | Yönetici (`system:health`) | Metin biçiminde Prometheus metrikleri |
| `GET` | `/api/v1/admin/support-bundle` | Yönetici (`system:health`) | Redakte edilmiş bir tanılama destek paketi ZIP'i indir |
| `GET` | `/api/v1/admin/usage` | Yönetici (`audit:read`) | İsteğe bağlı `days` sorgu parametresiyle kullanım panosu verisi |
| `GET` | `/api/v1/admin/backup-status` | Yönetici (`system:health`) | Son yedekleme meta verilerini ve tazelik durumunu oku |
| `POST` | `/api/v1/admin/backup-status` | Yönetici (`system:health`) | Tamamlanmış bir yedeklemeyi kaydet (`type`, isteğe bağlı `sizeBytes`, isteğe bağlı `notes`) |

## Kurumsal API'ler {#enterprise-apis}

Bu yollar, ilgili kurumsal özellikleri tarafından lisans kapılıdır. Yine de listelenen SnapOtter iznini gerektirirler.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Yönetici (`audit:read`) | Denetim girdilerini filtrelerle JSON veya CSV olarak dışa aktar |
| `GET` | `/api/v1/enterprise/config/export` | Yönetici (`system:health`) | Redakte edilmiş örnek yapılandırmasını, özel rolleri ve ekipleri dışa aktar |
| `POST` | `/api/v1/enterprise/config/import` | Yönetici (`system:health`) | Yapılandırmayı içe aktar, isteğe bağlı deneme çalışmasıyla |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Yönetici (`security:manage`) | Yapılandırılmış CIDR izin listesini oku |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Yönetici (`security:manage`) | CIDR izin listesini kendini kilitleme önlemesiyle güncelle |
| `GET` | `/api/v1/enterprise/legal-hold` | Yönetici (`compliance:manage`) | Kullanıcı ve ekip yasal saklamalarını listele |
| `PUT` | `/api/v1/enterprise/legal-hold` | Yönetici (`compliance:manage`) | Bir kullanıcıya veya ekibe yasal saklama uygula veya kaldır |
| `POST` | `/api/v1/enterprise/scim/token` | Yönetici (`users:manage`) | Bir SCIM taşıyıcı belirteci oluştur, bir kez döndürülür |
| `DELETE` | `/api/v1/enterprise/scim/token` | Yönetici (`users:manage`) | Geçerli SCIM taşıyıcı belirtecini iptal et |
| `GET` | `/api/v1/enterprise/siem/config` | Yönetici (`webhooks:manage`) | SIEM iletme yapılandırmasını oku |
| `PUT` | `/api/v1/enterprise/siem/config` | Yönetici (`webhooks:manage`) | SIEM iletme yapılandırmasını güncelle |
| `GET` | `/api/v1/enterprise/webhooks` | Yönetici (`webhooks:manage`) | Webhook hedeflerini listele |
| `POST` | `/api/v1/enterprise/webhooks` | Yönetici (`webhooks:manage`) | Bir webhook hedefi oluştur |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Yönetici (`webhooks:manage`) | Bir webhook hedefini güncelle |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Yönetici (`webhooks:manage`) | Bir webhook hedefini sil |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Yönetici (`webhooks:manage`) | Bir test webhook yükü gönder |
| `POST` | `/api/v1/enterprise/users/:id/export` | Yönetici (`compliance:manage`) | Bir GDPR kullanıcı dışa aktarma işi başlat |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Yönetici (`compliance:manage`) | GDPR dışa aktarma durumunu ve indirme URL'sini oku |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Yönetici (`compliance:manage`) | Onaydan sonra bir kullanıcının verisini kalıcı olarak temizle |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Yönetici (`compliance:manage`) | Onaydan sonra bir ekibin verisini kalıcı olarak temizle |
| `GET` | `/api/v1/admin/version` | Yönetici (`system:health`) | Uygulama, derleme, Node ve şema sürüm meta verilerini oku |
| `GET` | `/api/v1/admin/migrations/pending` | Yönetici (`system:health`) | Paketlenmiş geçişleri uygulanan geçişlerle karşılaştır |
| `GET` | `/api/v1/admin/upgrade-check` | Yönetici (`system:health`) | Yükseltme hazırlık kontrollerini çalıştır |

### SCIM 2.0 {#scim-2-0}

SCIM keşif uç noktaları herkese açıktır. Kullanıcı ve grup uç noktaları, yukarıda oluşturulan SCIM taşıyıcı belirtecini gerektirir.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Herkese açık | SCIM sunucu yetenekleri |
| `GET` | `/api/v1/scim/v2/Schemas` | Herkese açık | SCIM şema keşfi |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Herkese açık | SCIM kaynak türü keşfi |
| `GET` | `/api/v1/scim/v2/Users` | SCIM belirteci | Kullanıcıları listele, isteğe bağlı SCIM filtresiyle |
| `POST` | `/api/v1/scim/v2/Users` | SCIM belirteci | Bir kullanıcı oluştur |
| `GET` | `/api/v1/scim/v2/Users/:id` | SCIM belirteci | Bir kullanıcı al |
| `PUT` | `/api/v1/scim/v2/Users/:id` | SCIM belirteci | Bir kullanıcıyı değiştir |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | SCIM belirteci | Bir kullanıcıyı geçici olarak devre dışı bırak |
| `GET` | `/api/v1/scim/v2/Groups` | SCIM belirteci | Ekipleri SCIM grupları olarak listele |
| `POST` | `/api/v1/scim/v2/Groups` | SCIM belirteci | Bir ekip oluştur |
| `GET` | `/api/v1/scim/v2/Groups/:id` | SCIM belirteci | Bir ekip al |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | SCIM belirteci | Bir ekibi ve grup üyeliğini değiştir |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | SCIM belirteci | Bir ekibi sil |

## Meme Şablonları {#meme-templates}

Meme oluşturucu aracı için destekleyici API.

| Yöntem | Yol | Erişim | Açıklama |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Kimlik doğrulamalı | Metin kutusu konumlarıyla birlikte tüm kullanılabilir meme şablonlarını listele |
| `GET` | `/api/v1/meme-templates/full/:filename` | Kimlik doğrulamalı | Tam boyutlu şablon görüntüsünü sun |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Kimlik doğrulamalı | Şablon küçük resmini sun |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Kimlik doğrulamalı | Meme metni oluşturmak için kullanılan yazı tipi dosyasını sun |

## Hata Yanıtları {#error-responses}

Tüm hatalar JSON döndürür:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Durum | Anlamı |
|--------|---------|
| 400 | Geçersiz istek / doğrulama başarısız |
| 401 | Kimlik doğrulaması yapılmadı |
| 403 | Yetersiz izinler |
| 404 | Kaynak bulunamadı |
| 413 | Dosya çok büyük (`MAX_UPLOAD_SIZE_MB` bölümüne bakın) |
| 422 | Doğrulamadan sonra işleme başarısız oldu |
| 429 | Hız sınırlaması (`RATE_LIMIT_PER_MIN` bölümüne bakın) |
| 501 | Gerekli yapay zeka özellik paketi kurulu değil (`FEATURE_NOT_INSTALLED`) |
| 500 | Dahili sunucu hatası |
