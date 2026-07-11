---
description: "Varsayılanlarıyla birlikte tüm SnapOtter ortam değişkenleri. Kimlik doğrulama, depolama, AI modelleri, analitik ve daha fazlasını yapılandırın."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: a4cc9d4d0024
---

# Yapılandırma {#configuration}

Tüm yapılandırma ortam değişkenleri aracılığıyla yapılır. Her değişkenin makul bir varsayılanı vardır, dolayısıyla SnapOtter herhangi birini ayarlamadan kutudan çıktığı gibi çalışır.

## Ortam değişkenleri {#environment-variables}

### Sunucu {#server}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `1349` | Sunucunun dinlediği port. |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikada maksimum istek. Hız sınırlamayı devre dışı bırakmak için 0'a ayarlayın. |
| `CORS_ORIGIN` | (boş) | CORS için virgülle ayrılmış izin verilen kökenler veya yalnızca aynı köken için boş. |
| `LOG_LEVEL` | `info` | Günlük ayrıntı düzeyi. Şunlardan biri: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Bir ters proxy'den gelen `X-Forwarded-For` başlıklarına güven. Bir proxy arkasında değilseniz `false` olarak ayarlayın. |

### Kimlik doğrulama {#authentication}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `false` | Oturum açmayı gerektirmek için `true` olarak ayarlayın. Docker imajı `true` olarak varsayılır. |
| `DEFAULT_USERNAME` | `admin` | İlk admin hesabı için kullanıcı adı. Yalnızca ilk çalıştırmada kullanılır. |
| `DEFAULT_PASSWORD` | `admin` | İlk admin hesabı için parola. İlk oturum açmadan sonra bunu değiştirin. |
| `MAX_USERS` | `0` (sınırsız) | Kayıtlı maksimum kullanıcı hesabı sayısı. Sınırsız için 0'a ayarlayın. |
| `SESSION_DURATION_HOURS` | `168` | Oturum açma oturumu ömrü, saat cinsinden (varsayılan 7 gündür). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | İlk oturum açmada zorunlu parola değiştirme istemini atlamak için boş olmayan herhangi bir değere ayarlayın |

### Depolama {#storage}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` veya `s3`. S3/MinIO, s3_storage özelliğine sahip bir lisans gerektirir. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL bağlantı dizesi. |
| `REDIS_URL` | `redis://redis:6379` | Redis bağlantı dizesi (BullMQ iş kuyrukları için kullanılır). |
| `WORKSPACE_PATH` | `./tmp/workspace` | İşleme sırasında geçici dosyalar için dizin. Otomatik olarak temizlenir. |
| `FILES_STORAGE_PATH` | `./data/files` | Kalıcı kullanıcı dosyaları (yüklenen görüntüler, kaydedilen sonuçlar) için dizin. |

### Gömülü mod {#embedded-mode}

İmajı `DATABASE_URL` olmadan ve `REDIS_URL` olmadan çalıştırın; konteyner içinde kendi PostgreSQL 17 ve Redis'ini başlatır, geri döngüye (loopback) bağlanır ve tüm verileri `/data` biriminde tutar. Bu, hızlı başlangıç, homelab ve 1.x'ten yükseltmeler için tek komutlu `docker run` deneyimini geri getirir. Bu bir kolaylık yoludur, bir üretim dağıtımı değildir: üretim için, ayrı PostgreSQL ve Redis ile 3 konteynerli Compose yığınını çalıştırın. Gömülü mod, konteynerin root olarak çalışmasını gerektirir ve rastgele-UID çalışma zamanlarıyla (OpenShift, Kubernetes `runAsNonRoot`) uyumlu değildir; orada Compose kullanın.

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `EMBEDDED` | `auto` | Hem `DATABASE_URL` hem de `REDIS_URL` ayarlanmadığında otomatik olarak etkinleştirilir. Devre dışı bırakmak için `0` olarak ayarlayın (uygulama, sessizce bir konteyner içi veritabanı başlatmak yerine, harici bir `DATABASE_URL`/`REDIS_URL` ayarlanmamışsa hızlı başarısız olur). |
| `REDIS_MAXMEMORY` | `512mb` | Gömülü Redis için bellek üst sınırı (yalnızca gömülü mod). Raspberry Pi gibi bellek kısıtlı ana bilgisayarlarda düşürün. |

1.x'ten yükseltme: eski `snapotter.db` dosyanızı birimde `/data/snapotter.db` konumuna koyun; gömülü mod bunu ilk açılışta gömülü PostgreSQL'e içe aktarır. İçe aktarma bir kez çalışır; sonraki açılışlar bunu atlar.

Telemetri notu: gömülü mod, diğer herhangi bir yapılandırma gibi imajın analitik varsayılanını devralır. Yayınlanan imaj analitik açık olarak gelir; devre dışı bırakmak için `--build-arg SNAPOTTER_ANALYTICS=off` ile derleyin veya uygulama içi admin devre dışı bırakma seçeneğini kullanın.

### İşleme sınırları {#processing-limits}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Yükleme başına maksimum dosya boyutu, megabayt cinsinden. Sınırsız için 0'a ayarlayın. |
| `MAX_BATCH_SIZE` | `100` | Tek bir toplu istekteki maksimum dosya sayısı. Sınırsız için 0'a ayarlayın. |
| `CONCURRENT_JOBS` | `0` (otomatik) | Paralel çalışan toplu iş sayısı. Kullanılabilir CPU çekirdeklerine göre otomatik algılamak için 0'a ayarlayın. |
| `MAX_MEGAPIXELS` | `0` (sınırsız) | Megapiksel cinsinden izin verilen maksimum görüntü çözünürlüğü. Sınırsız için 0'a ayarlayın. |
| `MAX_WORKER_THREADS` | `0` (otomatik) | Görüntü işleme için maksimum işçi iş parçacığı. Kullanılabilir CPU çekirdeklerine göre otomatik algılamak için 0'a ayarlayın. |
| `PROCESSING_TIMEOUT_S` | `0` (sınır yok) | İstek başına maksimum işleme süresi, saniye cinsinden. Zaman aşımı olmaması için 0'a ayarlayın. |
| `MAX_PIPELINE_STEPS` | `20` | Bir işlem hattındaki maksimum adım sayısı. Sınır olmaması için 0'a ayarlayın. |
| `MAX_CANVAS_PIXELS` | `0` (sınır yok) | Çıktı görüntüleri için piksel cinsinden maksimum tuval boyutu. Sınır olmaması için 0'a ayarlayın. |
| `MAX_SVG_SIZE_MB` | `0` (sınırsız) | Megabayt cinsinden maksimum SVG dosya boyutu. Sınırsız için 0'a ayarlayın. |
| `MAX_SPLIT_GRID` | `100` | Görüntü bölme aracı için maksimum ızgara boyutu. |
| `MAX_PDF_PAGES` | `0` (sınırsız) | PDF-to-image dönüşümü için maksimum PDF sayfası sayısı. Sınırsız için 0'a ayarlayın. |

### Temizleme {#cleanup}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Kaydedilmemiş işleme sonuçlarının (ham yüklemeler ve araç çıktıları) otomatik silinmeden önce ne kadar süre tutulacağı. Files kütüphanesine açıkça kaydettiğiniz dosyalar etkilenmez ve siz silene kadar kalıcı olur. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Temizleme işinin ne sıklıkta çalışacağı. |

### Görünüm {#appearance}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `DEFAULT_THEME` | `light` | Yeni oturumlar için varsayılan tema. `light` veya `dark`. |
| `DEFAULT_LOCALE` | `en` | Varsayılan arayüz dili. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Varsayılan araç düzeni. `sidebar` veya `fullscreen`. |

### Docker izinleri {#docker-permissions}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PUID` | `999` | Konteyner işlemini bu UID olarak çalıştır. Bağlama bağlamaları için ana bilgisayar kullanıcınızla eşleşecek şekilde ayarlayın (`id -u`). |
| `PGID` | `999` | Konteyner işlemini bu GID olarak çalıştır. Bağlama bağlamaları için ana bilgisayar grubunuzla eşleşecek şekilde ayarlayın (`id -g`). |

## Docker örneği {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
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
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Birimler {#volumes}

Docker Compose yığını dört birim kullanır:

- `/data` (app) - AI modelleri, Python venv ve kullanıcı dosyaları. Yüklenen dosyaları ve kurulu AI paketlerini yeniden başlatmalar arasında korumak için bunu bağlayın.
- `/tmp/workspace` (app) - İşlenen dosyalar için geçici depolama. Bu geçici olabilir, ancak bağlamak konteynerin yazılabilir katmanının dolmasını önler.
- `SnapOtter-pgdata` (postgres) - PostgreSQL veri dizini. Bu, tüm ilişkisel verileri (kullanıcılar, ayarlar, işlem hatları, işler, denetim günlüğü) tutar. `pg_dump` veya birim anlık görüntüsü aracılığıyla yedekleyin.
- `SnapOtter-redisdata` (redis) - Dayanıklı iş kuyrukları için Redis salt ekleme dosyası.
