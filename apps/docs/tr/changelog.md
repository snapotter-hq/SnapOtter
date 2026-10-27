---
description: "SnapOtter için sürüm notları ve versiyon geçmişi. Her sürümde nelerin yeni, iyileştirilmiş ve düzeltilmiş olduğunu görün."
i18n_source_hash: d3c5fc4c6b75
i18n_provenance: human
i18n_output_hash: a97131dc8bdb
---

# Değişiklik Günlüğü {#changelog}

## v2.2.0 {#v2-2-0}

2.2'nin büyük kısmı sağlamlaştırmadan oluşuyor. Özel bir rol aracılığıyla devredilmiş `users:manage` yetkisine sahip yönetici olmayan bir kullanıcı bir örneği ele geçirebiliyordu ve her araç uç noktasının izin kontrolünün eksik olduğu ortaya çıktı. Birden fazla kullanıcı çalıştırıyorsanız yükseltin.

Geri kalanı kendi sunucunuzda barındırmanın uzun kuyruğu: başlayıp hiç bitmeyen indirmeler, ikinci bir dosya eklediğiniz anda bozulan ön ayarlar, Postgres hâlâ açılırken çöküp yeniden başlayan konteynerler. İki yeni araç da geldi. Dokümanlar ve web sitesi artık 21 dile çevrildi ve arayüz nihayet WCAG AA kontrastını karşılıyor.

> [!IMPORTANT]
> Özel bir rol aracılığıyla yönetici olmayan birine `users:manage` verdiyseniz, o rol 2.0.0 ile 2.1.0 arasında yönetici hesaplarını ele geçirebiliyordu. Ayrıntılar Güvenlik bölümünde.

### Güvenlik {#v2-2-0-security}

- **Devredilmiş bir `users:manage` rolü üzerinden ayrıcalık yükseltme (GHSA-9xgh-95qh-2x7h).** Özel bir rol aracılığıyla `users:manage` yetkisine sahip yönetici olmayan biri, yerleşik bir yönetici de dahil olmak üzere daha yüksek ayrıcalıklı bir hesabın parolasını sıfırlayabiliyor veya hesabı silebiliyor ve örneği ele geçirebiliyordu. Parola sıfırlama ve hesap silme artık çağıranın hedef üzerindeki yetkisini doğruluyor, böylece devredilmiş bir rol kendi seviyesinin üstüne erişemiyor. Etkilenen sürümler: 2.0.0 ile 2.1.0. Bildiren: 李春来 (Chunlai Li). (#616)
- **Her araç uç noktası artık koruma altında.** Araç erişimi rota rota uygulanıyordu, bu yüzden elle yazılmış 45 rotanın hepsinin aynı çağrıyı hatırlaması gerekiyordu ve hiçbiri hatırlamadı. `tools:use` yetkisi olmayan bir rol image-to-pdf, erase-object, upscale, sign-pdf ve diğerlerini yine de çalıştırabiliyordu. Kontrol artık eşleşen rotaya göre çalışan tek bir preHandler içinde, böylece alt yolları ve sonradan eklenen her rotayı kapsıyor. (#646)
- **Docker kurulumlarında hız sınırı atlatılabiliyordu.** İmge `TRUST_PROXY=true` ile geliyordu, bu yüzden istemci IP'si bir istek başlığından alınıyordu ve sahte bir `X-Forwarded-For` giriş sınırlayıcısını atlatıyordu. Varsayılan artık özel ağ güven listesi. (#649)
- **Ayarlar yazmaları kapıda bir kez değil, ayar başına kontrol ediliyor** ve yapılandırma içe aktarma artık işlemsel; böylece reddedilen bir anahtar yarım uygulanmış bir yapılandırma bırakamıyor. (#618)
- **Kütüphane dosya adları depolama köklerinin dışına çıkamaz.** Kötü niyetli bir 1.x SQLite içe aktarmasının birebir kopyaladığı hazırlanmış bir saklanan ad, dosyalar dizininin dışındaki dosyaları okuyabiliyor veya silebiliyordu. Yalnızca bir operatörün saldırgan tarafından sağlanan bir 1.x SQLite veritabanını içe aktarmasından sonra erişilebilir; saklanan bir adın seçilmesine izin veren tek yol budur. Bildiren: @Alpastx. (GHSA-55w2-8cqf-w969, #600)
- **İş iptali sahipliği zorunlu kılıyor**, böylece kimliği doğrulanmış bir kullanıcı artık başka bir kullanıcının işini kimliğiyle iptal edemiyor. Bildiren: @Alpastx. (GHSA-wqxf-gj2p-689x, #599)
- **2.0 ağacının tamamının yeniden denetimi hâlâ açık olanları yakaladı**: ele geçirilmiş bir SAML assertion'ı yeniden oynatılabiliyordu, bir MFA sorgulaması kaç yanlış kod girilirse girilsin ayakta kalıyordu, istek başına API anahtarı araması tam tablo taramasıydı, `MAX_WORKSPACE_SIZE_GB` ölü yapılandırmaydı ve SVG temizleyici tırnaksız `javascript:` href'lerini geçiriyordu. (#620)
- **Açıklanmış dokuz CVE yamalandı**: fast-uri, svgo, sharp ve dolaylı olarak tar (#619), ayrıca Pillow 12.3.0 (#517). arm64 üzerinde RAW kod çözme artık yamasız bir sistem kopyasına bağlanmak yerine LibRaw 0.22.2'yi kaynaktan derliyor. (#649)

### Yeni özellikler {#v2-2-0-new-features}

- **Yuvarlatılmış Kırpma**: köşe yarıçapı kontrolüyle yuvarlatılmış kare ve iOS tarzı squircle maskeler. Favicon'lar ve uygulama simgeleri için tasarlandı. (#602)
- **GIF Arka Planını Kaldır**: hareketli bir GIF, WebP veya APNG'nin arka planını kare kare kaldırın ve saydam bir animasyon geri alın. (#502)
- **Nesne Silici kement ve Yüksek Kalite modu**: her pikseli boyamak yerine serbest biçimli bir döngü sürükleyin ve daha temiz geniş alan dolguları için isteğe bağlı olarak bir difüzyon inpainting paketi kurun. (#503, #566)
- **Yeni olarak kaydet veya üzerine yaz.** Bir kütüphane dosyasını düzenlemek eskiden orijinalin sessizce yerini alıyordu. Artık her düzenlemede siz seçiyorsunuz ve varsayılan orijinali koruyor. (#564, #577)
- **Yeniden Boyutlandırma'da en-boy oranı ön ayarları.** 1:1, 4:3 veya 16:9 seçin ve iki boyut büyütme yapılmadan kilitli kalsın. (#530)
- **İki katmanlı OCR**: hızlı katman imgeye gömülüdür ve indirme olmadan çevrimdışı çalışır; daha doğru çalışma zamanı ise talep üzerine kurulur. (#519)
- **Aramak için herhangi bir yere yazın.** Panoda veya ana sayfada yazmaya başlayın, yazdıklarınız arama kutusuna gider. (#644)
- **21 dilde dokümantasyon ve web sitesi**: doküman sitesi, açılış sayfaları ve API referansı artık uygulama arayüzüne katılarak çevrildi. Yeni bir düşük kaynaklı dağıtım kılavuzu Raspberry Pi ve 2 GB makineleri kapsıyor. (#548)
- **Daha net araç adları**: 18 belirsiz ad artık kendini niteliyor, böylece "Compress" "Compress Image" oldu. Araç kimlikleri ve rotalar değişmedi, bu yüzden yer imlerine eklenen hiçbir şey bozulmuyor. (#520)

### İyileştirmeler {#v2-2-0-improvements}

- **Arayüz genelinde WCAG AA kontrastı**: palet yeniden ayarlandı; canlı turuncu dolgularda kalırken metinler ve etiketler erişilebilir mürekkep token'ları kullanıyor ve 57 odak göstergesinin tamamı artık 3:1 metin dışı eşiğini karşılıyor. (#567, #574)
- **Büyütme ve arka plan kaldırma artık donmuş görünmüyor**: ilerleme çubuğu çıkarım sırasında %30'da takılmak yerine ilerliyor ve her iki araç da artık yalnızca CPU'lu bir ana bilgisayarın çok daha yavaş olduğu konusunda uyarıyor. (#605, #608)
- **Zaman aşımı mesajları gerçek nedeni adlandırıyor** ve yüklemeyi suçlamak yerine CPU'lu ana bilgisayarları da hesaba katıyor. (#596)
- **SnapOtter başlangıçta Postgres ve Redis'i bekliyor**, hem Compose'da hem de hepsi bir arada imgede çöküp yeniden başlamak yerine. Bir Proxmox LXC kurulumu bundan önce 76 kez yeniden başlıyordu. (#537, #595)
- **İndirmeler ters proxy'den sağ çıkıyor**: SnapOtter, nginx ve uyumlu proxy'lerden dosya yanıtlarını arabelleğe almamalarını istiyor; kendi sunucunuzda başlayıp hiç bitmeyen bir indirmenin olağan nedeni budur. (#604, #607)
- **PDF Sıkıştır hedef boyuta yakın sonuç veriyor** ve hedefe ulaşılamadığında bunu dürüstçe söylüyor. (#522)
- **Mobil araç kontrolleri erişilebilir kalıyor**, çünkü uygulama kabukları artık dinamik görünüm alanına göre boyutlanıyor. (#559)
- **Ses Dönüştür bir örnekleme hızı ayarı sunuyor.** (#561)
- **Yöneticiler minimum parola uzunluğunu gevşetebiliyor**, güvenilen bir LAN örneği için 1'e kadar. (#543)
- **MFA artık self servis**, politika nedeniyle kilitlenme giderildi ve OIDC veya SAML girişleri sert bir engel yerine gerçek bir MFA sorgulaması alıyor. (#531, #536)
- **Çıplak bir `Error: Error` artık nedenini adlandırıyor.** Sharp kodlama hataları, AI sidecar çıkışları, JSON olmayan belge sidecar çıktısı ve arka plan kaldırma hataları eskiden nedeni temizlenmiş halde geliyordu. (#532, #534, #535, #538, #612)
- **Yardım iletişim kutusu çevrildi.** Kısayol etiketleri ve başlangıç metni sabit kodlanmış İngilizceydi, oysa tamamlanmış çeviriler 21 yerel ayar dosyasının tamamında kullanılmadan duruyordu. (#647)

### Hata düzeltmeleri {#v2-2-0-bug-fixes}

- **iPhone HEIC dosyaları**, onları işleyen kod çözücüye ulaşmadan okunamaz diye reddediliyordu. (#631)
- **Dönüştürme ön ayarları ikinci dosyada başarısız oluyordu**: jpg-to-pdf ve image-to-pdf varyantları, ayrıca pdf-to-png, pdf-to-jpg ve pdf-to-tiff, iki dosya yüklediğinizde `Tool not found` döndürüyordu. (#633, #643)
- **PDF dönüştürme ön ayarları indirme düğmesini kaybediyordu.** (#629)
- **Sınırsız işleme zaman aşımı dikkate alınmıyordu** ve takılan ilerleme akışları artık arayüzü bekletmek yerine toparlanıyor. (#638)
- **İndirmeler başarısız olmak yerine takılıyordu**, saklanan bir dosya kayıtlı uzunluğundan kısa çıktığında. (#617)
- **PDF sayfa araçları kısa ve şifreli dosyalarda başarısız oluyordu**: Sayfaları Kaldır altı sayfadan kısa hiçbir belgede bulunmayan bir sayfa aralığını varsayılan alıyordu ve parola korumalı PDF'ler worker içinde anlaşılmaz biçimde başarısız oluyordu. (#594)
- **PDF'ten Metne taranmış PDF'ler için sessizce boş dosya döndürüyordu.** Artık sizi OCR'a yönlendiriyor ve metni UTF-8 olarak sunuyor. (#603)
- **PDF'ten Word'e renkli metin bloklarını düşürüyordu** ve bunları sayfaya bölüyordu. (#500)
- **Nesne Silici hayalet kalıntılar bırakıyordu** ve yüksek çözünürlüklü görsellerde küçük nesneleri bulanıklaştırıyordu. (#501)
- **Videoyu Sabitle faststart olmadan oynatılamayan çıktı yazıyordu.** (#593)
- **Görsel düzenleyici onarımları**: döndürme, çevirme, yeniden boyutlandırma, seviyeler, eğriler, filtreler ve katman kilidi. (#597)
- **PDF İmzala boş bir tuval gösteriyordu**, bir PDF'nin neden yüklenemediğini bildirmek yerine. (#545)
- **Dosya kütüphanesi 0x0 boyutlar kaydediyordu** ve HEIC, RAW ve PSD yüklemeleri için önizlemeleri atlıyordu. (#636, #637)
- **Birden fazla AI paketi kurmak** paylaşılan virtualenv'i çok sürümlü bırakıyor ve üç aracı sessizce bozuyordu. (#649)
- **JXL'ye 1 ile 4 arası kalitede dönüştürme 500 döndürüyordu** ve eksik bir ffmpeg size bozuk yükleme olarak bildiriliyordu. (#649)
- **Geçici bir Postgres kesintisi tamamlanmış işleri ortada bırakıyordu**, çıktıyı ona işaret eden hiçbir satır olmadan diskte bırakarak. Artık bir uzlaştırıcı bu işi bırakmak yerine sahipleniyor. (#649)
- **Adres değiştiren bir Redis uç noktası her tüketiciyi kilitliyordu**, sağlık kontrolleri hâlâ 200 yanıtı verirken. (#649)
- **Web sitesi ve doküman düzeltmeleri**: yerelleştirilmiş bağlantılar artık `#` parçalarını düşürmüyor veya `zh-CN`'i küçük harfe çevirmiyor, doküman navigasyonu tabletlerde görünüm alanı içinde kalıyor ve iki site de artık tarayıcınızdan GitHub API'sini çağırmıyor. (#516, #562, #570, #560)

### Yükseltme notları {#v2-2-0-upgrade-notes}

Geçirilecek bir şey yok, ancak iki varsayılan değişti:

- **`TRUST_PROXY` artık her eşe güvenmek yerine varsayılan olarak `loopback,linklocal,uniquelocal` değerini kullanıyor.** Docker bridge ve Compose ağları bu aralığın içinde, bu yüzden çoğu kurulumun değişmesi gerekmiyor. Ters proxy'niz SnapOtter'a genel bir adresten ulaşıyorsa `TRUST_PROXY` değerini açıkça ayarlayın, aksi takdirde hız sınırlama ve denetim günlükleri her isteği proxy'ye atfeder.
- **`MAX_AI_JOBS_PER_USER` kullanıcı başına varsayılan olarak 5 eşzamanlı tek dosyalı AI işi** ile geliyor. Toplu ve işlem hattı AI çalışmaları sınırsız kalır.

Yeni isteğe bağlı ayarlar: `DB_STARTUP_TIMEOUT_MS`, `SUBPROCESS_MEMORY_LIMIT_MB` (varsayılan olarak kapalı) ve `GIF_BG_MAX_FRAMES`.

### Teşekkürler {#v2-2-0-acknowledgements}

Bu sürümün önemli bir kısmı başka birinin hata raporu olarak başladı.

Kod ve katkılar:

- **@mvanhorn** ❤️: Arka plan kaldırma zaman aşımı hatasını çıplak bir zaman aşımı yerine ne yapılacağını söyleyen bir mesaja dönüştürdü. (#518, #494)
- **@EuanTop** ❤️: Senkron rotanın standart araç sonucu sözleşmesini döndürmesini sağlayarak PDF dönüştürme ön ayar sayfalarındaki indirme eylemini geri getirdi. (#629, #623)
- **@harshjainnn** ❤️: Başlayıp hiç bitmeyen indirmeyi teşhis etti ve düzeltmenin üzerine kurulduğu socket sıfırlama yönünü önerdi. (#617, #590)

Güvenlik bildirimleri:

- **李春来 (Chunlai Li)** ❤️ ([@laijunyue](https://github.com/laijunyue)): Devredilmiş bir `users:manage` rolü üzerinden ayrıcalık yükseltmeyi, tam bir kaynaktan havuza analiz ve çalışan bir istismar zinciriyle özel olarak bildirdi. (GHSA-9xgh-95qh-2x7h, #616)
- **@Alpastx** ❤️ (Alpesh Bhagwatkar): İş iptalinde kimliği doğrulanmış bir IDOR ve kötü niyetli bir 1.x SQLite içe aktarmasından sonra erişilebilen kütüphane saklanan dosya adlarında bir yol geçişi bildirdi; her biri için çalışan bir kavram kanıtıyla. (#599, #600)

Hata raporları:

- **@riz467** ❤️: Doğrulamada reddedilen gerçek iPhone HEIC dosyaları; kök neden raporda ortaya kondu. (#622)
- **@coupej** ❤️: Sonsuza kadar takılan PDF ön ayar sayfaları ve ikinci dosya eklendiği anda başarısız olan jpg-to-pdf. Doğru şekilde ayrılmış iki farklı hata. (#623, #627)
- **@linuxuser1** ❤️: Sınırsız olarak belgelenen ancak beş dakikayla sınırlanan `PROCESSING_TIMEOUT_S=0`. (#630)
- **@bezibaerchen** ❤️: Ses Dönüştür'ün kendi açıklamasının vaat ettiği örnekleme hızı ayarını gizlemesi. (#558)
- **@hell-toupee** ❤️: Doğru OCR paketinin `libpaddle` hatasıyla kurulamaması. (#505)
- **@Michael1260** ❤️ ve **@And-CSH** ❤️: OCR kurulum hatasını bağımsız olarak doğruladı ve manuel çıkarmanın çalışıp uygulama içi yükleyicinin çalışmadığını ortaya koydu; bu da hatayı yükleyiciye sabitledi. (#505)
- **@TomErnst1972** ❤️: MFA zorunluluğu politikasını etkinleştirmenin bir yöneticiyi kendi örneğinden kilitlemesi. (#515)
- **@thokich** ❤️: Nesne silmenin bulanık, kullanılamaz dolgular üretmesi; hem HD inpainting yeniden yazımını hem de isteğe bağlı yüksek kalite paketini tetikledi. (#141)
- **@Hennie-git** ❤️: Henüz bağlantı kabul etmeyen bir Postgres'e karşı 76 kez yeniden başlayan bir Proxmox LXC kurulumu. (community-scripts/ProxmoxVE#15796)
- **MickLesk** ❤️ (Proxmox VE community-scripts): O raporu gerçek zamanlı olarak değerlendirdi ve başlangıç düzeltmesinin üzerine kurulduğu teşhisi üretti. (#537)

Özellik istekleri ve geri bildirimler:

- **@LECOQQ** ❤️: Ev sunucusu kurulumunda parola karmaşıklığının gevşetilmesini istedi. (#136)
- **@killervette42** ❤️: Bir Unraid Community App istedi; artık Unraid CA mağazasında yayımlandı. (#96)
- **@alienatedsec** ❤️: GPU'nun CPU'ya geri düşmesi düzeltmesinin kapalı bir konuda gömülü ve keşfedilemez olduğunu belirtti; bu yüzden artık dağıtım dokümanlarında yer alıyor. (#490, #587)
- **@neilp316** ❤️: RTX 5060 üzerindeki Blackwell GPU hatasını doğruladı ve çalışan bir CUDA 12.8 yükseltme yolu çizdi. (#120)
- **@Roiki11** ❤️: Makine dışı AI hesaplaması için HTTP dosya aktarımı yerine yol referanslı paylaşılan depolamayı savundu. (#189)

Bu sorunları Discord ve e-posta üzerinden bildiren ve adlarını kaydetmediğimiz topluluk üyelerine de teşekkürler: squircle kırpma isteği (#602), başlayıp hiç bitmeyen image-to-PDF indirmesi (#604, #607), takılan Sayfaları Kaldır aracı (#594), pdf-to-text'te eksik Arapça metin (#603) ve ONNX GPU geri dönüşünün arkasındaki teşhis (#490).

[GitHub'daki tam fark](https://github.com/snapotter-hq/SnapOtter/compare/v2.1.0...v2.2.0)

---

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
