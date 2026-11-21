---
description: "SnapOtter'ı Docker ile tek komutta kurun, giriş yapın ve ilk aracınızı açın. GPU hızlandırmayı, küçük makineleri, Docker Compose kurulumunu ve kaynak koddan derlemeyi kapsar."
i18n_source_hash: c2aae540add0
i18n_provenance: machine
i18n_output_hash: 5c57b97d90a5
i18n_hash_version: 2
---

# Başlangıç {#getting-started}

::: tip Kurmadan önce deneyin
Tüm arayüzü [demo.snapotter.com](https://demo.snapotter.com) adresinde keşfedin: kayıt veya kurulum gerekmez.
:::

## Hızlı Başlangıç {#quick-start}

Tek bir komut çalıştırın:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Ardından [http://localhost:1349](http://localhost:1349) adresini açın ve `admin` / `admin` ile giriş yapın. İlk girişte parolanızı değiştirmeniz istenir.

Şimdi bir araç açın. Kenar çubuğundan birini seçin ya da doğrudan [Resize](http://localhost:1349/image/resize) aracına gidin, bir görsel bırakın ve sonucu indirin.

Kurulum bu kadar. Bu tek kapsayıcı ihtiyaç duyduğu her şeyi çalıştırır: `DATABASE_URL` ayarlanmadığında kendi PostgreSQL ve Redis'ini loopback arayüzünde başlatır (gömülü mod) ve tüm verileri `SnapOtter-data` biriminde tutar. SnapOtter'ı denemenin ya da bir homelab'da kendi sunucunuzda barındırmanın en hızlı yoludur. Gömülü mod root olarak çalışır (varsayılan) ve `DATABASE_URL` ayarlandığı anda otomatik olarak kapanır. Üretim için PostgreSQL ve Redis'i kendi kapsayıcılarında tutan [Docker Compose yığınını](#docker-compose) kullanın.

İş sonuçları veri biriminde tutulmaz, bu yüzden kapsayıcı değiştirildiğinde (örneğin bir imaj yükseltmesinde) kaybolur ve indirme bağlantıları çalışmaz hale gelir. Dağıtım kılavuzundaki [İş çıktısını saklama](/tr/guide/deployment#keeping-job-output) bölümü bunları nasıl koruyacağınızı açıklar.

::: tip 4 GB veya daha az RAM ile çalıştırma
Raspberry Pi, eski bir dizüstü bilgisayar ya da küçük bir VPS üzerinde aynı anda tek iş çalıştırın, yukarıdaki komuta `-e CONCURRENT_JOBS=1 -e MAX_WORKER_THREADS=2` ekleyerek görsel iş parçacığı havuzunu sınırlayın ve ağır yapay zeka paketlerini atlayın. [Düşük Kaynaklı Kurulumlar](/tr/guide/low-resource#tuning-knobs) sayfası, ayarlamaya değer diğer sınırları ve kısıtlı donanımdan ne bekleyeceğinizi listeler.
:::

::: tip Anonim Ürün Analitiği
SnapOtter varsayılan olarak anonim ürün analitiği içerir. Kapatmak için **Ayarlar → Sistem → Gizlilik** bölümünü açın ve **Anonim Ürün Analitiği** seçeneğini kapatın. Tüm örnek için anında durur.

Yeniden derleme yapmadan örnekteki tüm telemetriyi devre dışı bırakmak için `SNAPOTTER_TELEMETRY=0` ortam değişkenini de ayarlayabilirsiniz (`false` ve `off` da çalışır).

Hata izleme, açık kaynak programı aracılığıyla SnapOtter'a sponsor olan [Sentry](https://sentry.io) tarafından sağlanır.

Nelerin toplandığı hakkında ayrıntılar için [SnapOtter'ın topladıkları](/tr/guide/telemetry) sayfasına bakın.
:::

## GPU Hızlandırma {#gpu-acceleration}

Bir NVIDIA GPU, ağır yapay zeka araçlarını çok daha hızlı hale getirir: büyütme (yaklaşık 47 kat), yüz iyileştirme (yaklaşık 12 kat), yazıya dökme ve arka plan kaldırma (her biri yaklaşık 4 kat). OCR, yüz algılama ve fotoğraf restorasyonu CPU tabanlı kalır, bu yüzden GPU bunlara yardımcı olmaz. Aynı imaj ikisini de kapsar; `--gpus all` ekleyin:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Bunun için ana makinede [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) gerekir. CUDA yoksa SnapOtter kendiliğinden CPU'ya döner. VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırma, yapay zeka çıkarımı için şu anda desteklenmemektedir.

- [Donanım Gereksinimleri](/tr/guide/deployment#full-ai-tools-on-nvidia-cuda) sayfasında tam GPU ve CPU süreleri, [Docker İmajı kıyaslamaları](/tr/guide/docker-tags#benchmarks) sayfasında ise sıcak ve soğuk başlangıç değerleri bulunur.
- Yapay zeka araçları hâlâ CPU üzerinde çalışıyorsa [GPU hızlandırmayı doğrulama](/tr/guide/deployment#verify-gpu-acceleration) bölümüne bakın.
- Compose için Dağıtım kılavuzundaki [NVIDIA CUDA Hızlı Başlangıç](/tr/guide/deployment#quick-start-nvidia-cuda) bölümünü kullanın.

## Diğer Kurulum Yöntemleri {#other-ways-to-install}

### Compose ile Tek Kapsayıcı {#single-container-compose}

Hızlı Başlangıç'taki gömülü mod kapsayıcısının aynısı, takip etmesi ve değiştirmesi daha kolay olsun diye bir Compose dosyası olarak yazılmıştır. `docker-compose.yml` olarak kaydedin ve `docker compose up -d` çalıştırın:

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace  # keeps job results across upgrades
    environment:
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin  # you're asked to change it on first login
    restart: unless-stopped
    # mem_limit: 4g
    # cpus: 2

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
```

`docker run` komutu gibi bu da SnapOtter'ı denemek ve küçük kurulumlar içindir. [Yapılandırma](/tr/guide/configuration) sayfasındaki her ayar `environment` altına girer.

### Docker Compose (üretim) {#docker-compose}

Bu sayfadaki kısaltılmış bir Compose örneğini kopyalamak yerine, her sürümle birlikte bakımı yapılan ve test edilen üretim dosyasını kullanın:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

[http://localhost:1349](http://localhost:1349) adresini açın ve `admin` / `admin` ile giriş yapın.

Kanonik [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) dosyası dört çalışma zamanı birimini, sağlık kontrollerini, kaynak sınırlarını, kalıcı Redis yapılandırmasını, sabitlenmiş veritabanı/önbellek imajlarını ve güncel kapsayıcı sıkılaştırmasını içerir. İlk girişten hemen sonra varsayılan yönetici parolasını değiştirin. Tekrarlanabilir bir dağıtım için `latest` etiketini izlemek yerine, doğruladığınız sürüm etiketine veya digest değerine SnapOtter uygulama imajını sabitleyin.

Tüm ortam değişkenleri için [Yapılandırma](/tr/guide/configuration), gizli bilgiler, ağ politikası ve yedekleme önerileri için [Güvenlik ve Sıkılaştırma](/tr/guide/security) sayfasına bakın.

### GitHub Container Registry {#ghcr}

Hem Docker Hub hem de GHCR her sürümde aynı imajı yayımlar. GHCR'den çekmek için imaj adını değiştirin:

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

### Kaynak Koddan Derleme {#build-from-source}

**Ön koşullar:** Node.js 22.22+, pnpm 9+, Docker (Postgres + Redis için), Python 3.11+ (yapay zeka özellikleri için), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Ön yüz: [http://localhost:1351](http://localhost:1351)
- Arka yüz: [http://localhost:13490](http://localhost:13490)

## Neler Yapabilirsiniz {#what-you-can-do}

### Dosya İşleme (200+ Araç) {#file-processing-200-tools}

| Kategori | Sayı | Örnek Araçlar |
|----------|-------|---------------|
| **Görsel** | 112 | Yeniden Boyutlandır, Kırp, Sıkıştır, Dönüştür, Arka Planı Kaldır, Büyüt, OCR, Filigran, Kolaj, Renklendir, GIF Araçları, biçim ön ayarları |
| **Video** | 59 | Kırp, Kes, Sıkıştır, Dönüştür, Birleştir, Ses Çıkar, Otomatik Altyazı, Videodan GIF'e, Yeniden Boyutlandır, Stabilize Et, biçim ön ayarları |
| **Ses** | 57 | Kırp, Birleştir, Dönüştür, Normalleştir, Gürültü Azaltma, Yazıya Dök, Perde Değiştir, Solma, Zil Sesi Oluşturucu, biçim ön ayarları |
| **PDF / Belge** | 36 | Birleştir, Böl, Sıkıştır, OCR, Filigran, Karartma, Word'den PDF'e, Excel'den PDF'e, Döndür, Koru, Onar |
| **Dosyalar** | 25 | CSV'den JSON'a, JSON'dan XML'e, CSV Birleştir, CSV Böl, ZIP Oluştur, ZIP Çıkar, Grafik Oluşturucu, YAML/JSON |

### İş Hatları {#pipelines}

Araçları çok adımlı iş akışlarında zincirleyin ve tek bir görsele ya da bir toplu işe uygulayın:

1. Kenar çubuğunda **Pipelines** bölümünü açın.
2. Adımlar ekleyin (herhangi bir araç, herhangi bir ayar).
3. Tek bir dosyada ya da tüm toplu işte bir seferde çalıştırın.
4. İş hattını daha sonra yeniden kullanmak için kaydedin.

İş hatları varsayılan olarak 20 adıma izin verir. Sınırı kaldırmak için `MAX_PIPELINE_STEPS=0` ayarlayın.

### Dosya Kitaplığı {#file-library}

İşlediğiniz her dosya **Files** kitaplığınıza kaydedilebilir. SnapOtter, ilk yüklemeden son çıktıya kadar her işleme adımını izleyebilmeniz için tüm sürüm geçmişini tutar.

Kaydetme açıkça yapılır: kitaplığa kaydettiğiniz sonuçlar siz silene kadar saklanır; işleyip kaydetmediğiniz sonuçlar ise 72 saat sonra otomatik olarak temizlenir (`FILE_MAX_AGE_HOURS` ile yapılandırılabilir).

### REST API ve API Anahtarları {#rest-api-api-keys}

Her araca HTTP üzerinden erişilebilir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

API anahtarlarını **Ayarlar → API Anahtarları** altında oluşturun. Tüm uç noktalar için [REST API başvurusuna](/tr/api/rest) bakın veya etkileşimli başvuru için [http://localhost:1349/api/docs](http://localhost:1349/api/docs) adresini ziyaret edin.

### Çok Kullanıcılı ve Ekipler {#multi-user-teams}

Rol tabanlı erişim denetimiyle birden çok kullanıcıyı etkinleştirin:

- **Admin**: tam erişim; kullanıcıları, ekipleri, ayarları ve tüm dosyaları/iş hatlarını/API anahtarlarını yönetir
- **User**: araçları kullanır; kendi dosyalarını/iş hatlarını/API anahtarlarını yönetir

Kullanıcıları gruplamak için **Ayarlar → Ekipler** altında ekipler oluşturun.

`AUTH_ENABLED=true` ayarlayın (oturum açmadan tek kullanıcılı/kişisel kullanım için `false`).

## Telefonunuzdan Kullanın {#use-it-from-your-phone}

SnapOtter mobil tarayıcılarda çalışır ve bir uygulama olarak kurulabilir. Örneğinizi telefonda açın, ardından:

- **iPhone / iPad (Safari):** Paylaş'a dokunun, ardından **Ana Ekrana Ekle**'yi seçin.
- **Android (Chrome):** tarayıcı menüsünü açın ve **Uygulamayı yükle**'ye dokunun.

Kurulan uygulama kendi penceresinde açılır ve doğrudan örneğinize gider.

Bir kısıt var: tarayıcılar kurulum istemini yalnızca HTTPS üzerinden sunar. LAN'ınızdaki düz bir HTTP adresi tarayıcı sekmesinde sorunsuz çalışmaya devam eder; gerçek kurulum için örneği sertifikalı bir ters vekil sunucunun (reverse proxy) arkasına alın ([dağıtım rehberine](/tr/guide/deployment) bakın).

Telefon ve tabletlerde görsel araçlarında yükleme düğmesinin yanında bir **Fotoğraf çek** düğmesi görünür. Bir fiş ya da beyaz tahta fotoğrafı çekin; doğrudan araca düşer.