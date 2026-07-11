---
description: "SnapOtter için sürüm notları ve versiyon geçmişi. Her sürümde nelerin yeni, iyileştirilmiş ve düzeltilmiş olduğunu görün."
i18n_source_hash: 9020073f127e
i18n_provenance: human
i18n_output_hash: 10afcaa945a2
---

# Değişiklik Günlüğü {#changelog}

## v2.0.0 {#v2-0-0}

SnapOtter 2.0, görüntü araç setini beş modalite (Image, Video, Audio, PDF ve Files) genelinde 200+ araçtan oluşan tam bir dosya işleme paketine dönüştürür; Postgres 17 ve Redis destekli bir iş kuyruğu üzerinde yeniden inşa edilmiştir ve tek komutlu bir `docker run` ile gelir. Bu önemli bir sürümdür; 1.x'ten yükseltmeden önce Kırılma değişikliklerini okuyun.

### Yeni özellikler {#new-features}

- **Dört yeni araç modalitesi**: Video, Audio, PDF ve Files, Image'e katılarak kataloğu 200+ araca çıkarır.
- **Kalıcı arka plan işleri**: Redis destekli bir kuyruk (BullMQ) her aracı, canlı SSE ilerlemesiyle izlenen bir iş olarak çalıştırır.
- **Hepsi-bir-arada tek konteyner modu**: Tek bir `docker run`, gömülü Postgres ve Redis ile eksiksiz bir örneği başlatır.
- **İstek üzerine AI paketleri**: Arka plan kaldırma, OCR, transkripsiyon, büyütme, yüz algılama ve iyileştirme, nesne silici, renklendirme ve fotoğraf restorasyonu arayüzden kurulur. GPU hızlandırma her çerçeve için ayrı algılanır.
- **Sign PDF**: Bir imzayı çizin, yazın veya yükleyin ve tarayıcıda bir PDF üzerine yerleştirin.
- **Automate**: Araçları zincirleyen, dokuz hazır şablonla gelen görsel bir işlem hattı oluşturucu.
- **83 tek tıkla dönüştürme ön ayarı**: Bulanık aramayla birlikte özel JPG-to-PNG, MP4-to-GIF ve benzeri dönüştürücüler.
- **Katman tabanlı görüntü düzenleyici**: `/editor` adresinde fırçalar, şekiller, ayarlamalar, filtreler ve eğrilerle donatılmış, Konva destekli bir düzenleyici.
- **Files kütüphanesi**: Herhangi bir sonucu kaydedin ve başka bir araca girdi olarak yeniden kullanın.
- Sabitlenmiş araçlar, tuval içi yakınlaştırma ve kaydırma, 21 dil ve kurumsal yetenekler (OIDC/SSO, SAML, SCIM, S3 depolama, araç başına izinler, denetim dışa aktarma, dağıtık izleme).

### İyileştirmeler {#improvements}

- Çalışan bir işlemi iptal edin. (#137)
- LibRaw aracılığıyla DNG dahil tam çözünürlüklü RAW kod çözme. (#289)
- Root olmayan ve yabancı-UID dağıtımları (TrueNAS, Unraid, OpenShift, PUID/PGID). (#230, #127)
- Doğru AI kurulum algılama ve sağlamlaştırılmış bir kurulum akışı. (#214, #352)
- Gizlilik sağlamlaştırma: otomatik üçüncü taraf dış trafik yok, artı isteğe bağlı katı-çevrimdışı modu.
- Analitik kapalıyken bile her zaman açık geri bildirim düğmesi.

### Hata düzeltmeleri {#bug-fixes}

- `RATE_LIMIT_PER_MIN=0` araç rotaları için hız sınırlamayı yeniden devre dışı bırakır. (#271)
- Docker imajı içindeki AI virtualenv yolları onarıldı. (#390)
- sharp 0.35.2+ uyumluluğu. (#362)
- Görüntü düzenleyici düzen düzeltmeleri: cetveller, doldurma davranışı, kenar çubuğu ve tuval boyutlandırma. (#258, #259)
- İtalyanca çeviri tamamlandı. (#231, #206, #425)
- Audio normalize ve loudnorm kaynak örnekleme hızını korur.
- SSRF sağlamlaştırma: sayısal IPv6 CIDR eşleştirme ve genişletilmiş bir URL ön taraması. (#287)
- Oluşturulan PDF'lere Producer olarak SnapOtter damgası eklenir.
- mediapipe, Python 3.13 ve Debian 13 üzerine kurulur.

### Kırılma değişiklikleri {#breaking-changes}

2.0, gömülü SQLite veritabanını Postgres 17 ile değiştirir ve iş kuyruğu için Redis 8 ekler. 1.x verileriniz ilk açılışta otomatik olarak taşınır, ancak konteyner yığını değiştiği için önce tüm `/data` biriminizi yedekleyin (1.x, SQLite'ı WAL modunda çalıştırır, dolayısıyla işlenmiş veriler genellikle `snapotter.db-wal` içinde bulunur). Ardından tek konteyner imajını (gömülü Postgres ve Redis, yalnızca root) veya Compose yığınını (uygulama artı Postgres 17 ve Redis 8) seçin. [taşıma kılavuzuna](https://github.com/snapotter-hq/SnapOtter/blob/main/MIGRATING.md) ve [yükseltme kılavuzuna](/tr/guide/upgrading) bakın.

### Yükseltme {#upgrade}

```bash
docker pull snapotter/snapotter:2.0.0
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'daki tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.2...v2.0.0)

---

## v1.17.2 {#v1-17-2}

Yeni HTML to Image aracı, WCAG 2.2 AA erişilebilirliği, sızma testinden gelen güvenlik sağlamlaştırması ve 5 kritik Docker düzeltmesi.

### Yeni özellikler {#new-features-1}

- **HTML to Image**: URL'lerin veya ham HTML'in ekran görüntülerini PNG/JPEG/WebP olarak yakalayın. Tam sayfa yakalamalar, özel görünüm alanları, koyu mod.
- **Docker _FILE gizli sözleşmesi**: Hassas ortam değişkenlerini düz metin yerine dosya olarak bağlayın. (#205)
- **Kurumsal lisanslama ve S3 depolama**: İsteğe bağlı ticari lisans anahtarı ve S3 uyumlu nesne depolama.
- **Şekil düzenleyici iyileştirmeleri**: Doldurma/kontur şeffaflığı, RGBA renk seçici, kesik çizgi stilleri.
- **Önceden derlenmiş sürüm arşivleri**: Docker dışı kurulumlar (Proxmox, çıplak donanım, LXC) için GitHub Releases'ten tarball indirin. (#202)

### İyileştirmeler {#improvements-1}

- **WCAG 2.2 AA erişilebilirliği**: Gezinmeyi atlama, odak yakalama, aria-live bölgeleri, azaltılmış hareket desteği, doğru kontrast oranları. (#209)
- **Mobil uyumluluk**: Duyarlı ayarlar, mobil sekme geçişinde SSE otomatik yeniden bağlanma. (#203, #204)
- **Arka plan kaldırma kalitesi**: Kenar yumuşatma, renk arındırma, çıktı formatı seçimi.
- **İtalyanca çeviri**: @albanobattistella tarafından ~145 yeni dize. (#206)
- **Araç başına API belgeleri**: Parametreler, örnekler ve yanıt formatlarıyla 53 belge sayfası.
- **AI modeli indirmeleri**: HuggingFace için üstel geri çekilmeli yeniden deneme mantığı. (#201)

### Hata düzeltmeleri {#bug-fixes-1}

- Yeni Docker konteynerleri tamamen kullanılamaz durumdaydı (hız sınırı tüm istekleri engelliyordu).
- Yüz algılama AI araçları (blur-faces, red-eye-removal, enhance-faces, passport-photo) tüm platformlarda başarısız oluyordu.
- HEIC dosyaları ARM'da bozuktu (libheif sembol uyuşmazlığı).
- Upscale ve restore-photo AI paketleri ARM'da kurulamıyordu.
- OCR, GPU konteynerlerinde yanlış CUDA sürümünü kullanıyordu.
- Onaltılık IPv4 eşlemeli IPv6 adresleri aracılığıyla SSRF koruma atlatması. (Katkı: @tonghuaroot)
- Yardımcı görüntülerle iPhone HEIC kod çözme. (#183, #199)
- 8GB GPU'larda Real-ESRGAN CUDA bellek yetersizliği. (#200)
- 6 üretim Sentry hatası ve 7 QA hatası. (#208)

### Güvenlik {#security}

- 10 sızma testi bulgusu giderildi (XFF atlatması, hatalı biçimlendirilmiş JSON çökmeleri, sınırsız işlem hatları, denetim günlüğü XSS, TRACE yöntemi ve daha fazlası). (#207)
- SSRF onaltılık IPv6 atlatması engellendi. (Katkı: @tonghuaroot)
- Dockerfile temel imajları özet ile sabitlendi.

### Yükseltme {#upgrade-1}

```bash
docker pull snapotter/snapotter:1.17.2
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'daki tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.1...v1.17.2)

---

## v1.17.1 {#v1-17-1}

Canlı demo, araç başına giriş sayfaları ve bir dizi cilalama düzeltmesi.

### Yeni özellikler {#new-features-2}

- **Canlı demo** - [demo.snapotter.com](https://demo.snapotter.com) insanların hiçbir şey kurmadan SnapOtter'ı denemesini sağlar.
- **Araçlar dizin sayfası** - Arama ve kategori filtreleriyle `/tools` adresinde 50+ aracın tümüne göz atın.
- **50+ SEO giriş sayfası** - Her aracın artık SSS'ler, kullanım senaryoları ve karşılaştırma tablolarıyla özel bir giriş sayfası var.
- **Arka plan önizlemesi** - Öncesi-sonrası kaydırıcı, şeffaf görüntülerin arkasında damalı bir arka plan gösterir.
- **Güçlü parola oluşturucu** - Üye Ekle formunda tek tıklık düğme.

### Hata düzeltmeleri {#bug-fixes-2}

- HEIC/HEIF bilgi aracı artık başarısız olmuyor (ön kod çözme eklendi).
- AI modeli paketi kurulumu daha iyi hata mesajları gösterir ve kaynak sınırlarına uyar.
- Kütüphane küçük resimleri doğru yükleniyor (kimlik doğrulama başlıkları eksikti).
- Açılır menüler People ve Teams ayarları tablolarında artık kırpılmıyor.
- Boyut karşılaştırma yüzdesi sıkıştırma dışı araçlarda gizlendi.
- Yinelenen gizlilik politikası bağlantısı kaldırıldı.
- AI özellikleri ayarları için İtalyanca çeviri eklendi.
- Yeniden adlandırılan Lucide simgeleri güncellendi (Wand2, Columns).

### Altyapı {#infrastructure}

- OpenSSF Scorecard 4.3'ten ~7.0'a sağlamlaştırıldı.
- CI testleri, küçültülmüş sabitlemelerle 4 parçaya paralelleştirildi.
- 41 bağımlılık güncellemesi.

### Yükseltme {#upgrade-2}

```bash
docker pull snapotter/snapotter:1.17.1
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'daki tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.17.0...v1.17.1)

---

## v1.17.0 {#v1-17-0}

Beş yeni araç, tam bir görüntü düzenleyici, SSO oturum açma, 20 dil. Muhtemelen üç ayrı sürüm olmalıydı, ama işte buradayız.

### Yeni özellikler {#new-features-3}

- **Görüntü düzenleyici** - Katmanlar, fırçalar, şekiller, ayarlamalar, filtreler, eğriler, klavye kısayolları. Tarayıcınızda çalışır, donanımınızda işler.
- **OIDC / SSO kimlik doğrulama** - Google, GitHub, Okta veya herhangi bir OpenID Connect sağlayıcısıyla oturum açın. Birkaç ortam değişkeni ayarlayın; ekibiniz mevcut hesaplarını kullansın.
- **Meme oluşturucu** - opentype.js aracılığıyla metin oluşturma ile 100 yerleşik şablon. Ya da kendi görüntünüzü yükleyin.
- **Beautify** - Bir ekran görüntüsü bırakın, cilalı bir görüntü alın. Cihaz çerçeveleri (macOS, Windows, tarayıcı), gölgeler, gradyanlar, sosyal medya ön ayarları.
- **Renk körlüğü simülasyonu** - Görüntülerin protanopi, döteranopi, tritanopi ve diğer renk görme eksiklikleriyle nasıl göründüğünü önizleyin.
- **PNG şeffaflık düzeltici** - Sahte şeffaf PNG'leri algılar ve BiRefNet HR-matting ile düzeltir. LaMa inpainting aracılığıyla isteğe bağlı filigran kaldırma.
- **AI tuval genişletme** - Görüntü sınırlarını AI dolgusuyla genişletin. Ne kadar GPU süresi harcamak istediğinize bağlı olarak üç kalite katmanı (hızlı, dengeli, kaliteli).
- **20 dil** - Arapça, Çince (Basitleştirilmiş/Geleneksel), Çekçe, Felemenkçe, Fransızca, Almanca, Hintçe, Endonezce, İtalyanca, Japonca, Korece, Lehçe, Portekizce, Rusça, İspanyolca, Tayca, Türkçe, Ukraynaca, Vietnamca. Arapça için RTL çalışır.
- **URL içe aktarma** - URL'leri bırakma alanına yapıştırın veya bir listeden toplu içe aktarın. SSRF korumasıyla sunucu tarafında getirme.
- **Çok dosyalı silici** - Birden fazla görüntü üzerinde silme maskeleri çizin, hepsini tek tıkla işleyin. Fırça darbeleri görüntü başına kalıcıdır.
- **İşlem hattı içe/dışa aktarma** - Araç zincirlerini JSON olarak kaydedin, başkalarıyla paylaşın.
- **17 yeni kamera RAW formatı** exiftool aracılığıyla, ayrıca QOI, JP2, EPS, DDS, CUR, DPX, FITS, PPM/PGM/PBM, SVGZ ve APNG girişi. BMP, ICO, JP2, QOI için yeni çıktı kodekleri. AVIF, TIFF, GIF, JXL ve PSD dışa aktarma, önceden kaybedilmiş bir daldan kurtarıldı.

### İyileştirmeler {#improvements-2}

- **Görüntü iyileştirme** - Eski işlem hattı CLAHE + normalise + gamma ile değiştirildi. Yeni Deep Enhance geçişi, daha agresif sonuçlar için AI modelini kullanır.
- **Fotoğraf restorasyonu** - Çizik algılama, 8 açılı Otsu filtrelemesiyle yeniden yazıldı. LaMa inpainting artık yerel çözünürlükte çalışır.
- **Her yerde egzotik formatlar** - OCR, image-to-PDF, favicon oluşturucu, kompozisyon, birleştirme ve vektörleştirmenin tümü artık HEIC, RAW, PSD kodunu çözer.
- **Compress** - Hedef boyut toleransı %5'ten %1'e sıkılaştırıldı. Hedef boyut varsayılan moddur. Adım düğmeleri ve KB/MB birim seçici eklendi.
- **Sentry temizliği** - 644 eyleme geçirilemeyen olay filtrelendi. Gerçek hatalar artık düzgün ele alınıyor.
- **GPU algılama** - CUDA'nın mevcut olduğu ancak nvidia-smi'nin olmadığı konteynerler için daha iyi tanılama.
- **Kimlik-doğrulama-devre-dışı modu** - Anonim kullanıcı, veritabanına admin rolüyle eklenir. API anahtarları, işlem hatları ve kullanıcı dosyaları artık FK kısıtlamalarında bozulmuyor.
- Birim, entegrasyon ve E2E genelinde **2.705+ yeni test**.

### Hata düzeltmeleri {#bug-fixes-3}

- CPU'da büyütme, NAS kutularında ve düşük güçlü donanımda artık zaman aşımına uğramıyor.
- QR kodu logosu artık önizlemenin kalıcı olarak kaybolmasına neden olmuyor.
- Uzun dikey görüntüler için kırpma taşması düzeltildi.
- TIFF alfa dosyaları, bozulma üretmek yerine doğru şekilde PNG çıktısını zorlar.
- HDR/EXR kod çözme, CLAHE'den önce 8 bite dönüştürerek kod çözme hatalarını düzeltir.
- Yüz işaretleri girdi arabellekleri, Python yardımcı işleminden önce PNG'ye dönüştürülerek çökmeler düzeltildi.
- Yinelenenleri bul, karışık formatlı yığınları ve ağ hatalarını ele alır.
- Beautify önizlemesi gerçek zamanlı güncellenir.
- Birleştirme ve vektörleştirme için ilerleme çubukları.
- SVGZ, SVG-to-raster tarafından ele alınır.
- ASCII olmayan dosya adları, yüzde kodlamalı X-File-Results başlığı aracılığıyla düzeltildi.

### Yükseltme {#upgrade-3}

```bash
docker pull snapotter/snapotter:1.17.0
```

Veya Docker Compose ile:

```bash
docker compose pull && docker compose up -d
```

[GitHub'daki tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v1.16.0...v1.17.0)

---

## v1.14.0 {#v1-14-0}

GPU otomatik algılamalı birleşik Docker imajı. Tek imaj hem CPU hem de GPU iş yüklerini yönetir. Compose, günlük döndürmeli tek bir dosyaya basitleştirildi. Model ön indirmeleri artık doğrulama ve bir duman testi içeriyor.

---

## v1.13.0 {#v1-13-0}

Rol tabanlı erişim denetimi (RBAC). 14 ayrıntılı izin, üç yerleşik rol (admin, editor, user), özel rol desteği. Tüm API rotalarında izin kontrolleri. Kullanıcı izinlerine göre filtrelenen ön uç sekmeleri.

---

## v1.12.0 {#v1-12-0}

PDF to Image aracı. PDF sayfalarını özel DPI'da PNG, JPEG, WebP veya TIFF'e dönüştürün. GPU otomatik algılamalı birleşik Docker imajı.

---

## v1.11.0 {#v1-11-0}

AI dostu belgeler için vitepress-plugin-llms aracılığıyla otomatik oluşturulan llms.txt.

---

## v1.10.0 {#v1-10-0}

Yüz korumalı içerik farkında yeniden boyutlandırma (dikiş oyma). Önemli içeriği koruyarak görüntüleri yeniden boyutlandırın.

---

## v1.9.0 {#v1-9-0}

Stitch / Combine aracı. Görüntüleri yan yana, dikey olarak üst üste veya özel bir ızgarada birleştirin.

---

## v1.8.0 {#v1-8-0}

Edit Metadata aracı. EXIF, IPTC ve XMP meta verilerini ayrıntılı bir çıkarma/koruma arayüzüyle görüntüleyin ve düzenleyin.

---

## Eski sürümler {#older-releases}

Yama sürümleri dahil tam işleme düzeyi değişiklik günlüğü için [GitHub Releases](https://github.com/snapotter-hq/snapotter/releases) sayfasına bakın.
