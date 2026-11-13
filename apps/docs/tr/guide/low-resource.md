---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: 91eddb85b457
i18n_hash_version: 2
---
# Düşük Kaynaklı Kurulumlar {#low-resource-setups}

SnapOtter küçük donanımlarda iyi çalışır: Raspberry Pi 4 veya 5, eski bir dizüstü bilgisayar ya da 2 GB'lık bir VPS. Bu sayfa bu makineler için pratik bir rehberdir: ne beklemeniz gerektiği, makul sınırlarla kopyala-yapıştır bir kurulum ve hangi özelliklerin atlanacağı. Bu sayıların arkasındaki tam kıyaslama verileri [Donanım Gereksinimleri](/tr/guide/deployment#hardware-requirements) sayfasındadır.

Baştan iki kesin kısıt:

- **Yalnızca 64 bit.** İmaj `linux/amd64` ve `linux/arm64` için derlenmiştir. 32 bit ARM (`armv7`/`armhf`) desteklenmez; bu nedenle ilk nesil Pi'ler ve Pi Zero ailesi kapsam dışıdır.
- **2 GB bellek tabanı (yapay zeka dışı araçlar).** 512 MB yığını başlatamaz, 1 GB ise çok dosyalı toplu işlemlerde başarısız olur. 2 çekirdekli 2 GB, yapay zeka dışı araçları rahatça çalıştıran en küçük yapılandırmadır.

## Küçük donanımda iyi çalışanlar {#what-runs-well}

Yapay zeka dışındaki her araç 2 GB / 2 çekirdekli bir makinede çalışır: Görsel ve Dosyalar bölümlerinin tamamı, PDF araçları ve akış kopyalamalı video ve ses işlemleri (kırpma, sessize alma, kapsayıcı yeniden paketleme). Çoğu bir saniyenin altında tamamlanır.

İki iş yükü istisnadır:

- **Video yeniden kodlama** (codec'ler arası dönüştürme) CPU'ya bağımlıdır. Hızlı bir masaüstü CPU'da ~40 sn süren 1080p bir klip, Pi sınıfı bir CPU'da birkaç dakika sürebilir. Akış kopyalama işlemleri anlık kalır.
- **Yapay zeka araçlarının** paket başına CPU bellek tabanları vardır: Yüz Algılama ve yerleşik Hızlı OCR için 2 GB ana makine RAM'i (0,5 GB boş), Doğru OCR için 4 GiB yapılandırılmış etkin bellek, Transkripsiyon, Nesne Silici ve Renklendirme, Arka Plan Kaldırma, Büyütme ve İyileştirme ile Fotoğraf Restorasyonu için 4 GB ana makine RAM'i (2 ila 3 GB boş) ve Yüksek Kaliteli Inpainting için 8 GB ana makine RAM'i (6 GB boş). 2 GB'lık bir makine Whisper, RealESRGAN, rembg veya LaMa'yı bellek yetersizliğiyle sonlandırılmadan çalıştıramaz; bu yüzden SnapOtter, Python yan servisine göndermeden önce boş belleği denetler ve paket tabanının altındaki çalıştırmaları hemen reddeder.

İkisi de kullanmadığınız sürece ne kurulur ne de çalışır: hiçbir yapay zeka paketi kurulu değilken uygulama yaklaşık 360 MB ile boşta bekler ve yapay zeka paketleri yalnızca bir yönetici etkinleştirdiğinde indirilir.

## Raspberry Pi / eski dizüstü bilgisayar adım adım kurulum {#walkthrough}

Bu, [Başlangıç](/tr/guide/getting-started) sayfasındaki standart Compose kurulumudur; ek olarak kaynak sınırları ve ihtiyatlı üst sınırlar içerir. 64 bit bir işletim sistemi varsayar (Pi'de: 64 bit Raspberry Pi OS veya Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi sınıfı makineler için notlar:

- Veri birimi ve Postgres için **SD kart yerine USB SSD tercih edin**. İş çalışma alanları gerçek disk G/Ç'si yapar; SD kartlar hem yavaştır hem de çabuk aşınır.
- **Hepsi bir arada tek kapsayıcı da burada çalışır** (`DATABASE_URL`/`REDIS_URL` ayarlanmadığında gömülü Postgres ve Redis). Bellek kısıtlı bir ana makinede gömülü Redis sınırını `REDIS_MAXMEMORY` ile düşürmelisiniz ([Yapılandırma](/tr/guide/configuration) sayfasına bakın). Compose servis başına daha ince denetim sağlar; bu rehberin onu kullanmasının nedeni budur.
- **2 GB'lık cihazlarda takas alanı (swap) ekleyin.** Ara sıra görülen ani artışların (büyük bir PDF, sınırlamayı unuttuğunuz bir toplu iş) bellek yetersizliğiyle sonlandırılmasını önler. zram, SD kart dostu seçenektir.
- arm64 imajı yalnızca CPU içindir; ARM kartlarında CUDA yoktur.

## Ayar parametreleri {#tuning-knobs}

Tüm sınırlar ortam değişkenleridir ve [Yapılandırma](/tr/guide/configuration) sayfasında ayrıntılı olarak belgelenmiştir. `0` sınırsız veya otomatik anlamına gelir. Küçük donanımda önemli olanlar:

| Değişken | Küçük makine önerisi | Neyi korur |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Kaç işin paralel çalışacağı. Otomatik algılama CPU çekirdek sayısından bir eksiğini kullanır; bu büyük makinelerde uygundur, bellek baskısı altındaki 2 çekirdekli bir makine için fazla ataktır. |
| `MAX_WORKER_THREADS` | `2` | Görsel işleme iş parçacığı havuzu. |
| `MAX_BATCH_SIZE` | `5` | 1-2 GB'lık makinelerde belleğin ilk tükendiği yer toplu işlemlerdir. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Tek bir dev dosyanın tüm çalışma alanını işgal etmesini önler. |
| `MAX_MEGAPIXELS` | `50` | 100+ MP'lik bir görseli çözmek, dosya boyutundan bağımsız olarak RAM harcar. |
| `MAX_VIDEO_DURATION_S` | `300` | Uzun kodlama işlemleri küçük bir CPU'yu dakikalarca ya da saatlerce meşgul eder. |
| `PROCESSING_TIMEOUT_S` | `600` | Kontrolden çıkan bir işin makineyi eninde sonunda serbest bırakmasını sağlayan kesin üst sınır. |

Bu sınırlar sunucunun kabul ettiklerine uygulanır; bu yüzden olabildiğince küçük yapmak yerine gerçekten kullandıklarınıza göre ayarlayın. Hiç video kullanmıyorsanız `MAX_VIDEO_DURATION_S` sınırının size maliyeti yoktur; her gün belge tarıyorsanız `MAX_PDF_PAGES` değerini sınırlamayın.

## Nelerin atlanacağı {#what-to-skip}

- **Ağır yapay zeka paketleri.** Büyütme, fotoğraf restorasyonu ve arka plan kaldırma bir GPU ya da hızlı, çok çekirdekli bir CPU ister; her paket 4-5 GB disk kaplar. Küçük bir makinede bunları kurmayın; paketi eksik olan araçlar çalışmak yerine bir kurulum istemi gösterir.
- **Rutin iş yükü olarak video yeniden kodlama.** Ara sıra yapılan kodlamalar sorun değildir (yalnızca yavaştır); sürekli bir kodlama kuyruğu Pi'ye değil CPU çekirdeklerine ihtiyaç duyar.
- **Genel olarak kullanılmayan araçlar.** Bir yönetici Ayarlar'dan tek tek araçları kapatabilir; bu, onları arayüzden kaldırır ve API rotalarının kaydedilmesini durdurur. Bu tek başına bellek tasarrufu sağlamaz, ancak paylaşılan küçük bir örneğin donanımın kaldıramayacağı iş yükü için kullanılmasını engeller.

Örneği daha sonra daha güçlü bir donanıma taşırsanız sınırları kaldırın (`0` değerine geri alın); aynı veri birimi olduğu gibi taşınır.
