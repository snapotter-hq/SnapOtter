---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: b343bad72549
---
# Düşük Kaynaklı Kurulumlar {#low-resource-setups}

SnapOtter küçük donanımda iyi çalışır: bir Raspberry Pi 4 veya 5, eski bir dizüstü bilgisayar ya da 2 GB'lık bir VPS. Bu sayfa, bu makineler için pratik kılavuzdur: neler beklemeniz gerektiği, makul sınırlarla kopyala-yapıştır bir kurulum ve hangi özelliklerin atlanacağı. Bu sayıların arkasındaki tam kıyaslama verileri [Donanım Gereksinimleri](/tr/guide/deployment#hardware-requirements) bölümündedir.

Baştan iki kesin kısıt:

- **Yalnızca 64 bit.** İmaj `linux/amd64` ve `linux/arm64` için derlenir. 32 bit ARM (`armv7`/`armhf`) desteklenmez; bu yüzden birinci nesil Pi'ler ve Pi Zero ailesi devre dışıdır.
- **2 GB bellek tabanı.** 512 MB yığını başlatamaz, 1 GB ise çok dosyalı toplu işlerde başarısız olur. Rahat çalışan en küçük yapılandırma 2 çekirdekli 2 GB'dir.

## Küçük donanımda neler iyi çalışır {#what-runs-well}

AI olmayan her araç 2 GB / 2 çekirdekli bir makinede çalışır: Görsel ve Dosyalar bölümlerinin tamamı, PDF araçları ve stream copy ile yapılan video ve ses işlemleri (kırpma, sesi kapatma, kapsayıcı değişimi). Çoğu bir saniyenin altında tamamlanır.

İki iş yükü istisnadır:

- **Videoyu yeniden kodlama** (codec'ler arasında dönüştürme) CPU'ya bağlıdır. Hızlı bir masaüstü CPU'sunda ~40 sn süren bir 1080p klip, Pi sınıfı bir CPU'da birkaç dakika sürebilir. Stream copy işlemleri anlık kalır.
- **AI araçları** RAM (4 GB önerilir) ve disk ister (büyük paketlerin her biri 4-5 GB'dir) ve ağır olanlar (ölçeklendirme, fotoğraf restorasyonu, arka plan kaldırma) Pi sınıfı CPU'larda pratik değildir. Yüz algılama ve OCR gibi hafif AI, belleğiniz yetiyorsa kullanılabilir.

İkisi de siz kullanmadıkça kurulmaz ve çalışmaz: hiçbir AI paketi kurulu değilken uygulama boşta yaklaşık 360 MB kullanır ve AI paketleri yalnızca bir yönetici etkinleştirdiğinde indirilir.

## Raspberry Pi / eski dizüstü için adım adım kurulum {#walkthrough}

Bu, [Başlarken](/tr/guide/getting-started) bölümündeki standart Compose kurulumunun kaynak limitleri ve temkinli sınırlar eklenmiş hâlidir. 64 bit bir işletim sistemi varsayar (bir Pi'de: Raspberry Pi OS 64-bit veya Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
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
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Pi sınıfı makineler için notlar:

- **SD kart yerine bir USB SSD tercih edin**; veri birimi ve Postgres bunun üzerinde dursun. İş çalışma alanları gerçek disk G/Ç'si yapar ve SD kartlar hem yavaştır hem de çabuk aşınır.
- **Hepsi bir arada tek konteyner burada da çalışır** (`DATABASE_URL`/`REDIS_URL` ayarlanmadığında gömülü Postgres ve Redis) ve belleği kısıtlı bir ana makinede gömülü Redis sınırını `REDIS_MAXMEMORY` ile düşürmelisiniz (bkz. [Yapılandırma](/tr/guide/configuration)). Compose servis başına daha ince denetim sağlar; bu kılavuzun Compose kullanmasının nedeni de budur.
- **2 GB'lık cihazlara swap ekleyin.** Bu, ara sıra oluşan bir sıçramanın (büyük bir PDF, sınırlamayı unuttuğunuz bir toplu iş) bellek yetersizliğinden süreç sonlandırmayla bitmesini önler. zram, SD kart dostu seçenektir.
- arm64 imajı yalnızca CPU içindir; ARM kartlarda CUDA yoktur.

## Ayar düğmeleri {#tuning-knobs}

Tüm sınırlar ortam değişkenleridir ve [Yapılandırma](/tr/guide/configuration) bölümünde eksiksiz belgelenmiştir. `0` sınırsız veya otomatik anlamına gelir. Küçük donanımda önemli olanlar:

| Değişken | Küçük makine önerisi | Neyi korur |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Kaç işin paralel çalıştığı. Otomatik algılama CPU çekirdek sayısının bir eksiğini kullanır; bu büyük makinelerde iyidir, bellek baskısı altındaki 2 çekirdekli bir kutuda ise fazla isteklidir. |
| `MAX_WORKER_THREADS` | `2` | Görüntü işleme iş parçacığı havuzu. |
| `MAX_BATCH_SIZE` | `5` | 1-2 GB'lık makinelerin belleği ilk önce toplu işlerde tükenir. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Tek bir devasa dosyanın tüm çalışma alanını kaplamasını önler. |
| `MAX_MEGAPIXELS` | `50` | 100+ MP bir görseli çözmek, dosya boyutundan bağımsız olarak RAM'e mal olur. |
| `MAX_VIDEO_DURATION_S` | `300` | Uzun dönüştürmeler küçük bir CPU'yu dakikalarca, hatta saatlerce meşgul eder. |
| `PROCESSING_TIMEOUT_S` | `600` | Kontrolden çıkan bir işin makineyi eninde sonunda serbest bırakması için kesin tavan. |

Bu sınırlar sunucunun neyi kabul ettiğini belirler; bu yüzden onları olabildiğince küçük değil, gerçekten kullandığınız şeye göre ayarlayın. Videoya hiç dokunmuyorsanız bir `MAX_VIDEO_DURATION_S` sınırının maliyeti yoktur; her gün belge tarıyorsanız `MAX_PDF_PAGES` değişkenine sınır koymayın.

## Nelerden vazgeçmeli {#what-to-skip}

- **Ağır AI paketleri.** Ölçeklendirme, fotoğraf restorasyonu ve arka plan kaldırma bir GPU veya çok çekirdekli hızlı bir CPU ister ve her paket 4-5 GB disk kaplar. Küçük bir makinede bunları kurmamanız yeterlidir; paketi eksik olan araçlar çalışmak yerine bir kurulum istemi gösterir.
- **Rutin iş yükü olarak video yeniden kodlama.** Ara sıra dönüştürme sorun değildir (yalnızca yavaştır); sürekli bir dönüştürme kuyruğu CPU çekirdeği ister, Pi değil.
- **Genel olarak kullanılmayan araçlar.** Bir yönetici Settings içinden tek tek araçları kapatabilir; bu, onları arayüzden kaldırır ve API rotalarının kaydını durdurur. Bu tek başına bellek kazandırmaz, ancak paylaşılan küçük bir örneğin donanımın kaldıramayacağı o tek iş yükü için kullanılmasını engeller.

Örneği daha sonra daha büyük bir donanıma taşırsanız sınırları kaldırın (`0` değerine geri alın); aynı veri birimi olduğu gibi taşınır.
