---
description: "SnapOtter'ı tek bir komutla Docker ile kurun. Docker Compose kurulumu, kaynaktan derleme ve eksiksiz bir özellik genel bakışı içerir."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 9ab4a38ae7a6
---

# Başlangıç {#getting-started}

::: tip Kurmadan önce deneyin
Eksiksiz kullanıcı arayüzünü [demo.snapotter.com](https://demo.snapotter.com) adresinde keşfedin - kayıt veya kurulum gerekmez.
:::

## Hızlı Başlangıç {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Bu tek konteyner ihtiyaç duyduğu her şeyi çalıştırır: hiçbir `DATABASE_URL` ayarlanmadığında, loopback arayüzünde kendi PostgreSQL ve Redis'ini başlatır (gömülü mod) ve tüm verileri `SnapOtter-data` biriminde tutar. SnapOtter'ı denemenin veya bir homelab üzerinde kendi kendine barındırmanın en hızlı yoludur. Üretim için, PostgreSQL ve Redis'i kendi konteynerlerinde tutan aşağıdaki [Docker Compose](#docker-compose) yığınını çalıştırın. Gömülü mod root olarak çalışır (varsayılan) ve `DATABASE_URL` ayarladığınız anda otomatik olarak kapanır.

İlk girişte parolanızı değiştirmeniz istenecektir.

::: tip Anonim Ürün Analitiği
SnapOtter, varsayılan olarak anonim ürün analitiği içerir. Kapatmak için **Ayarlar → Sistem → Gizlilik** öğesini açın ve **Anonim Ürün Analitiği**'ni kapatın. Tüm örnek için hemen durur.

Nelerin toplandığına ilişkin ayrıntılar için bkz. [SnapOtter'ın topladıkları](/tr/guide/telemetry).
:::

::: tip NVIDIA CUDA hızlandırması
NVIDIA CUDA hızlandırmalı arka plan kaldırma, büyütme, OCR, yüz iyileştirme ve onarım için `--gpus all` ekleyin:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html) gerektirir. CUDA kullanılamadığında otomatik olarak CPU'ya geri döner. Intel/AMD iGPU hızlandırması, VA-API, Quick Sync veya OpenCL aracılığıyla, bugün AI çıkarımı için desteklenmemektedir. Karşılaştırmalar için bkz. [Docker Etiketleri](/tr/guide/docker-tags).
:::

::: details Ayrıca GHCR üzerinde
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

Tüm ortam değişkenleri için bkz. [Yapılandırma](/tr/guide/configuration).

## Kaynaktan Derleme {#build-from-source}

**Ön koşullar:** Node.js 22+, pnpm 9+, Docker (Postgres + Redis için), Python 3.10+ (AI özellikleri için), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Ön uç: [http://localhost:1349](http://localhost:1349)
- Arka uç: [http://localhost:13490](http://localhost:13490)

## Yapabilecekleriniz {#what-you-can-do}

### Dosya İşleme (241 Araç) {#file-processing-241-tools}

| Modalite | Sayı | Örnek Araçlar |
|----------|-------|---------------|
| **Görüntü** | 105 | Yeniden Boyutlandır, Kırp, Sıkıştır, Dönüştür, Arka Planı Kaldır, Büyüt, OCR, Filigran, Kolaj, Renklendir, GIF Araçları, biçim ön ayarları |
| **Video** | 57 | Kırp, Kes, Sıkıştır, Dönüştür, Birleştir, Ses Çıkar, Otomatik Altyazılar, Video'dan GIF'e, Yeniden Boyutlandır, Sabitle, biçim ön ayarları |
| **Ses** | 27 | Kırp, Birleştir, Dönüştür, Normalleştir, Gürültü Azaltma, Deşifre Et, Perde Kaydırma, Kısılma, Zil Sesi Oluşturucu, biçim ön ayarları |
| **PDF / Belge** | 42 | Birleştir, Böl, Sıkıştır, OCR, Filigran, Karart, Word'den PDF'e, Excel'den PDF'e, Döndür, Koru, Onar |
| **Dosyalar** | 10 | CSV'den JSON'a, JSON'dan XML'e, CSV'leri Birleştir, CSV'yi Böl, ZIP Oluştur, ZIP Ayıkla, Grafik Oluşturucu, YAML/JSON |

### İşlem Hatları {#pipelines}

Araçları çok adımlı iş akışlarına zincirleyin ve bunları tek bir görüntüye veya tüm bir gruba uygulayın:

1. Kenar çubuğunda **İşlem Hatları**'nı açın.
2. Adımlar ekleyin (herhangi bir araç, herhangi bir ayar).
3. Tek bir dosya üzerinde veya bir kerede tüm bir grup üzerinde çalıştırın.
4. İşlem hattını daha sonra yeniden kullanmak üzere kaydedin.

İşlem hatları varsayılan olarak 20 adıma izin verir. Limiti sınırsız yapmak için `MAX_PIPELINE_STEPS=0` ayarlayın.

### Dosya Kitaplığı {#file-library}

İşlediğiniz her dosya **Dosyalar** kitaplığınıza kaydedilebilir. SnapOtter, orijinal yüklemeden nihai çıktıya kadar her işleme adımını izleyebilmeniz için tüm sürüm geçmişini takip eder.

Kaydetme açıktır: kitaplığa kaydettiğiniz sonuçlar siz silene kadar tutulur, işlediğiniz ve kaydetmeden bıraktığınız sonuçlar ise 72 saat sonra otomatik olarak temizlenir (`FILE_MAX_AGE_HOURS` ile yapılandırılabilir).

### REST API ve API Anahtarları {#rest-api-api-keys}

Her araca HTTP aracılığıyla erişilebilir:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

**Ayarlar → API Anahtarları** altında API anahtarları oluşturun. Tüm uç noktalar için [REST API referansına](/tr/api/rest) bakın veya etkileşimli referans için [http://localhost:1349/api/docs](http://localhost:1349/api/docs) adresini ziyaret edin.

### Çok Kullanıcılı ve Ekipler {#multi-user-teams}

Rol tabanlı erişim denetimiyle birden fazla kullanıcıyı etkinleştirin:

- **Yönetici**: tam erişim - kullanıcıları, ekipleri, ayarları, tüm dosyaları/işlem hatlarını/API anahtarlarını yönetin
- **Kullanıcı**: araçları kullanın, kendi dosyalarınızı/işlem hatlarınızı/API anahtarlarınızı yönetin

Kullanıcıları gruplamak için **Ayarlar → Ekipler** altında ekipler oluşturun.

`AUTH_ENABLED=true` ayarlayın (veya giriş yapmadan tek kullanıcı/kendi kendine kullanım için `false`).
