---
description: "SnapOtter'ı Docker ile tek komutla kurun. Docker Compose kurulumu, kaynaktan derleme ve tam özellik genel bakışı içerir."
i18n_output_hash: 715756b0b772
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# Başlarken {#getting-started}

::: tip Kurmadan önce deneyin
Tam arayüzü [demo.snapotter.com](https://demo.snapotter.com) adresinde keşfedin - kayıt veya kurulum gerektirmez.
:::

## Hızlı Başlangıç {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Bu tek konteyner ihtiyaç duyduğu her şeyi çalıştırır: `DATABASE_URL` ayarlanmadığında, geri döngü arayüzünde kendi PostgreSQL ve Redis'ini başlatır (gömülü mod) ve tüm verileri `SnapOtter-data` biriminde tutar. SnapOtter'ı denemenin veya bir ev laboratuvarında kendiniz barındırmanın en hızlı yoludur. Üretim için, PostgreSQL ve Redis'i kendi konteynerlerinde tutan aşağıdaki [Docker Compose](#docker-compose) yığınını çalıştırın. Gömülü mod root olarak çalışır (varsayılan) ve `DATABASE_URL` ayarladığınız anda otomatik olarak kapanır.

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

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) gerektirir. CUDA mevcut olmadığında otomatik olarak CPU'ya geri döner. VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırması şu anda AI çıkarımı için desteklenmemektedir. Kıyaslamalar için [Docker Etiketleri](/tr/guide/docker-tags) bölümüne bakın.
:::

::: details GHCR'de de mevcut
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Her iki kayıt defteri de her sürümde aynı imajı yayınlar.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Tüm ortam değişkenleri için [Yapılandırma](/tr/guide/configuration) bölümüne bakın.

## Kaynaktan Derleme {#build-from-source}

**Ön koşullar:** Node.js 22+, pnpm 9+, Docker (Postgres + Redis için), Python 3.10+ (AI özellikleri için), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Ön yüz: [http://localhost:1349](http://localhost:1349)
- Arka uç: [http://localhost:13490](http://localhost:13490)

## Neler Yapabilirsiniz {#what-you-can-do}

### Dosya İşleme (200+ Araç) {#file-processing-200-tools}

| Modalite | Sayı | Örnek Araçlar |
|----------|-------|---------------|
| **Görsel** | 105 | Yeniden Boyutlandır, Kırp, Sıkıştır, Dönüştür, Arka Planı Kaldır, Ölçek Büyüt, OCR, Filigran, Kolaj, Renklendir, GIF Araçları, format ön ayarları |
| **Video** | 57 | Kırp, Kes, Sıkıştır, Dönüştür, Birleştir, Ses Çıkar, Otomatik Altyazılar, Video'dan GIF'e, Yeniden Boyutlandır, Sabitle, format ön ayarları |
| **Ses** | 27 | Kırp, Birleştir, Dönüştür, Normalleştir, Gürültü Azaltma, Transkribe Et, Perde Kaydırma, Kısılma, Zil Sesi Oluşturucu, format ön ayarları |
| **PDF / Belge** | 42 | Birleştir, Böl, Sıkıştır, OCR, Filigran, Sansürle, Word'den PDF'e, Excel'den PDF'e, Döndür, Koru, Onar |
| **Dosyalar** | 10 | CSV'den JSON'a, JSON'dan XML'e, CSV'leri Birleştir, CSV Böl, ZIP Oluştur, ZIP Çıkar, Grafik Oluşturucu, YAML/JSON |

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
