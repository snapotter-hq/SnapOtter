---
description: "SnapOtter'ı Docker ile üretime dağıtın. Donanım gereksinimleri, GPU kurulumu ve Nginx, Traefik ve Cloudflare için ters proxy yapılandırmaları."
i18n_output_hash: 4fadf7841bd7
i18n_source_hash: e0d8d5f6fc87
i18n_provenance: human
---

# Dağıtım {#deployment}

SnapOtter, 3 konteynerli bir Docker Compose yığını olarak dağıtılır: SnapOtter uygulama imajı, PostgreSQL 17 ve Redis 8. Uygulama imajı **linux/amd64** (AI hızlandırması için NVIDIA CUDA ile) ve **linux/arm64** (CPU) mimarilerini destekler, bu nedenle Intel/AMD sunucularda, Apple Silicon Mac'lerde ve Raspberry Pi 4/5 gibi ARM cihazlarda yerel olarak çalışır. VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırması şu anda AI çıkarımı için desteklenmemektedir.

GPU kurulumu, Docker Compose örnekleri ve sürüm sabitleme için [Docker İmajı](./docker-tags) sayfasına bakın.


<!-- korean-ocr-contract:start -->
::: info Korece OCR uyumluluğu
Hızlı OCR `auto`, `en`, `de`, `es`, `fr`, `zh` ve `ja` dillerini destekler, ancak Koreceyi (`ko`) desteklemez. Korece için doğru OCR paketi ve `balanced` ya da `best` gerekir. Paket resmi Linux amd64 ve arm64 kapsayıcılarında, OCR’nin CPU’da kaldığı NVIDIA ana bilgisayarları dahil çalışır. Desteklenmeyen sistemler açık bir uyumluluk hatası alır ve sessizce `fast` seçeneğine dönülmez. Korece ile `fast` veya eski `tesseract` diğer adı kuyruk öncesinde `FEATURE_INCOMPATIBLE` ve `fast-korean-unsupported` ile reddedilir.
:::
<!-- korean-ocr-contract:end -->
## Hızlı Başlangıç (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

Uygulama daha sonra `http://localhost:1349` adresinde kullanılabilir olur.

> **Docker Hub hız sınırları mı?** Bunun yerine GitHub Container Registry'den çekmek için `snapotter/snapotter:latest` ifadesini `ghcr.io/snapotter-hq/snapotter:latest` ile değiştirin. Her iki kayıt defteri de her sürümde aynı imajı alır.

## Hızlı Başlangıç (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Desteklenen AI araçlarında NVIDIA CUDA hızlandırma için (arka planı kaldırma, yükseltme, yüz geliştirme):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
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
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
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
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

Günlüklerde CUDA algılamasını kontrol edin:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Donanım Gereksinimleri {#hardware-requirements}

Bu sayılar, NVIDIA RTX 4070'li modern bir amd64 iş istasyonundan Raspberry Pi'ye kadar çeşitli sistemlerde yapılan kıyaslamalardan gelmektedir; her birinde tüm araç kataloğu çalıştırılmış ve gerçek alt sınırı bulmak için Docker kaynak limitleri taranmıştır.

### Hızlı Referans {#quick-reference}

| Seviye | Kullanım Senaryosu | CPU | RAM | GPU | Depolama |
|------|----------|-----|-----|-----|---------|
| Minimum | Görsel, dosya ve hafif PDF araçları; tek kullanıcı; küçük gruplar | 2 çekirdek | 2 GB | Yok | ~7 GB |
| Önerilen | Video, PDF ve CPU üzerinde AI dahil beş modalitenin tamamı; gruplar; birkaç kullanıcı | 4 çekirdek | 4 GB | Yok | ~25 GB |
| Tam | GPU AI dahil her şey hızlı; büyük gruplar; çok kullanıcı | 6-8 çekirdek | 8 GB | NVIDIA 8 GB+ VRAM (12 GB rahat) | ~35 GB |

**Mimari: yalnızca 64-bit** (`linux/amd64` veya `linux/arm64`). SnapOtter, Intel/AMD sunucularda, Apple Silicon Mac'lerde ve **Raspberry Pi 4 ve 5** (4-8 GB) dahil 64-bit ARM kartlarında yerel olarak çalışır. 32-bit ARM (`armv7`/`armhf`) üzerinde **çalışmaz** (bunun için imaj oluşturulmamıştır) ve bellek alt sınırının altında kalan Pi Zero gibi 512 MB sınıfı kartlarda da çalışmaz (aşağıya bakın).

### Minimum (görsel, dosya ve hafif PDF araçları; AI yok) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Kaynak | Gereksinim |
|---|---|
| CPU | 2 çekirdek |
| RAM | 2 GB |
| Disk | ~5,5 GB (imaj) + veri birimi |
| GPU | Gerekli değil |

222 AI olmayan katalog aracının tamamı - görsel (yeniden boyutlandırma, kırpma, dönüştürme, sıkıştırma, ayarlama, filigran), video (kırpma, sessize alma, remux), ses (dönüştürme, normalleştirme, kırpma), PDF (birleştirme, bölme, sıkıştırma, döndürme, koruma), dosya dönüştürmeleri ve özel dönüştürme ön ayarları - mütevazı donanımlarda çalışır. Çoğu işlem büyük bir dosyada bile bir saniyenin çok altında tamamlanır: 2,7 MB'lık bir görsel ~0,05 sn içinde yeniden boyutlandırılır ve ~2 sn içinde WebP'ye yeniden kodlanır.

Bellek alt sınırı gerçektir; Docker kaynak limiti taramasından: **512 MB yığını başlatamaz** (tek bir görsel yeniden boyutlandırması bile sonlandırılır), **1 GB** tek dosya işlemlerini idare eder ancak çok dosyalı bir grup belleği tüketir ve **2 GB / 2 çekirdek**, grupları rahatça idare eden en küçük yapılandırmadır.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Tek CPU yoğun istisna video yeniden kodlamadır.** Akış kopyalama işlemleri (kırpma, sessize alma, konteyner remux) anlıktır, ancak farklı bir codec'e kod dönüştürme CPU'ya bağlıdır. VP9'a (WebM) yeniden kodlanan 1080p / 45 saniyelik bir klip, hızlı modern bir CPU'da kabaca **~40 sn**, Apple Silicon'da ~45 sn, eski bir mobil 4 çekirdekli işlemcide ~80 sn ve eski bir 4 çekirdekli sunucuda **~130 sn** sürer. İş yükünüz video ağırlıklıysa, CPU çekirdeklerine ve saat hızına öncelik verin veya konteynerin `cpus:` limitini yükseltin; birlikte gelen compose, uygulamayı varsayılan olarak 4 çekirdekle sınırlar (GPU compose'da 8).

### Önerilen (CPU üzerinde AI araçları) {#recommended-ai-tools-on-cpu}

| Kaynak | Gereksinim |
|---|---|
| CPU | 4 çekirdek |
| RAM | 4 GB |
| Disk | 3 GB (görüntü) + yaklaşık 20 GB (tüm isteğe bağlı AI paketleri) + çalışma alanı |
| GPU | Gerekli değil (CPU yedeği) |

**Daha büyük AI paketlerini yüklemek ve çalıştırmak, öneriyi 4 GB RAM'ye iten şeydir.** Hiçbir isteğe bağlı paket yüklenmediğinde uygulama 360 MB civarında boşta kalır. Eski Python araçları bir sidecar'yi paylaşırken, doğru OCR, aktif değişmez nesle sabitlenmiş özel, uzun ömürlü bir dispatcher kullanır. Etkinleştirmeden önce yükleyici aday üzerinde bir smoke test çalıştırır. Daha sonra atomik olarak yeni dispatcher'ye geçer ve garbage collection'den önce önceki dispatcher'yi boşaltır. Her resmi doğru OCR yapıtı, en kötü durum release suite'yi 4 GiB cgroup içinde geçmelidir; 4 GB ana bilgisayar önerisi ise Node.js uygulaması, Postgres, Redis, kuyruklar ve eşzamanlı çalışma için boşluk bırakır.

Çoğu AI aracı CPU'da gayet kullanılabilir; birkaçı gerçekten bir GPU ister. Modern bir 4 çekirdekli CPU üzerinde ölçülmüştür:

| AI Aracı | CPU Süresi | CPU'da Kullanılabilir mi? |
|---|---|---|
| Yüz algılama (yüz bulanıklaştırma, akıllı kırpma, kırmızı göz), gürültü giderme | 1 sn'nin altında | Evet |
| OCR, transkripsiyon, altyazılar | 1-3 sn | Evet |
| Renklendirme, yüz iyileştirme | ~10 sn | Evet |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~29 sn | Evet (beklersiniz) |
| AI ölçek büyütme (RealESRGAN) | küçükte ~33 sn; büyük görsellerde dakikalar | Sınırda - GPU şiddetle önerilir |
| Fotoğraf restorasyonu (tam ardışık düzen) | birkaç dakika | Hayır - GPU veya hızlı çok çekirdekli bir CPU gerektirir |

SnapOtter bu model indirmelerini kasıtlı olarak Docker imajına gömmez. AI paketleri yalnızca bir yönetici ilgili aracı etkinleştirdiğinde çekilir, kalıcı `/data/ai` biriminde saklanır ve aynı model yığınına bağımlı her araç tarafından paylaşılır. Bu, son konteyner imajını küçük tutarken, tam bir AI kurulumunun aşağıdaki daha büyük depolama sayılarına ulaşmasına da izin verir.

Bazı araçlar birden fazla paylaşılan pakete bağımlıdır. Örneğin, Pasaport Fotoğrafı hem `background-removal` hem de `face-detection` gerektirir; `background-removal` zaten kuruluysa, Pasaport Fotoğrafı'nı etkinleştirmek yalnızca eksik `face-detection` paketini indirir. Aynı yeniden kullanım tüm AI araçlarında geçerlidir.

İsteğe bağlı AI paketi depolama tahminleri:

| Paket | Disk Boyutu |
|---|---|
| Arka plan kaldırma | 4-5 GB |
| Ölçek büyütme + Yüz iyileştirme + Gürültü giderme | 5-6 GB |
| Yüz algılama | 200-300 MB |
| Nesne silici + Renklendirme | 1-2 GB |
| Doğru OCR (`balanced`/`best`) | ~208-234 MiB indir / ~409-488 MiB kuruldu |
| Fotoğraf restorasyonu | 4-5 GB |
| Transkripsiyon | ~600MB |
| **Tüm paketler** | **~20 GB yüklü** |

Hızlı OCR, Tesseract aracılığıyla görüntüye yerleşiktir, yaklaşık 25 MiB ekler ve isteğe bağlı OCR paketini veya 4 GiB bellek gereksinimini gerektirmez. Doğru paket, resmi Linux amd64 ve arm64 kaplarında mevcuttur ve CPU üzerinde ONNX Runtime'yi çalıştırır. NVIDIA ana bilgisayarları aynı CPU OCR çalışma zamanını kullanır, bu nedenle OCR, CUDA sürümüne veya GPU mimarisine bağlı değildir. Doğru çalışma zamanı en az 4 GiB etkili bellek gerektirir: yapılandırılmış kapsayıcı cgroup sınırı, aksi takdirde ana bilgisayar belleği. SnapOtter, paketi indirmeden önce minimum imzalı uyumluluk altındaki sistemleri reddeder. libc ve Python ABI garanti edilemeyen bare-metal/önceden oluşturulmuş arşivlerde de doğru paket kurulumu reddedilir.

Aynı `DATA_DIR` dizinini paylaşan replikalar aynı CPU mimarisini kullanmalıdır; çok replikalı dağıtımları düğüm benzeşimiyle uyumlu düğümlere sabitleyin. Karma amd64/arm64 replikaları için ayrı veri depolama birimleri ve bağımsız SnapOtter dağıtımları gerekir.

Doğru çalışma zamanı, bir aktif nesli tutar ve etkinleştirmeden sonra indirme önbelleğini temizler. Bu sürüm için, ilk kurulumda arşiv artı hazırlama için geçici olarak yaklaşık 620-720 MiB gerekir ve eski nesil aktif kalırken yükseltme 1,2 GiB civarında zirve yapabilir. Yükleyici, indirmeden veya çıkarmadan önce imzalı dizinden ve mevcut nesillerden tam gereksinimi hesaplar ve veri hacmi çok küçükse erken başarısız olur.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Tam (NVIDIA CUDA üzerinde AI araçları) {#full-ai-tools-on-nvidia-cuda}

| Kaynak | Gereksinim |
|---|---|
| CPU | 6-8 çekirdek (video hazırlığı + eşzamanlılık, GPU AI ile bile CPU üzerinde çalışır) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM'li NVIDIA (12 GB önerilir) |
| Disk | toplam ~35 GB |

Bir NVIDIA GPU (CUDA), ağır AI modellerini önemli ölçüde hızlandırır. Modern bir CPU'ya karşı RTX 4070 üzerinde ölçülmüştür:

| AI Aracı | GPU ile Hızlanma | Notlar |
|---|---|---|
| AI ölçek büyütme (RealESRGAN 2×) | **~47×** | En büyük kazanç - ~33 sn'ye karşı bir saniyenin altında (büyük görsellerde dakikalar) |
| Yüz iyileştirme (CodeFormer) | **~12×** | ~11 sn'ye karşı ~0,9 sn |
| Transkripsiyon (Whisper) | ~4,5× | |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~4× | CPU'da ~29 sn'ye karşı GPU'da ~7 sn |
| Renklendirme | ~1,8× | |
| OCR, yüz algılama, kırmızı göz, gürültü giderme | ~1× | CPU'da zaten hızlı - bir GPU yardımcı olmaz |
| Fotoğraf restorasyonu | yok | GPU'da bile CPU'ya bağlı (%0 GPU kullanımı); burada hızlı bir CPU bir GPU'dan daha önemlidir |

GPU'ya değecek araçlar **ölçek büyütme, yüz iyileştirme, transkripsiyon ve arka plan kaldırma**dır. Yüz algılama, OCR ve kırmızı göz CPU'ya bağlıdır ve zaten hızlıdır, bu nedenle bir GPU hiçbir şey katmaz.

Pik VRAM kullanımı, yüz iyileştirmeli ölçek büyütme sırasında 7,5 GB'a ulaşır. 6 GB'lık bir NVIDIA GPU çoğu AI aracında ayrı ayrı çalışır ancak ölçek büyütmede başarısız olur. 8-12 GB VRAM her şeyi idare eder.

VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırması şu anda AI çıkarımı için desteklenmemektedir. `/dev/dri` öğesini konteynere eşlemek AI GPU hızlandırmasını etkinleştirmez; NVIDIA CUDA mevcut olmadıkça SnapOtter AI araçlarını CPU üzerinde çalıştırır.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Eşzamanlı Kullanıcılar {#concurrent-users}

Varsayılan 4 çekirdekle sınırlı uygulama konteynerine karşı paralel görsel yeniden boyutlandırma istekleri:

| Eşzamanlı İstekler | Ort. Yanıt Süresi | Hatalar |
|---|---|---|
| 1 | 0,4sn | 0 |
| 5 | 1,2sn | 0 |
| 10 | 2,1sn | 0 |

Yanıt süresi, iş parçacığı havuzu doyduğunda hatasız olarak alt-doğrusal bir şekilde bozulur. Uygulama konteynerinin `cpus:` limitini yükseltmek (veya daha fazla çekirdeğe sahip bir ana bilgisayar kullanmak) tavanı yükseltir. Ağır işlerin (video kod dönüştürme, CPU AI) tüm süreleri boyunca bir iş parçacığını tuttuğunu unutmayın, bu nedenle CPU'yu yalnızca istek sayısına göre değil, beklenen eşzamanlı ağır iş sayınıza göre boyutlandırın.

### Desteklenen Görsel Formatları {#supported-image-formats}

SnapOtter, 20+ kamera markasından RAW dosyaları, profesyonel formatlar (PSD, EPS, OpenEXR, HDR), modern codec'ler (JPEG XL, AVIF, HEIC, QOI) ve bilimsel/oyun formatları (FITS, DDS) dahil olmak üzere **55+ giriş formatı** ve **14 çıkış formatı** destekler.

Desteklenen her format, kullanılan kod çözücü ve mevcut kalite kontrolleri hakkında ayrıntılar için [tam format listesine](/tr/guide/supported-formats) bakın.

### Bilinen Sınırlamalar {#known-limitations}

- **İçeriğe duyarlı yeniden boyutlandırma**, caire ikili dosyasındaki bir sınırlama nedeniyle büyük görsellerde (>5 MP) çöker. Daha küçük görsellerle sorunsuz çalışır.
- **HEIF kod çözme** 13-23 saniye sürer. HEIC (Apple'ın çeşidi) 0,3-0,9 saniye ile çok daha hızlıdır.
- **Ölçek büyütme**, küçük görseller dışındaki her şey için CPU'da zaman aşımına uğrar. Pratik kullanım için GPU gereklidir.
- **CodeFormer** yüz iyileştirme, GFPGAN'dan önemli ölçüde daha yavaştır (GPU'da 53sn'ye karşı 2sn). Çoğu kullanım senaryosu için GFPGAN önerilir.

## Birimler {#volumes}

| Bağlama / Birim | Amaç | Gerekli mi? |
|---|---|---|
| `/data` (uygulama) | AI modelleri, Python venv, kullanıcı dosyaları | **Evet** - onsuz dosya kaybı |
| `/tmp/workspace` (uygulama) | Geçici işleme dosyaları (otomatik temizlenir) | Önerilir |
| `SnapOtter-pgdata` (postgres) | PostgreSQL veri dizini (kullanıcılar, ayarlar, ardışık düzenler, işler) | **Evet** - onsuz veri kaybı |
| `SnapOtter-redisdata` (redis) | Dayanıklı iş kuyrukları için Redis salt-ekleme dosyası | Önerilir |

### Bağlama noktaları vs. adlandırılmış birimler {#bind-mounts-vs-named-volumes}

**Adlandırılmış birimler** (önerilir) - Docker izinleri otomatik olarak yönetir:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bağlama noktaları** - İzinleri siz yönetirsiniz. Ana bilgisayar kullanıcınızla eşleşecek şekilde `PUID`/`PGID` ayarlayın:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Depolama izinleri {#storage-permissions}

SnapOtter çalışma zamanında iki konuma yazar: `/data` (kullanıcı dosyaları, günlükler, AI modelleri ve Python venv) ve `/tmp/workspace` (geçici işleme çalışma alanı). Her ikisi de konteynerin çalıştığı kullanıcı tarafından yazılabilir olmalıdır. Herhangi biri değilse, konteyner **başlangıçta hızlıca başarısız olur** ve dizini, çalışan UID/GID'yi ve nasıl düzeltileceğini belirten bir mesaj verir; "sağlıklı" olarak önyükleme yapıp ardından ilk yüklemede şifreli bir hatayla başarısız olmak yerine.

İzinlerin nasıl işlendiği, konteynerin nasıl başlatıldığına bağlıdır:

**Varsayılan (root olarak başlar, `snapotter` kullanıcısına düşer)** - giriş noktası root olarak başlar, bağlanan birimlerin sahipliğini düzeltir, ardından `gosu` aracılığıyla ayrıcalıksız `snapotter` kullanıcısına düşer. Adlandırılmış birimler yapılandırma gerektirmeden çalışır. Bağlama noktaları için, yazdığı dosyaların size ait olması için `PUID`/`PGID` ayarını ana bilgisayar kullanıcınıza ayarlayın (yukarıda).

**Kubernetes / OpenShift (`runAsUser` aracılığıyla root olmayan)** - doğrudan root olmayan bir kullanıcı olarak başlatıldığında, konteyner birimleri kendisi chown yapamaz, bu nedenle orkestratör onları yazılabilir yapmalıdır. `fsGroup` ayarlayın:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

İmajın yazılabilir dizinleri GID 0 tarafından grup sahipliğinde ve grup tarafından yazılabilir, bu nedenle **rastgele bir UID** artı root ek grubu (OpenShift varsayılanı) ile çalışan bir pod, `chown` olmadan yazabilir.

**TrueNAS Scale (ve diğer "yabancı UID" kurulumları)** - TrueNAS, uygulamaları root olmayan bir kullanıcı olarak (genellikle `568:568`) çalıştırır ve farklı bir kullanıcıya ait ana bilgisayar veri kümelerini bağlar, bu nedenle ne giriş noktası ne de `fsGroup` onları kendi başına yazılabilir yapar. Birini seçin:

- **Uygulamayı root olarak çalıştırın** (önerilir) - uygulamanın kullanıcısını ayarlamadan bırakın veya `0` olarak ayarlayın ve varsayılan giriş noktasının izinleri düzeltmesine ve `snapotter` kullanıcısına düşmesine izin verin.
- **UID `999` olarak çalıştırın** - uygulamanın kullanıcısını/grubunu `999:999` (SnapOtter'ın yerleşik `snapotter` kullanıcısı) olarak ayarlayın, böylece imajın sahipliğiyle eşleşir.
- **`chown`** ana bilgisayar veri kümesini konteynerin çalıştığı UID'ye, TrueNAS kabuğundan:

  ```bash
  # Başlangıç hatasındaki UID'yi kullanın (veya konteyner içinde `id` çalıştırın)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Başlangıç hatası kullanılacak tam UID'yi belirtir, bu nedenle en hızlı yol uygulamayı bir kez başlatmak, mesajı okumak, ardından buna göre `chown` (veya kullanıcıyı ayarlamak) yapmaktır.

## Ortam Değişkenleri {#environment-variables}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `true` | Oturum açma gereksinimini etkinleştir/devre dışı bırak |
| `DEFAULT_USERNAME` | `admin` | Başlangıç yönetici kullanıcı adı |
| `DEFAULT_PASSWORD` | `admin` | Başlangıç yönetici parolası (ilk oturum açmada zorunlu değişiklik) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Dosya başına yükleme limiti |
| `MAX_BATCH_SIZE` | `100` | Grup isteği başına maksimum dosya |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikada API isteği (devre dışı bırakmak için 0 ayarlayın) |
| `MAX_USERS` | `0` (sınırsız) | Maksimum kullanıcı hesabı |
| `TRUST_PROXY` | `true` | Ters proxy'den gelen X-Forwarded-For başlıklarına güven |
| `PUID` | `999` | Bu UID olarak çalıştır (bağlama noktası izinleri için) |
| `PGID` | `999` | Bu GID olarak çalıştır (bağlama noktası izinleri için) |
| `LOG_LEVEL` | `info` | Günlük ayrıntı düzeyi: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (otomatik) | Maksimum paralel AI işleme işi |
| `SESSION_DURATION_HOURS` | `168` | Oturum açma oturumu ömrü (7 gün) |
| `CORS_ORIGIN` | (boş) | Virgülle ayrılmış izin verilen kaynaklar veya aynı kaynak için boş |

### Giden proxy ve özel CA {#outbound-proxy-and-private-ca}

Resmi kapsayıcı, Node'un ortam proxy desteğini etkinleştirir. SnapOtter'nin OCR çalışma zamanı deposuna veya diğer HTTPS hizmetlerine kurumsal bir proxy aracılığıyla ulaşması gerekiyorsa, `HTTPS_PROXY`'yi (ve gerektiğinde `HTTP_PROXY`) ayarlayın. `NO_PROXY`'yi, Postgres, Redis ve dahili nesne depolama gibi doğrudan ulaşılması gereken ana bilgisayarların virgülle ayrılmış bir listesine ayarlayın.

Proxy veya dahili hizmet özel bir sertifika yetkilisi tarafından imzalanmışsa CA sertifikasını salt okunur olarak bağlayın ve `NODE_EXTRA_CA_CERTS`'yi ona yönlendirin. Düğüm işlemi başladığında dosyanın mevcut olması gerekir:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Proxy kimlik bilgilerini Compose dosyasının dışında tutun (örneğin, korumalı bir `.env` dosyasında veya gizli dosyada). TLS doğrulamasını devre dışı bırakmayın: İmzalı OCR dizini yayın meta verilerinin kimliğini doğrularken, normal TLS doğrulaması hâlâ taşımayı ve diğer tüm giden istekleri korur.

## Sağlık Kontrolü {#health-check}

Konteyner yerleşik bir sağlık kontrolü içerir:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Ters Proxy {#reverse-proxy}

SnapOtter, hız sınırlaması ve günlüğe kaydetmenin `X-Forwarded-For` başlıklarından gerçek istemci IP'sini kullanması için varsayılan olarak `TRUST_PROXY=true` ayarlar.

### Nginx {#nginx}

```nginx
server {
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Yeni bir Proxy Host ekleyin
2. Domain Name'i alan adınıza ayarlayın
3. Scheme'i `http`, Forward Hostname'i `SnapOtter` (veya konteyner IP'niz), Forward Port'u `1349` olarak ayarlayın
4. WebSocket desteğini etkinleştirin
5. Advanced altında şunları ekleyin: `client_max_body_size 500M;` ve `proxy_buffering off;`

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1`, SSE ilerleme olayları (grup işleme, AI araçları, özellik kurulumları) için gerekli olan yanıt arabelleğe almayı devre dışı bırakır. Uzatılmış zaman aşımları, Caddy'nin bağlantıyı erken kapatmadan büyük dosya yüklemelerinin tamamlanmasına izin verir.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Not: Cloudflare'in ücretsiz planlarda 100 MB yükleme limiti vardır. Eşleştirmek için `MAX_UPLOAD_SIZE_MB=100` ayarlayın.

## CI/CD {#ci-cd}

GitHub deposunda üç iş akışı vardır:

- **ci.yml** - Her push ve PR'de otomatik olarak çalışır. Lint, tip kontrolü, testler, derleme yapar ve Docker imajını doğrular (push yapmadan).
- **release.yml** - `workflow_dispatch` aracılığıyla manuel olarak tetiklenir. Bir sürüm etiketi ve GitHub sürümü oluşturmak için semantic-release çalıştırır, ardından çok mimarili bir Docker imajı (amd64 + arm64) derler ve Docker Hub'a (`snapotter/snapotter`) ve GitHub Container Registry'ye (`ghcr.io/snapotter-hq/snapotter`) push yapar.
- **deploy-docs.yml** - Bu dokümantasyon sitesini derler ve `main` üzerine push yapıldığında Cloudflare Pages'e dağıtır.

Bir sürüm oluşturmak için GitHub arayüzünde **Actions > Release > Run workflow** bölümüne gidin veya şunu çalıştırın:

```bash
gh workflow run release.yml
```

Semantic-release, sürümü commit geçmişinden belirler. `latest` Docker etiketi her zaman en son sürüme işaret eder.

## Analitik {#analytics}

SnapOtter, hataları yakalamaya ve özellikleri iyileştirmeye yardımcı olmak için anonim ürün analitiği (araç kullanım kalıpları, hata raporları) içerir. Varsayılan olarak açıktır. Dosyalarınız, dosya adlarınız ve kişisel verileriniz asla bunun bir parçası değildir. SnapOtter, analitik devre dışıyken normal şekilde çalışır.

### Analitiği devre dışı bırakma {#disabling-analytics}

Çalışma zamanı vazgeçme, tek tıklamalık bir yönetici geçişidir. Settings > System > Privacy bölümünü açın ve Anonymous Product Analytics'i kapatın. Yeniden derleme gerekmeden tüm örnek için hemen durur.

Asla analitik yayamayan bir imaj için, depoyu klonlayarak ve yeniden derleyerek derleme zamanı kesin kapatmayı ayarlayın:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Veya derleme argümanını mevcut `docker-compose.yml` dosyanıza ekleyin:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
