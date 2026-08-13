---
description: "SnapOtter'ı Docker ile tek komutla kurun. Docker Compose kurulumu, kaynaktan derleme ve tam özellik genel bakışı içerir."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: aea71ee46492
i18n_hash_version: 2
---

# Başlarken {#getting-started}

::: tip Kurmadan önce deneyin
Tam arayüzü [demo.snapotter.com](https://demo.snapotter.com) adresinde keşfedin - kayıt veya kurulum gerektirmez.
:::

## Hızlı Başlangıç {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Bu tek konteyner ihtiyaç duyduğu her şeyi çalıştırır: `DATABASE_URL` ayarlanmadan, geridöngü arayüzünde (gömülü mod) kendi PostgreSQL ve Redis'ini başlatır ve tüm verileri `SnapOtter-data` biriminde tutar. SnapOtter'yi denemenin veya bir ev laboratuvarında kendi kendine barındırmanın en hızlı yoludur. Üretim için PostgreSQL ve Redis'i kendi kapsayıcılarında tutan [canonical Docker Compose yığınını](#docker-compose) kullanın. Katıştırılmış mod, kök (varsayılan) olarak çalışır ve `DATABASE_URL`'yi ayarladığınız anda otomatik olarak kapanır.

Bir Raspberry Pi'ye, eski bir dizüstüne veya küçük bir VPS'e mi kuruyorsunuz? Ayarlanmış adım adım kurulum ve kısıtlı donanımdan neler bekleyeceğiniz için [Düşük Kaynaklı Kurulumlar](/tr/guide/low-resource) bölümüne bakın.

İlk oturum açmada parolanızı değiştirmeniz istenecektir.

::: tip Anonim Ürün Analitiği
SnapOtter varsayılan olarak anonim ürün analitiği içerir. Kapatmak için **Settings → System → Privacy** bölümünü açın ve **Anonymous Product Analytics**'i kapatın. Tüm örnek için hemen durur.

Örnek için tüm telemetriyi yeniden derleme olmadan devre dışı bırakmak için `SNAPOTTER_TELEMETRY=0` ortam değişkenini de ayarlayabilirsiniz (`false` ve `off` da işe yarar).

Hata izleme, açık kaynak programı aracılığıyla SnapOtter'a sponsor olan [Sentry](https://sentry.io) tarafından desteklenmektedir.

Nelerin toplandığına ilişkin ayrıntılar için [SnapOtter'ın topladıkları](/tr/guide/telemetry) bölümüne bakın.
:::

::: tip NVIDIA CUDA hızlandırması
NVIDIA CUDA ile hızlandırılmış arka plan kaldırma, ölçeklendirme, yüz geliştirme ve restorasyon için `--gpus all` ekleyin. OCR CPU tabanlı kalır ve GPU erişimi olsun veya olmasın aynı görüntüde çalışır:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) gerektirir. CUDA kullanılamadığında otomatik olarak CPU'ya geri döner. VA-API, Quick Sync veya OpenCL aracılığıyla Intel/AMD iGPU hızlandırma, günümüzde yapay zeka çıkarımı için desteklenmemektedir. Karşılaştırmalar için [Docker Etiketleri](/tr/guide/docker-tags) konusuna bakın. AI araçları `--gpus all`'ye rağmen CPU üzerinde çalışıyorsa, bkz. [GPU hızlandırmasını doğrulama](/tr/guide/deployment#verify-gpu-acceleration).
:::

::: details GHCR'de de mevcut
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Her iki kayıt defteri de her sürümde aynı imajı yayınlar.
:::

## Docker Oluşturma {#docker-compose}

Bu sayfadaki kısaltılmış bir Oluşturma örneğini kopyalamak yerine, her sürümde bakımı yapılan ve test edilen üretim dosyasını kullanın:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Kurallı [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) dört çalışma zamanı biriminin tümünü, durum denetimlerini, kaynak sınırlarını, dayanıklı Redis yapılandırmasını, sabitlenmiş veritabanı/önbellek görüntülerini ve geçerli kapsayıcı güçlendirmeyi içerir. İlk girişten hemen sonra varsayılan yönetici şifresini değiştirin. Tekrarlanabilir bir dağıtım için `latest`'yi takip etmek yerine SnapOtter uygulama görüntüsünü doğruladığınız sürüm etiketine veya özete sabitleyin.

Tüm ortam değişkenleri için [Yapılandırma](/tr/guide/configuration)'ya ve gizli diziler, ağ politikası ve yedekleme kılavuzu için [Güvenlik ve Güçlendirme](/tr/guide/security)'ye bakın.

## Kaynaktan Derleme {#build-from-source}

**Ön koşullar:** Node.js 22.22+, pnpm 9+, Docker (Postgres + Redis için), Python 3.11+ (AI özellikleri için), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Ön yüz: [http://localhost:1351](http://localhost:1351)
- Arka uç: [http://localhost:13490](http://localhost:13490)

## Neler Yapabilirsiniz {#what-you-can-do}

### Dosya İşleme (200+ Araç) {#file-processing-200-tools}

| Modalite | Sayı | Örnek Araçlar |
|----------|-------|---------------|
| **Görsel** | 107 | Yeniden Boyutlandır, Kırp, Sıkıştır, Dönüştür, Arka Planı Kaldır, Ölçek Büyüt, OCR, Filigran, Kolaj, Renklendir, GIF Araçları, format ön ayarları |
| **Video** | 57 | Kırp, Kes, Sıkıştır, Dönüştür, Birleştir, Ses Çıkar, Otomatik Altyazılar, Video'dan GIF'e, Yeniden Boyutlandır, Sabitle, format ön ayarları |
| **Ses** | 27 | Kırp, Birleştir, Dönüştür, Normalleştir, Gürültü Azaltma, Transkribe Et, Perde Kaydırma, Kısılma, Zil Sesi Oluşturucu, format ön ayarları |
| **PDF / Belge** | 29 | Birleştir, Böl, Sıkıştır, OCR, Filigran, Sansürle, Word'den PDF'e, Excel'den PDF'e, Döndür, Koru, Onar |
| **Dosyalar** | 23 | CSV'den JSON'a, JSON'dan XML'e, CSV'leri Birleştir, CSV Böl, ZIP Oluştur, ZIP Çıkar, Grafik Oluşturucu, YAML/JSON |

### Ardışık Düzenler {#pipelines}

Araçları çok adımlı iş akışlarına zincirleyin ve bunları tek bir görsele veya bütün bir gruba uygulayın:

1. Kenar çubuğunda **Pipelines** bölümünü açın.
2. Adımlar ekleyin (herhangi bir araç, herhangi bir ayar).
3. Tek bir dosyada veya bir kerede bütün bir grupta çalıştırın.
4. Daha sonra yeniden kullanmak için ardışık düzeni kaydedin.

Ardışık düzenler varsayılan olarak 20 adıma izin verir. Limiti sınırsız yapmak için `MAX_PIPELINE_STEPS=0` ayarlayın.

### Dosya Kitaplığı {#file-library}

İşlediğiniz her dosya **Files** kitaplığınıza kaydedilebilir. SnapOtter tam sürüm geçmişini izler, böylece orijinal yüklemeden son çıktıya kadar her işleme adımını takip edebilirsiniz.

Kaydetme açıktır: kitaplığa kaydettiğiniz sonuçlar siz silene kadar tutulurken, işleyip kaydetmeden bıraktığınız sonuçlar 72 saat sonra otomatik olarak temizlenir (`FILE_MAX_AGE_HOURS` aracılığıyla yapılandırılabilir).

### REST API ve API Anahtarları {#rest-api-api-keys}

Her araca HTTP üzerinden erişilebilir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Settings → API Keys** altında API anahtarları oluşturun. Tüm uç noktalar için [REST API referansına](/tr/api/rest) bakın veya etkileşimli referans için [http://localhost:1349/api/docs](http://localhost:1349/api/docs) adresini ziyaret edin.

### Çok Kullanıcı ve Ekipler {#multi-user-teams}

Rol tabanlı erişim kontrolü ile birden fazla kullanıcıyı etkinleştirin:

- **Yönetici**: tam erişim - kullanıcıları, ekipleri, ayarları, tüm dosyaları/ardışık düzenleri/API anahtarlarını yönetir
- **Kullanıcı**: araçları kullanır, kendi dosyalarını/ardışık düzenlerini/API anahtarlarını yönetir

Kullanıcıları gruplamak için **Settings → Teams** altında ekipler oluşturun.

`AUTH_ENABLED=true` ayarlayın (veya oturum açma olmadan tek kullanıcı/kendi kullanımı için `false`).

## Telefonunuzdan Kullanın {#use-it-from-your-phone}

SnapOtter mobil tarayıcılarda çalışır ve uygulama olarak yüklenebilir. Örneğinizi telefonda açın, ardından:

- **iPhone / iPad (Safari):** Paylaş'a, ardından **Ana Ekrana Ekle**'ye dokunun.
- **Android (Chrome):** tarayıcı menüsünü açın ve **Uygulamayı yükle**'ye dokunun.

Yüklenen uygulama kendi penceresinde, doğrudan örneğinizde açılır.

Tek bir pürüz var: tarayıcılar yükleme seçeneğini yalnızca HTTPS üzerinden sunar. Yerel ağınızdaki düz bir HTTP adresi tarayıcı sekmesinde sorunsuz çalışmaya devam eder; gerçek yükleme için örneği sertifikalı bir ters proxy arkasına alın (bkz. [dağıtım kılavuzu](/tr/guide/deployment)).

Telefon ve tabletlerde görüntü araçları, yükleme düğmesinin yanında bir **Fotoğraf çek** düğmesi gösterir. Bir fişin veya beyaz tahtanın fotoğrafını çekin, görüntü doğrudan araca gelir.
