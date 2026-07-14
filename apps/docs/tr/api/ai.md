---
description: "Tüm yerel ML araçlarını içeren AI motoru referansı. Arka plan kaldırma, büyütme, OCR, yüz algılama, fotoğraf onarımı ve daha fazlası."
i18n_output_hash: 96b67b8bbec2
i18n_source_hash: aa9a56cdddc7
i18n_provenance: human
---

# AI Motoru Referansı {#ai-engine-reference}

`@snapotter/ai` paketi, yerel ML işlemleri için yerel araçları ve Python çalışma zamanlarını koordine eder. Çoğu ML aleti, hızlı ısınma başlatmaları için kalıcı bir Python sidecar kullanır. OCR kasıtlı olarak ayrıdır: `fast`, yerel Tesseract ikili dosyasını çağırırken, `balanced` ve `best`, `/data/ai/v3` altında aktif değişmez RapidOCR nesline sabitlenmiş özel bir kalıcı JSONL dispatcher kullanır. Her istek bir generation lease içerir. Yükseltme sırasında SnapOtter, etkinleştirmeden önce aday üzerinde bir smoke test çalıştırır, atomik olarak yeni dispatcher'ye geçer ve ardından garbage collection'den önce eski nesli boşaltır.

NVIDIA CUDA, onu destekleyen çalışma zamanları tarafından otomatik olarak algılanır ve kullanılır. OCR, her ana bilgisayarda CPU'yi kullanır, NVIDIA GPU'lu sistemler dahil, bu alet için CUDA ve sürücü bağlantısından kaçınılması.

VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırma bugün AI çıkarımı için desteklenmiyor. `/dev/dri` öğesini bir konteynere eşlemek, CUDA yeteneğine sahip bir NVIDIA GPU mevcut olmadıkça bu Python sidecar araçlarını hızlandırmaz.

Dört modalite (image, audio, video, document) genelinde 19 Python sidecar AI aracı, artı isteğe bağlı AI yetenekleri olan 2 araç. Tüm modeller yerel olarak çalışır; ilk model indirmesinden sonra internet gerekmez.


<!-- korean-ocr-contract:start -->
::: info Korece OCR uyumluluğu
Hızlı OCR `auto`, `en`, `de`, `es`, `fr`, `zh` ve `ja` dillerini destekler, ancak Koreceyi (`ko`) desteklemez. Korece için doğru OCR paketi ve `balanced` ya da `best` gerekir. Paket resmi Linux amd64 ve arm64 kapsayıcılarında, OCR’nin CPU’da kaldığı NVIDIA ana bilgisayarları dahil çalışır. Desteklenmeyen sistemler açık bir uyumluluk hatası alır ve sessizce `fast` seçeneğine dönülmez. Korece ile `fast` veya eski `tesseract` diğer adı kuyruk öncesinde `FEATURE_INCOMPATIBLE` ve `fast-korean-unsupported` ile reddedilir.
:::
<!-- korean-ocr-contract:end -->
## Mimari {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 +-- Native Tesseract + Ghostscript (fast image/PDF OCR)
 |
 +-- Isolated OCR runtime (persistent JSONL dispatcher)
 |     `-- RapidOCR + ONNX Runtime CPU + pinned PP-OCR models
 |
 `-- Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Ayrı bir "docs" dispatcher profili, AI izin listesini belge işleme betikleriyle (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) değiştirir ve ağır ML içe aktarmalarını atlar.

**Zaman aşımları:** varsayılan 300 s; OCR ve BiRefNet arka plan kaldırma 600 s alır.

## Özellik Paketleri {#feature-bundles}

AI modelleri, araç başına bir arşiv olarak değil, paylaşılan bağımlılık yığınına göre paketlenir. Bir özellik paketi, araçlar aynı model ailesini, Python wheel'lerini veya yerel kütüphaneleri kullandığında birden fazla aracı etkinleştirebilir. Bu, yayın Docker imgesini daha küçük tutar ve aynı arka plan matlama, yüz algılama, OCR, onarım ve konuşma modellerinin yinelenen kopyalarının saklanmasını önler.

Docker imgesi, uygulamayı artı ortak çalışma zamanını içerir. Büyük model arşivleri, talep üzerine kalıcı `/data/ai` birimine indirilir, ardından ihtiyaç duyan her araç tarafından yeniden kullanılır. Bir paket, başka bir araç ihtiyaç duyduğu için zaten yüklüyse, ona bağımlı yeni bir aracı etkinleştirmek o paketi tekrar indirmez.

Çoğu AI aracının çalıştırılmadan önce bir veya daha fazla özellik paketine ihtiyacı vardır. Yönetici kullanıcı arayüzü bunları `POST /api/v1/admin/tools/:toolId/features/install` aracılığıyla araçla yükler; bu, tam paket listesini çözer, önceden yüklenmiş olan paketleri atlar ve yalnızca eksik indirmeleri sıraya koyar. Örneğin, yeni bir örnekte Pasaport Fotoğrafını etkinleştirmek `background-removal` ve `face-detection` sıralarını oluşturur; Arka Plan Kaldırma zaten yüklendikten sonra etkinleştirildiğinde yalnızca `face-detection` sıraya alınır. OCR bir istisnadır çünkü `fast`'nin pakete ihtiyacı yoktur; isteğe bağlı doğru çalışma süresini kullanıcı arayüzü veya `POST /api/v1/admin/features/ocr/install` aracılığıyla yükleyin.

| Paket | Boyut | Paylaşılan bağımlılık grubu | Onu kullanan araçlar |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | rembg / BiRefNet arka plan matlama | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | MediaPipe yüz algılama ve işaret noktaları | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | LaMa inpainting/outpainting ve DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, gürültü giderme | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | çizik onarımı ve restorasyon hattı | restore-photo |
| `ocr` | ~208-234 MiB indir / ~409-488 MiB kuruldu | İsteğe bağlı RapidOCR 3.9.1, ONNX Runtime 1.20.1 ve sabitlenmiş PP-OCR modelleri | ocr, ocr-pdf (yalnızca `balanced` ve `best`) |
| `transcription` | ~600 MB | faster-whisper konuşmadan metne modelleri | transcribe-audio, auto-subtitles |

Çapraz paket bağımlılıkları olan araçlar:

| Araç | Gerekli paketler | Neden |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Arka planı kaldırır, ardından kırpmayı pasaport ve kimlik fotoğrafı kurallarına göre çerçevelemek için yüz işaret noktalarını kullanır. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Seçilen yüz bölgelerinde GFPGAN veya CodeFormer iyileştirmesini çalıştırmadan önce yüzleri algılar. |

Bir araç yalnızca OCR hariç gerekli tüm paketler yüklendiğinde kullanılabilir: yerleşik `fast` katmanı, isteğe bağlı OCR paketi olmadan kullanılabilir durumda kalır. Kısmi kurulumlar geçerlidir ve artımlı olarak işlenir: kurulu paketler yeniden kullanılır, eksik paketler indirmeler olarak gösterilir ve sıraya alınmış kurulumlar birer birer çalıştırılır, böylece paylaşılan Python ortamı aynı anda değiştirilmez.

### Doğru OCR çalışma zamanı kurulumu {#accurate-ocr-runtime-installation}

Doğru OCR paketi, resmi Linux amd64 veya Linux arm64 konteyneri için platforma özel bir çalışma zamanıdır. amd64 yapısı Python 3.12'yi kullanır; arm64 yapısı Python 3.11'i kullanır. Her iki yapı da ONNX Runtime'nin `CPUExecutionProvider`'si aracılığıyla RapidOCR'yi çalıştırır, dolayısıyla aynı paket yalnızca CPU ve NVIDIA Docker ana bilgisayarlarında çalışır. Doğru çalışma zamanı en az 4 GiB etkili bellek gerektirir: yapılandırılmış kapsayıcı cgroup sınırı, aksi takdirde ana bilgisayar belleği. İmzalı uyumluluk minimumunun altındaki bir sistem indirmeden önce reddedilir. Bu gereksinim yerleşik Fast OCR için geçerli değildir. Bare-metal yapıları, libc ve Python ABI güvenli bir şekilde çıkarılamadığından reddedilir; Ana bilgisayar Tesseract ve Ghostscript sağladığında hızlı OCR kullanılabilir durumda kalır.

İsteğe bağlı yapı, mimariye bağlı olarak yaklaşık 208-234 MiB sıkıştırılmış ve 409-488 MiB çıkartılmıştır. İmzalı dizin, yükleyici tarafından zorunlu kılınan sıkıştırılmış ve çıkartılmış bayt sayımlarını tam olarak bağlar. Yerleşik Tesseract, resmi görüntüye yaklaşık 25 MiB ekler ve `/data/ai`'de hiçbir dosyaya ihtiyaç duymaz.

Çevrimiçi kurulum, imzalı bir sürüm dizinini ve geçerli platform için tam içerik adresli yapıyı getirir. SnapOtter, yeni nesli atomik olarak etkinleştirmeden önce Ed25519 dizin imzasını, yapı boyutunu, SHA-256 özetini, model özetlerini, yolları, dosya modlarını ve aşamalı smoke test'yi doğrular. Başarısız bir yükleme önceki sağlıklı nesli etkin bırakır.

Hava boşluklu kurulum için, `index` ve `archive` adlı çok parçalı alanları kullanarak hem sürümün `ocr-runtime-index.json`'sini hem de eşleşen OCR çalışma zamanı arşivini `POST /api/v1/admin/features/import`'ye yükleyin. Çevrimdışı içe aktarma, çevrimiçi kurulumla aynı imza, karma, çıkarma, uyumluluk ve duman testi kontrollerini uygular; güvenilir imzalı dizini olmayan bir arşiv reddedilir.

---

## Arka Plan Kaldırma {#background-removal}

**Araç rotası:** `remove-background`  
**Model:** BiRefNet (varsayılan) veya U2-Net varyantları ile rembg

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `model` | string | - | Model varyantı (isteğe bağlı geçersiz kılma) |
| `backgroundType` | string | `"transparent"` | Şunlardan biri: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Düz arka plan için hex renk |
| `gradientColor1` | string | - | Birinci gradyan rengi |
| `gradientColor2` | string | - | İkinci gradyan rengi |
| `gradientAngle` | number | - | Derece cinsinden gradyan açısı |
| `blurEnabled` | boolean | - | Arka plan bulanıklaştırma efektini etkinleştir |
| `blurIntensity` | number (0-100) | - | Bulanıklaştırma yoğunluğu |
| `shadowEnabled` | boolean | - | Özne üzerinde gölge düşürmeyi etkinleştir |
| `shadowOpacity` | number (0-100) | - | Gölge opaklığı |
| `outputFormat` | string | - | Çıktı biçimi: `png`, `webp` veya `avif` |
| `edgeRefine` | integer (0-3) | - | Kenar iyileştirme düzeyi |
| `decontaminate` | boolean | - | Kenarlardan renk taşmasını kaldır |

## Arka Plan Değiştirme {#background-replace}

**Araç rotası:** `background-replace`  
**Model:** rembg / BiRefNet (remove-background ile paylaşılır)

Arka planı kaldırır ve düz bir renk veya gradyanla değiştirir.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Arka plan modu |
| `color` | string | `"#ffffff"` | Arka plan hex rengi (`backgroundType` değeri `color` olduğunda) |
| `gradientColor1` | string | - | Birinci gradyan hex rengi |
| `gradientColor2` | string | - | İkinci gradyan hex rengi |
| `gradientAngle` | integer (0-360) | `180` | Derece cinsinden gradyan açısı |
| `feather` | integer (0-20) | `0` | Kenar yumuşatma yarıçapı |
| `format` | `"png"` \| `"webp"` | `"png"` | Çıktı biçimi |

## Arka Planı Bulanıklaştırma {#blur-background}

**Araç rotası:** `blur-background`  
**Model:** rembg / BiRefNet (remove-background ile paylaşılır)

Özneyi keskin tutarken arka planı bulanıklaştırır.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Bulanıklaştırma yoğunluğu |
| `feather` | integer (0-20) | `0` | Kenar yumuşatma yarıçapı |
| `format` | `"png"` \| `"webp"` | `"png"` | Çıktı biçimi |

## Görüntü Büyütme {#image-upscaling}

**Araç rotası:** `upscale`  
**Model:** RealESRGAN (kullanılamadığında Lanczos yedeği ile)

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Büyütme faktörü |
| `model` | string | `"auto"` | Model varyantı |
| `faceEnhance` | boolean | `false` | GFPGAN yüz iyileştirme geçişi uygula |
| `denoise` | number | `0` | Gürültü giderme gücü |
| `format` | string | `"auto"` | Çıktı biçimi geçersiz kılma |
| `quality` | number | `95` | Çıktı kalitesi (1-100) |

## OCR / Metin Çıkarma {#ocr-text-extraction}

**Araç rotası:** `ocr`  
**Modeller:** Tesseract (`fast`); PP-OCRv6 küçük modellerle (`balanced`) RapidOCR; Kalibre edilmiş varyant puanlamasına sahip PP-OCRv6 orta modeller (`best`)

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dinamik | `quality` ve `engine` belirtilmezse SnapOtter kullanılabilir en iyi katmanı şu sırayla seçer: `best`, `balanced`, `fast`. Korece için `fast` hiçbir zaman seçilmez; `best`, ardından `balanced` kullanılır veya doğru çalışma zamanının kurulum ya da uyumluluk hatası döndürülür. |
| `language` | string | `"auto"` | Dil: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | Seviyeye bağlı | Yerel kontrastı iyileştirin. Hızlı doğrudan uygular; doğru katmanlar, yalnızca kalibre edilmiş puanlama OCR'yi iyileştirdiğinde varyantı korur. En İyi için Varsayılanlar Açıktır |
| `engine` | sicim | - | Kullanımdan kaldırılan uyumluluk takma adı. `tesseract`'yi `fast`'ye ve eski `paddleocr` değerini `balanced`'ye eşler; PaddlePaddle yüklenmiyor |

Çıkarılan metni artı kaynak meta verilerini döndürür: motor, istenen ve gerçek kalite, cihaz, sağlayıcı, bozulma durumu, uyarılar ve uygun olduğunda doğru çalışma zamanı/model sürümleri. Açık kalite istekleri hiçbir zaman başka bir katmana geri dönmez. `balanced` veya `best` kullanılamıyorsa API, `fast`'yi sessizce çalıştırmak yerine `FEATURE_NOT_INSTALLED` veya `FEATURE_INCOMPATIBLE`'yi döndürür.

## PDF OCR {#pdf-ocr}

**Araç rotası:** `ocr-pdf`  
**Modeller:** Görüntü OCR ile aynı katman sistemi

Yapay zeka destekli OCR kullanarak taranmış PDF belgelerinden sayfa sayfa metin çıkarır.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | Dinamik | `quality` ve `engine` belirtilmezse SnapOtter kullanılabilir en iyi katmanı şu sırayla seçer: `best`, `balanced`, `fast`. Korece için `fast` hiçbir zaman seçilmez; `best`, ardından `balanced` kullanılır veya doğru çalışma zamanının kurulum ya da uyumluluk hatası döndürülür. |
| `language` | string | `"auto"` | Dil: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Sayfa seçimi: `"all"`, `"1-3"`, `"1,3,5"` |
| `enhance` | boolean | Seviyeye bağlı | Yerel kontrastı iyileştirin. Hızlı doğrudan uygular; doğru katmanlar, yalnızca kalibre edilmiş puanlama OCR'yi iyileştirdiğinde varyantı korur. En İyi için Varsayılanlar Açıktır |
| `engine` | sicim | - | Kullanımdan kaldırılan uyumluluk takma adı. `tesseract`'yi `fast`'ye ve eski `paddleocr` değerini `balanced`'ye eşler; PaddlePaddle yüklenmiyor |

Aynı sürüm düşürmeme kuralı PDF OCR için de geçerlidir. PDF sayfaları tanınmadan önce rasterleştirilir ve bir istek en fazla 50 sayfa seçebilir.

## Yüz / PII Bulanıklaştırma {#face-pii-blur}

**Araç rotası:** `blur-faces`  
**Model:** MediaPipe yüz algılama

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Gauss bulanıklaştırma yarıçapı |
| `sensitivity` | number (0-1) | `0.5` | Algılama güven eşiği |

## Yüz İyileştirme {#face-enhancement}

**Araç rotası:** `enhance-faces`  
**Modeller:** GFPGAN, CodeFormer

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | İyileştirme modeli |
| `strength` | number (0-1) | `0.8` | İyileştirme gücü |
| `sensitivity` | number (0-1) | `0.5` | Yüz algılama eşiği |
| `onlyCenterFace` | boolean | `false` | Yalnızca en merkezi yüzü iyileştir |

## AI Renklendirme {#ai-colorization}

**Araç rotası:** `colorize`  
**Model:** DDColor (OpenCV DNN yedeği ile)

Siyah-beyaz veya gri tonlamalı fotoğrafları tam renge dönüştürür.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Renk doygunluğu gücü |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Model varyantı |

## Gürültü Giderme {#noise-removal}

**Araç rotası:** `noise-removal`  
**Model:** SCUNet (katmanlı gürültü giderme hattı)

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | İşleme katmanı |
| `strength` | number (0-100) | `50` | Gürültü giderme gücü |
| `detailPreservation` | number (0-100) | `50` | Ne kadar ayrıntı korunacağı; daha yüksek değer daha fazla doku tutar |
| `colorNoise` | number (0-100) | `30` | Renk gürültüsü azaltma gücü |
| `format` | string | `"original"` | Çıktı biçimi: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Çıktı kodlama kalitesi |

## Kırmızı Göz Giderme {#red-eye-removal}

**Araç rotası:** `red-eye-removal`

Yüz işaret noktalarını algılar, göz bölgelerini bulur ve kırmızı kanal aşırı doygunluğunu düzeltir.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Kırmızı piksel algılama eşiği |
| `strength` | number (0-100) | `70` | Düzeltme gücü |
| `format` | string | - | Çıktı biçimi geçersiz kılma (isteğe bağlı) |
| `quality` | number (1-100) | `90` | Çıktı kalitesi |

## Fotoğraf Onarımı {#photo-restoration}

**Araç rotası:** `restore-photo`

Eski veya hasarlı fotoğraflar için çok adımlı hat: çizik/yırtık algılama ve onarım, yüz iyileştirme, gürültü giderme ve isteğe bağlı renklendirme.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Çizikleri, yırtıkları algıla ve onar |
| `faceEnhancement` | boolean | `true` | Yüz iyileştirme geçişi uygula |
| `fidelity` | number (0-1) | `0.7` | Yüz iyileştirme gücü (yüksek = daha temkinli) |
| `denoise` | boolean | `true` | Gürültü giderme geçişi uygula |
| `denoiseStrength` | number (0-100) | `25` | Gürültü giderme gücü |
| `colorize` | boolean | `false` | Onarımdan sonra renklendir |
| `colorizeStrength` | number (0-100) | `85` | Renklendirme yoğunluğu |

## Pasaport Fotoğrafı {#passport-photo}

**Araç rotası:** `passport-photo`  
**Modeller:** MediaPipe yüz işaret noktaları + BiRefNet arka plan kaldırma

İki aşamalı iş akışı: analiz et (yüzü algıla + arka planı kaldır) ardından oluştur (kırp, yeniden boyutlandır, döşe). 6 bölgede 37+ ülkeyi destekler.

### Aşama 1: Analiz {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Bir görüntü dosyası (multipart) kabul eder. Yüz işaret noktası verisi, base64 önizleme ve görüntü boyutları döndürür.

### Aşama 2: Oluştur {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Aşama 1 sonuçlarını artı oluşturma ayarlarını içeren bir JSON gövdesi kabul eder:

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `jobId` | string | (gerekli) | Aşama 1'den iş kimliği |
| `filename` | string | (gerekli) | Aşama 1'den orijinal dosya adı |
| `countryCode` | string | (gerekli) | ISO ülke kodu (örneğin, `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Belge türü |
| `bgColor` | string | `"#FFFFFF"` | Arka plan rengi hex |
| `printLayout` | string | `"none"` | Baskı düzeni: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | KB cinsinden maks dosya boyutu (0 = sınır yok) |
| `dpi` | number (72-1200) | `300` | Çıktı DPI |
| `customWidthMm` | number | - | mm cinsinden özel genişlik (ülke özelliğini geçersiz kılar) |
| `customHeightMm` | number | - | mm cinsinden özel yükseklik (ülke özelliğini geçersiz kılar) |
| `zoom` | number (0.5-3) | `1` | Yakınlaştırma faktörü |
| `adjustX` | number | `0` | Yatay konum ayarı |
| `adjustY` | number | `0` | Dikey konum ayarı |
| `landmarks` | object | (gerekli) | Aşama 1'den işaret noktaları |
| `imageWidth` | number | (gerekli) | Aşama 1'den görüntü genişliği |
| `imageHeight` | number | (gerekli) | Aşama 1'den görüntü yüksekliği |

## Nesne Silme (Inpainting) {#object-erasing-inpainting}

**Araç rotası:** `erase-object`  
**Model:** ONNX Runtime üzerinden LaMa

Maske, base64 olarak değil, **ikinci bir dosya parçası** (alan adı `mask`) olarak gönderilir. Maskedeki beyaz pikseller silinecek alanları belirtir. `format` ve `quality` ayarları üst düzey form alanları olarak gönderilir.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `file` | file | (gerekli) | Kaynak görüntü (multipart) |
| `mask` | file | (gerekli) | Maske görüntüsü (multipart, alan adı `mask`, beyaz = sil) |
| `format` | string | `"auto"` | Çıktı biçimi: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Çıktı kalitesi |

Bir NVIDIA GPU mevcut olduğunda CUDA hızlandırmalıdır.

## AI Tuval Genişletme {#ai-canvas-expand}

**Araç rotası:** `ai-canvas-expand`  
**Model:** LaMa tabanlı outpainting

Bir görüntünün tuvalini herhangi bir yönde genişletir ve yeni alanları mevcut görüntüyle eşleşen AI tarafından üretilen içerikle doldurur.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Üstte genişletilecek piksel |
| `extendRight` | integer | `0` | Sağda genişletilecek piksel |
| `extendBottom` | integer | `0` | Altta genişletilecek piksel |
| `extendLeft` | integer | `0` | Solda genişletilecek piksel |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Kalite katmanı |
| `format` | string | `"auto"` | Çıktı biçimi: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Çıktı kalitesi |

En az bir genişletme yönü 0'dan büyük olmalıdır.

## Akıllı Kırpma {#smart-crop}

**Araç rotası:** `smart-crop`  
**Model:** MediaPipe yüz algılama (yalnızca yüz modu)

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Kırpma stratejisi: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Özne modu için strateji |
| `width` | integer | - | Çıktı genişliği |
| `height` | integer | - | Çıktı yüksekliği |
| `padding` | integer (0-50) | `0` | Özne çevresindeki dolgu yüzdesi |
| `facePreset` | string | `"head-shoulders"` | `mode=face` olduğunda ön ayarlı çerçeveleme |
| `sensitivity` | number (0-1) | `0.5` | Yüz algılama eşiği |
| `threshold` | integer (0-255) | `30` | Arka plan algılama eşiği (kırpma modu) |
| `padToSquare` | boolean | `false` | Kırpılan sonucu kareye doldur |
| `padColor` | string | `"#ffffff"` | Kare dolgusu için arka plan rengi |
| `targetSize` | integer | - | Dolgulu çıktı için hedef boyut (piksel) |
| `quality` | integer (1-100) | - | Çıktı kalitesi |

Eski `mode` değerleri `attention` ve `content` kabul edilir ve sırasıyla `subject` ve `trim` ile eşlenir.

**Yüz ön ayarları:**

| Ön ayar | En uygun kullanım |
|--------|---------|
| `closeup` | Portre çekimleri |
| `head-shoulders` | Profil fotoğrafları |
| `upper-body` | LinkedIn / resmi |
| `half-body` | Tam üst gövde |

## Sesi Yazıya Dök {#transcribe-audio}

**Araç rotası:** `transcribe-audio`  
**Model:** faster-whisper

Konuşmayı metne dönüştürür. Düz metin, SRT ve VTT çıktı biçimlerini destekler.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Dil: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Çıktı biçimi |

## Otomatik Altyazılar {#auto-subtitles}

**Araç rotası:** `auto-subtitles`  
**Model:** faster-whisper (videodan sesi çıkarır, ardından yazıya döker)

Bir videonun ses parçasından altyazı dosyaları oluşturur.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Dil: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Çıktı altyazı biçimi |

## PNG Saydamlık Düzeltici {#png-transparency-fixer}

**Araç rotası:** `transparency-fixer`  
**Model:** BiRefNet HR-matting (2048x2048 çözünürlük)

Arka planın kaldırıldığı ancak arkada saçaklanma, hale veya yarı saydam kalıntılar bırakıldığı "sahte saydam" PNG'leri düzeltir. Temiz bir alfa kanalı üretmek için BiRefNet'in yüksek çözünürlüklü matlama modelini kullanır, ardından kenarlar boyunca renk kirlenmesini kaldırmak için yapılandırılabilir saçak giderme işlemi uygular.

**OOM yedek zinciri:** BiRefNet HR-matting mevcut belleği aşarsa, araç otomatik olarak önce `birefnet-general` değerine, ardından `u2net` değerine geri döner.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Renk kirlenmesini kaldırmak için kenar saçak giderme gücü |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Çıktı görüntü biçimi |
| `removeWatermark` | boolean | `false` | Filigran kaldırma ön işlemesi uygula (medyan filtresi) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## İsteğe Bağlı AI Yetenekleri Olan Araçlar {#tools-with-optional-ai-capabilities}

Aşağıdaki araçlar Python sidecar araçları değildir ancak belirli seçenekler etkinleştirildiğinde AI özelliklerini kullanır.

### Görüntü İyileştirme {#image-enhancement}

**Araç rotası:** `image-enhancement`  
**Motor:** Analiz tabanlı (Sharp histogramı ve istatistikleri)

Görüntüyü analiz eder ve pozlama, kontrast, beyaz dengesi, doygunluk, keskinlik ve gürültü için otomatik düzeltmeler uygular. Sahneye özgü modları destekler.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Düzeltmeleri ayarlamak için sahne modu |
| `intensity` | number (0-100) | `50` | Genel düzeltme gücü |
| `corrections.exposure` | boolean | `true` | Pozlama düzeltmesi uygula |
| `corrections.contrast` | boolean | `true` | Kontrast düzeltmesi uygula |
| `corrections.whiteBalance` | boolean | `true` | Beyaz dengesi düzeltmesi uygula |
| `corrections.saturation` | boolean | `true` | Doygunluk düzeltmesi uygula |
| `corrections.sharpness` | boolean | `true` | Keskinlik düzeltmesi uygula |
| `corrections.denoise` | boolean | `true` | Gürültü giderme uygula |
| `deepEnhance` | boolean | `false` | SCUNet üzerinden AI gürültü giderme etkinleştir (`upscale-enhance` paketi gerektirir) |

`POST /api/v1/tools/image/image-enhancement/analyze` adresinde, algılanan düzeltmeleri uygulamadan döndüren ek bir analiz uç noktası mevcuttur.

### İçerik Duyarlı Yeniden Boyutlandırma (Seam Carving) {#content-aware-resize-seam-carving}

**Araç rotası:** `content-aware-resize`  
**Motor:** Go `caire` ikilisi (Python değil, GPU avantajı yok)

Düşük enerjili dikişleri kaldırarak görüntüleri akıllıca yeniden boyutlandırır, önemli içeriği korur.

| Parametre | Tür | Varsayılan | Açıklama |
|-----------|------|---------|-------------|
| `width` | number | - | Hedef genişlik |
| `height` | number | - | Hedef yükseklik |
| `protectFaces` | boolean | `false` | Algılanan yüz bölgelerini koru (`face-detection` paketi gerektirir) |
| `blurRadius` | number (0-20) | `4` | Enerji hesaplaması için ön bulanıklaştırma |
| `sobelThreshold` | number (1-20) | `2` | Kenar hassasiyeti eşiği |
| `square` | boolean | `false` | Kare çıktıyı zorla |
