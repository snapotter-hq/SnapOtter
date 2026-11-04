---
description: "SnapOtter'ı Docker ile üretime dağıtın. Donanım gereksinimleri, GPU kurulumu ve Nginx, Traefik ile Cloudflare için ters proxy yapılandırmaları."
i18n_source_hash: 0c8f078ebe75
i18n_provenance: machine
i18n_output_hash: aa3bcbf1132a
i18n_hash_version: 2
---

# Dağıtım {#deployment}

SnapOtter, 3 konteynerli bir Docker Compose yığını olarak dağıtılır: SnapOtter uygulama imajı, PostgreSQL 17 ve Redis 8. Uygulama imajı **linux/amd64** (AI hızlandırması için NVIDIA CUDA ile) ve **linux/arm64** (CPU) mimarilerini destekler; bu nedenle Intel/AMD sunucularda, Apple Silicon Mac'lerde ve Raspberry Pi 4/5 gibi ARM cihazlarda yerel olarak çalışır. VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırması, AI çıkarımı için bugün desteklenmemektedir.

GPU kurulumu, Docker Compose örnekleri ve sürüm sabitleme için [Docker İmajı](./docker-tags) sayfasına bakın.

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
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
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
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

Uygulama bundan sonra `http://localhost:1349` adresinde kullanılabilir.

Yukarıdaki yığın veritabanı sahibi olarak bağlanır. SnapOtter 2.3.0 sürümünden itibaren istekleri yalnızca satır okuyup yazabilen bir rolle sunabilirsiniz; bkz. [En az ayrıcalıklı roller](./database#least-privilege-roles).

> **Docker Hub hız sınırları mı var?** İmajı bunun yerine GitHub Container Registry'den çekmek için `snapotter/snapotter:latest` değerini `ghcr.io/snapotter-hq/snapotter:latest` ile değiştirin. Her sürümde aynı imaj iki kayıt defterine de gönderilir.

## Hızlı Başlangıç (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Desteklenen AI araçlarında (arka plan kaldırma, büyütme, yüz iyileştirme) NVIDIA CUDA hızlandırması için:

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
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
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
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
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

### GPU hızlandırmasını doğrulama {#verify-gpu-acceleration}

Günlüklerde CUDA algılamasını kontrol edin:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

`--gpus all` ve NVIDIA Container Toolkit doğru kurulmuş olmasına rağmen AI araçları CPU üzerinde çalışıyorsa, etkilenen paketi (örneğin Arka Plan Kaldırma) **Settings → AI Features** bölümünden yeniden kurun. Kurucu, ONNX Runtime'ın GPU sürümünü geri yükler; başka bir paketin (örneğin transkripsiyon) getirdiği yalnızca CPU'ya yönelik sürüm, paylaşılan AI ortamında bunu gölgeleyebilir. Eski bir imajda arayüzden yeniden kurulum GPU'yu geri getirmezse [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) içindeki elle onarım adımlarına bakın.

## Donanım Gereksinimleri {#hardware-requirements}

Bu sayılar, NVIDIA RTX 4070'li modern bir amd64 iş istasyonundan bir Raspberry Pi'ye kadar çeşitli sistemlerde yapılan kıyaslamalardan gelir: her sistemde araç kataloğunun tamamı çalıştırıldı ve gerçek alt sınırı bulmak için Docker kaynak sınırları taranarak denendi.

Bu katmanların küçük ucunda (bir Pi, eski bir dizüstü bilgisayar, 2 GB'lık bir VPS) mi çalışıyorsunuz? [Düşük Kaynaklı Kurulumlar](/tr/guide/low-resource) bu sayıları ayarlanmış sınırlarla somut bir adım adım anlatıma dönüştürür.

### Hızlı Başvuru {#quick-reference}

| Katman | Kullanım Senaryosu | CPU | RAM | GPU | Depolama |
|------|----------|-----|-----|-----|---------|
| Minimum | AI olmayan araçlar (görüntü, dosyalar, hafif PDF) ile yerleşik Hızlı OCR ve yüz algılama; tek kullanıcı; küçük toplu işler | 2 çekirdek | 2 GB | Yok | ~7 GB |
| Önerilen | Video, PDF ve CPU üzerinde standart AI paketleri dahil beş modalitenin tümü; toplu işler; birkaç kullanıcı | 4 çekirdek | 4 GB (HQ inpainting için 8 GB) | Yok | ~25 GB |
| Tam | GPU AI dahil her şey hızlı; büyük toplu işler; çok sayıda kullanıcı | 6-8 çekirdek | 8 GB | NVIDIA 8 GB+ VRAM (12 GB rahat) | ~35 GB |

**Mimari: yalnızca 64 bit** (`linux/amd64` veya `linux/arm64`). SnapOtter; Intel/AMD sunucularda, Apple Silicon Mac'lerde ve **Raspberry Pi 4 ve 5** (4-8 GB) dahil 64 bit ARM kartlarda yerel olarak çalışır. 32 bit ARM'da (`armv7`/`armhf`) çalışmaz, bunun için imaj üretilmez; Pi Zero gibi bellek alt sınırının altında kalan 512 MB sınıfı kartlarda da çalışmaz (aşağıya bakın).

### Minimum (görüntü, dosya ve hafif PDF araçları; AI yok) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Kaynak | Gereksinim |
|---|---|
| CPU | 2 çekirdek |
| RAM | 2 GB |
| Disk | ~5,5 GB (imaj) + veri birimi |
| GPU | Gerekli değil |

AI olmayan 222 katalog aracının tümü (görüntü: yeniden boyutlandırma, kırpma, dönüştürme, sıkıştırma, ayarlama, filigran; video: kesme, sessize alma, remux; ses: dönüştürme, normalleştirme, kesme; PDF: birleştirme, bölme, sıkıştırma, döndürme, koruma; dosya dönüştürmeleri ve özel dönüştürme ön ayarları) mütevazı donanımda çalışır. Çoğu işlem büyük bir dosyada bile bir saniyenin çok altında biter: 2,7 MB'lık bir görüntü ~0,05 sn'de yeniden boyutlandırılır ve ~2 sn'de WebP olarak yeniden kodlanır.

Bellek alt sınırı gerçektir ve Docker kaynak sınırı taramasından gelir: **512 MB yığını başlatamaz** (tek bir görüntü yeniden boyutlandırma bile sonlandırılır), **1 GB** tek dosyalı işlemleri karşılar ancak çok dosyalı bir toplu iş belleği tüketir, **2 GB / 2 çekirdek** ise AI olmayan toplu işleri rahatça karşılayan en küçük yapılandırmadır. Yerleşik Hızlı OCR ve `face-detection` paketi de 2 GB içine sığar; daha büyük AI paketleri (Whisper, LaMa/DDColor, rembg, RealESRGAN, fotoğraf restorasyonu ve SD1.5 HQ inpainting) ise 4 ila 8 GB RAM gerektirir ve boş bellek paketin kendi alt sınırının altındaysa baştan reddedilir.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU'yu en çok yoran tek istisna video yeniden kodlamadır.** Akış kopyalama işlemleri (kesme, sessize alma, kapsayıcı remux) anlıktır, ancak farklı bir kodeğe dönüştürme CPU'ya bağlıdır. VP9'a (WebM) yeniden kodlanan 1080p / 45 saniyelik bir klip, hızlı bir modern CPU'da kabaca **~40 sn**, Apple Silicon'da ~45 sn, eski bir mobil 4 çekirdekte ~80 sn ve eski bir 4 çekirdekli sunucuda **~130 sn** sürer. İş yükünüz ağırlıklı olarak video ise CPU çekirdeklerine ve saat hızına öncelik verin ya da konteynerin `cpus:` sınırını yükseltin: birlikte gelen compose uygulamayı varsayılan olarak 4 çekirdekle sınırlar (GPU compose'da 8).

### Önerilen (CPU üzerinde AI araçları) {#recommended-ai-tools-on-cpu}

| Kaynak | Gereksinim |
|---|---|
| CPU | 4 çekirdek |
| RAM | 4 GB |
| Disk | 3 GB (imaj) + yaklaşık 20 GB (tüm isteğe bağlı AI paketleri) + çalışma alanı |
| GPU | Gerekli değil (CPU'ya geri dönüş) |

**Önerinin 4 GB RAM'e çıkmasının nedeni, daha büyük AI paketlerinin kurulması ve çalıştırılmasıdır.** İsteğe bağlı paket kurulu değilken uygulama yaklaşık 360 MB ile boşta çalışır. Eski Python araçları bir sidecar'ı paylaşır; doğru OCR ise etkin değişmez nesle sabitlenmiş, uzun ömürlü ve özel bir dağıtıcı kullanır. Etkinleştirmeden önce kurucu, adayın üzerinde bir duman testi çalıştırır. Ardından atomik olarak yeni dağıtıcıya geçer ve çöp toplamadan önce önceki dağıtıcıyı boşaltır. Her resmi doğru OCR yapıtı, en kötü durum sürüm paketini 4 GiB'lık bir cgroup içinde geçmelidir; 4 GB ana makine önerisi ise Node.js uygulaması, Postgres, Redis, kuyruklar ve eşzamanlı işler için pay bırakır.

Çoğu AI aracı CPU üzerinde gayet kullanılabilir; birkaçı ise gerçekten GPU ister. Modern bir 4 çekirdekli CPU'da ölçülenler:

| AI Aracı | CPU Süresi | CPU'da kullanılabilir mi? |
|---|---|---|
| Yüz algılama (blur-faces, smart-crop, red-eye), noise-removal | 1 sn'nin altında | Evet |
| OCR, transkripsiyon, altyazılar | 1-3 sn | Evet |
| Renklendirme, yüz iyileştirme | ~10 sn | Evet |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~29 sn | Evet (beklemeniz gerekir) |
| AI büyütme (RealESRGAN) | küçük görüntüde ~33 sn; büyük görüntülerde dakikalar | Sınırda, GPU şiddetle önerilir |
| Fotoğraf restorasyonu (tam hat) | birkaç dakika | Hayır, GPU veya hızlı bir çok çekirdekli CPU gerekir |

SnapOtter bu model indirmelerini Docker imajına bilerek gömmez. AI paketleri yalnızca bir yönetici ilgili aracı etkinleştirdiğinde çekilir, kalıcı `/data/ai` biriminde saklanır ve aynı model yığınına bağlı her araç tarafından paylaşılır. Bu, son konteyner imajını küçük tutarken tam bir AI kurulumunun aşağıdaki daha yüksek depolama sayılarına ulaşmasına yine de izin verir.

Bazı araçlar birden fazla paylaşılan pakete bağlıdır. Örneğin Passport Photo hem `background-removal` hem de `face-detection` paketini gerektirir; `background-removal` zaten kuruluysa Passport Photo'yu etkinleştirmek yalnızca eksik `face-detection` paketini indirir. Aynı yeniden kullanım tüm AI araçlarında geçerlidir.

İsteğe bağlı AI paketi depolaması ve CPU bellek alt sınırları (SnapOtter, işi Python sidecar'a göndermeden önce kullanılabilir belleği denetler ve paketin boş bellek alt sınırının altındaki çalıştırmaları hemen reddeder):

| Paket | Disk Boyutu | CPU Bellek Alt Sınırı |
|---|---|---|
| Yüz algılama | 200-300 MB | 2 GB ana makine RAM'i (~0,5 GB boş) |
| Transkripsiyon | ~600 MB | 4 GB ana makine RAM'i (~2 GB boş) |
| Nesne silgisi + Renklendirme | 1-2 GB | 4 GB ana makine RAM'i (~2 GB boş) |
| Doğru OCR (`balanced`/`best`) | ~208-234 MiB indirme / ~409-488 MiB kurulu | 4 GiB yapılandırılmış etkin bellek (`fast` 2 GB'ta çalışır) |
| Arka plan kaldırma | 4-5 GB | 4 GB ana makine RAM'i (~2,5 GB boş) |
| Büyütme + Yüz iyileştirme + Gürültü giderme | 5-6 GB | 4 GB ana makine RAM'i (~2,5 GB boş) |
| Fotoğraf restorasyonu | 4-5 GB | 4 GB ana makine RAM'i (~3 GB boş) |
| Yüksek Kaliteli Inpainting (`inpaint-hq`) | 5-7 GB | 8 GB ana makine RAM'i (~6 GB boş) |
| **Tüm paketler** | **~25 GB kurulu** | **4 GB (`inpaint-hq` ile 8 GB)** |

Hızlı OCR, Tesseract aracılığıyla imaja yerleşiktir, yaklaşık 25 MiB ekler ve isteğe bağlı OCR paketini ya da onun 4 GiB bellek gereksinimini gerektirmez. Hızlı OCR `auto`, `en`, `de`, `es`, `fr`, `zh` ve `ja` dillerini destekler; Korece (`ko`) ve Arapçayı (`ar`) desteklemez. Her ikisi de `balanced` veya `best` kullanır, dolayısıyla doğru paketi gerektirir. Doğru paket resmi Linux amd64 ve arm64 konteynerlerinde bulunur ve ONNX Runtime'ı CPU üzerinde çalıştırır. NVIDIA ana makineleri de aynı CPU OCR çalışma zamanını kullanır, bu nedenle OCR, CUDA sürümüne ya da GPU mimarisine bağlı değildir. Doğru çalışma zamanı en az 4 GiB etkin bellek gerektirir: yapılandırılmış konteyner cgroup sınırı, o yoksa ana makine belleği. SnapOtter, imzalı uyumluluk alt sınırının altındaki sistemleri paketi indirmeden önce reddeder. Doğru paket kurulumu, libc ve Python ABI'sinin garanti edilemediği bare-metal/hazır arşivlerde de reddedilir. Bu desteklenmeyen ana makinelerde Korece ve Arapça OCR açık bir uyumsuzluk hatası döndürür ve sessizce Hızlı OCR'a geri dönmez. Korece için açıkça istenen bir Hızlı OCR isteği, iş kuyruğa alınmadan önce `fast-korean-unsupported` nedeniyle `FEATURE_INCOMPATIBLE` döndürür.

Aynı `DATA_DIR` birimini paylaşan kopyalar aynı CPU mimarisini kullanmalıdır; çok kopyalı dağıtımları düğüm benzeşimiyle sabitleyin. Karışık amd64/arm64 kopyaları ayrı veri birimleri ve bağımsız SnapOtter dağıtımları gerektirir.

Doğru çalışma zamanı tek bir etkin nesil tutar ve etkinleştirmeden sonra indirme önbelleğini temizler. Bu sürüm için ilk kurulum, arşiv ve hazırlama alanı için geçici olarak kabaca 620-720 MiB gerektirir; eski nesil etkin kalırken bir yükseltme 1,2 GiB'a yakın zirve yapabilir. Kurucu, tam gereksinimi imzalı dizinden ve mevcut nesillerden indirme veya çıkarma öncesinde hesaplar; veri birimi çok küçükse erkenden başarısız olur.

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
| CPU | 6-8 çekirdek (video hazırlığı ve eşzamanlılık, GPU AI ile bile CPU'da çalışır) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM'li NVIDIA (12 GB önerilir) |
| Disk | toplam ~35 GB |

Bir NVIDIA GPU (CUDA), ağır AI modellerini çarpıcı biçimde hızlandırır. RTX 4070'in modern bir CPU'ya karşı ölçümü:

| AI Aracı | GPU ile Hızlanma | Notlar |
|---|---|---|
| AI büyütme (RealESRGAN 2×) | **~47×** | En büyük kazanç: bir saniyenin altı, CPU'da ~33 sn (büyük görüntülerde dakikalar) |
| Yüz iyileştirme (CodeFormer) | **~12×** | ~0,9 sn, CPU'da ~11 sn |
| Transkripsiyon (Whisper) | ~4,5× | |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~4× | GPU'da ~7 sn, CPU'da ~29 sn |
| Renklendirme | ~1,8× | |
| OCR, yüz algılama, red-eye, noise-removal | ~1× | CPU'da zaten hızlı, GPU yardımcı olmaz |
| Fotoğraf restorasyonu | yok | GPU'da bile CPU'ya bağlıdır (%0 GPU kullanımı); burada GPU'dan çok hızlı bir CPU önemlidir |

GPU'ya değer araçlar **büyütme, yüz iyileştirme, transkripsiyon ve arka plan kaldırmadır**. Yüz algılama, OCR ve red-eye CPU'ya bağlıdır ve zaten hızlıdır, bu yüzden GPU bir şey katmaz.

Yüz iyileştirmeli büyütme sırasında en yüksek VRAM kullanımı 7,5 GB'a ulaşır. 6 GB'lık bir NVIDIA GPU çoğu AI aracında tek tek çalışır ancak büyütmede başarısız olur. 8-12 GB VRAM her şeyi karşılar.

VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırması, AI çıkarımı için bugün desteklenmemektedir. `/dev/dri` cihazını konteynere eşlemek AI GPU hızlandırmasını etkinleştirmez; NVIDIA CUDA yoksa SnapOtter AI araçlarını CPU üzerinde çalıştırır.

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

Varsayılan 4 çekirdek sınırlı uygulama konteynerine karşı paralel görüntü yeniden boyutlandırma istekleri:

| Eşzamanlı İstek | Ort. Yanıt Süresi | Hata |
|---|---|---|
| 1 | 0,4 sn | 0 |
| 5 | 1,2 sn | 0 |
| 10 | 2,1 sn | 0 |

Çalışan havuzu doyuma ulaştıkça yanıt süresi doğrusalın altında artar ve hata oluşmaz. Uygulama konteynerinin `cpus:` sınırını yükseltmek (veya daha fazla çekirdekli bir ana makine kullanmak) tavanı yükseltir. Ağır işlerin (video dönüştürme, CPU üzerinde AI) tüm süre boyunca bir çalışanı tuttuğunu unutmayın; bu nedenle CPU'yu yalnızca istek sayısına göre değil, beklenen eşzamanlı ağır iş sayısına göre boyutlandırın.

### Desteklenen Görüntü Biçimleri {#supported-image-formats}

SnapOtter, 20'den fazla kamera markasının RAW dosyaları, profesyonel biçimler (PSD, EPS, OpenEXR, HDR), modern kodekler (JPEG XL, AVIF, HEIC, QOI) ve bilimsel/oyun biçimleri (FITS, DDS) dahil **55+ girdi biçimini** ve **14 çıktı biçimini** destekler.

Desteklenen her biçim, kullanılan çözücü ve mevcut kalite denetimleri hakkında ayrıntılar için [tam biçim listesine](/tr/guide/supported-formats) bakın.

### Bilinen Sınırlamalar {#known-limitations}

- **İçeriğe duyarlı yeniden boyutlandırma**, caire ikili dosyasındaki bir sınırlama nedeniyle büyük görüntülerde (>5 MP) çöker. Daha küçük görüntülerde sorunsuz çalışır.
- **HEIF çözme** 13-23 saniye sürer. HEIC (Apple'ın varyantı) 0,3-0,9 saniye ile çok daha hızlıdır.
- **Büyütme**, küçük görüntülerin ötesinde her şeyde CPU'da zaman aşımına uğrar. Pratik kullanım için GPU gerekir.
- **CodeFormer** yüz iyileştirmesi GFPGAN'dan belirgin biçimde yavaştır (GPU'da 53 sn'ye karşı 2 sn). Çoğu kullanım için GFPGAN önerilir.

## Birimler {#volumes}

| Bağlama / Birim | Amaç | Gerekli mi? |
|---|---|---|
| `/data` (uygulama) | AI modelleri, Python venv, kullanıcı dosyaları | **Evet** - onsuz dosya kaybı olur |
| `/tmp/workspace` (uygulama) | Geçici işleme dosyaları (otomatik temizlenir) | Önerilir |
| `SnapOtter-pgdata` (postgres) | PostgreSQL veri dizini (kullanıcılar, ayarlar, işlem hatları, işler) | **Evet** - onsuz veri kaybı olur |
| `SnapOtter-redisdata` (redis) | Dayanıklı iş kuyrukları için Redis yalnızca-ekleme dosyası | Önerilir |

### Bind mount'lar ve adlandırılmış birimler {#bind-mounts-vs-named-volumes}

**Adlandırılmış birimler** (önerilir): Docker izinleri otomatik yönetir:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount'lar**: İzinleri siz yönetirsiniz. `PUID`/`PGID` değerlerini ana makine kullanıcınızla eşleşecek şekilde ayarlayın:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Depolama izinleri {#storage-permissions}

SnapOtter çalışma zamanında iki konuma yazar: `/data` (kullanıcı dosyaları, günlükler, AI modelleri ve Python venv) ve `/tmp/workspace` (geçici işleme alanı). Her ikisi de konteynerin çalıştığı kullanıcı tarafından yazılabilir olmalıdır. Biri değilse konteyner, "sağlıklı" görünerek açılıp ilk yüklemede anlaşılmaz bir hatayla başarısız olmak yerine **başlangıçta hızla başarısız olur** ve dizini, çalışan UID/GID'yi ve nasıl düzeltileceğini belirten bir mesaj verir. Dosyalar S3'te tutulsa bile günlükler yerel kaldığından günlük dizini (`LOG_DIR`, imajda `/data/logs`) her depolama modunda aynı şekilde denetlenir.

İzinlerin nasıl işleneceği konteynerin nasıl başlatıldığına bağlıdır:

**Varsayılan (root olarak başlar, `snapotter` kullanıcısına düşer)**: giriş noktası root olarak başlar, bağlanan birimlerin sahipliğini düzeltir, ardından `gosu` ile ayrıcalıksız `snapotter` kullanıcısına düşer. Adlandırılmış birimler hiçbir yapılandırma olmadan çalışır. Bind mount'larda, yazdığı dosyaların size ait olması için `PUID`/`PGID` değerlerini ana makine kullanıcınıza ayarlayın (yukarıya bakın).

**Kubernetes / OpenShift (`runAsUser` ile root olmayan)**: doğrudan root olmayan bir kullanıcıyla başlatılan konteyner birimlerin sahipliğini kendisi değiştiremez; bu yüzden orkestratör onları yazılabilir yapmalıdır. `fsGroup` değerini ayarlayın:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

İmajın yazılabilir dizinleri GID 0 grubuna aittir ve grup tarafından yazılabilir; dolayısıyla **rastgele bir UID** ile root ek grubuyla (OpenShift varsayılanı) çalışan bir pod, `chown` olmadan yazabilir.

**TrueNAS Scale (ve diğer "yabancı UID" kurulumları)**: TrueNAS uygulamaları root olmayan bir kullanıcıyla (çoğunlukla `568:568`) çalıştırır ve farklı bir kullanıcıya ait ana makine veri kümelerini bağlar; bu nedenle ne giriş noktası ne de `fsGroup` onları tek başına yazılabilir yapar. Birini seçin:

- **Uygulamayı root olarak çalıştırın** (önerilir): uygulamanın kullanıcısını boş bırakın veya `0` yapın; varsayılan giriş noktası izinleri düzeltip `snapotter` kullanıcısına düşsün.
- **UID `999` olarak çalıştırın**: imajın sahipliğiyle eşleşmesi için uygulamanın kullanıcı/grubunu `999:999` (SnapOtter'ın yerleşik `snapotter` kullanıcısı) yapın.
- Ana makine veri kümesinin sahipliğini, konteynerin çalıştığı UID'ye **`chown`** ile devredin; TrueNAS kabuğundan:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Başlangıç hatası kullanılacak UID'yi tam olarak belirtir; bu yüzden en hızlı yol, uygulamayı bir kez başlatmak, mesajı okumak ve ardından `chown` komutunu (veya kullanıcıyı) buna göre ayarlamaktır.

## Ortam Değişkenleri {#environment-variables}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `true` | Oturum açma zorunluluğunu etkinleştirir/devre dışı bırakır |
| `DEFAULT_USERNAME` | `admin` | İlk yönetici kullanıcı adı |
| `DEFAULT_PASSWORD` | `admin` | İlk yönetici parolası (ilk oturum açmada değiştirilmesi zorunlu) |
| `MAX_UPLOAD_SIZE_MB` | `0` (sınırsız) | MB cinsinden dosya başına yükleme sınırı. İmaj `0` ile gelir; kaynaktan derlemede 100 ile başlar |
| `MAX_BATCH_SIZE` | `0` (sınırsız) | Toplu istek başına en fazla dosya sayısı. İmaj `0` ile gelir; kaynaktan derlemede 100 ile başlar |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikadaki API istekleri (devre dışı bırakmak için 0 yapın) |
| `MAX_USERS` | `0` (sınırsız) | En fazla kullanıcı hesabı sayısı |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Hangi eşlerin istemci IP'sini `X-Forwarded-For` üzerinden ayarlayabileceği. Varsayılan olarak yalnızca özel ağlar |
| `PUID` | `999` | Bu UID olarak çalıştır (bind mount izinleri için) |
| `PGID` | `999` | Bu GID olarak çalıştır (bind mount izinleri için) |
| `LOG_LEVEL` | `info` | Günlük ayrıntı düzeyi: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (otomatik) | En fazla paralel AI işleme işi |
| `SESSION_DURATION_HOURS` | `168` | Oturum açma oturumu ömrü (7 gün) |
| `CORS_ORIGIN` | (boş) | Virgülle ayrılmış izin verilen kaynaklar; aynı kaynak için boş bırakın |

### Giden proxy ve özel CA {#outbound-proxy-and-private-ca}

Resmi konteyner, Node'un ortam proxy desteğini etkinleştirir. SnapOtter'ın OCR çalışma zamanı deposuna veya diğer HTTPS hizmetlerine bir kurumsal proxy üzerinden ulaşması gerekiyorsa `HTTPS_PROXY` değerini (gerekirse `HTTP_PROXY` ile birlikte) ayarlayın. `NO_PROXY` değerini, Postgres, Redis ve dahili nesne depolama gibi doğrudan ulaşılması gereken ana makinelerin virgülle ayrılmış listesine ayarlayın.

Proxy veya dahili bir hizmet özel bir sertifika yetkilisi tarafından imzalanmışsa CA sertifikasını salt okunur bağlayın ve `NODE_EXTRA_CA_CERTS` değerini ona yöneltin. Dosya, Node süreci başladığında mevcut olmalıdır:

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

Proxy kimlik bilgilerini Compose dosyasının dışında tutun (örneğin korumalı bir `.env` dosyasında veya secret içinde). TLS doğrulamasını devre dışı bırakmayın: imzalı OCR dizini sürüm üst verilerinin kimliğini doğrular, normal TLS doğrulaması ise aktarımı ve diğer tüm giden istekleri korumaya devam eder.

## Sağlık Denetimi {#health-check}

Konteyner yerleşik bir sağlık denetimi içerir:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Ters Proxy {#reverse-proxy}

`TRUST_PROXY` varsayılan olarak `loopback,linklocal,uniquelocal` değerindedir; bu yüzden SnapOtter `X-Forwarded-For` başlığına yalnızca özel bir ağdaki bir eşten geldiğinde güvenir. Aynı ana makinedeki, bir Docker ağındaki veya LAN'ınızdaki bir ters proxy kutudan çıktığı gibi güvenilirdir; yani hız sınırlama, oturum açma kaba kuvvet sınırlayıcısı, denetim günlüğü ve kurumsal IP izin listesi, hiçbir yapılandırma olmadan gerçek istemci IP'sini görür.

`TRUST_PROXY=true` değerini yalnızca öndeki proxy SnapOtter'a **genel** bir adresten ulaştığında ayarlayın; örneğin farklı bir ağdaki bulut yük dengeleyici. Doğrudan internete açık bir örnekte bu değer `request.ip` başlığını saldırganın denetimine verir, çünkü başlığı sürekli değiştiren bir çağıran her istekte yeni bir hız sınırı kovası elde eder.

İstemci IP'lerini ölçmeye girişmeden önce bilmeniz gereken iki şey var. macOS ve Windows'ta Docker Desktop, yayımlanan bir portu kullanıcı alanı proxy'si üzerinden sunar ve bu proxy her kaynak adresi VM ağ geçidi olan `192.168.65.1` adresine yeniden yazar; dolayısıyla `TRUST_PROXY` için hiçbir değer orada gerçek istemciyi geri getirmez. İnternete açık her şeyi Linux'ta dağıtın. Ayrıca her platformda, yayımlanan bir porta `localhost` üzerinden ulaşmak istemciniz olarak değil köprü ağ geçidi olarak gözlenir; bu yüzden bir localhost testi, gerçek bir istemcinin nasıl atfedildiği hakkında hiçbir şey söylemez. `TRUST_PROXY` değerlerinin tam tablosu ve Docker Desktop uyarısı [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy) içindedir.

Aşağıdaki her proxy için iki şey önemlidir: büyük istek gövdelerine (yüklemeler) izin verin ve yanıtları arabelleğe almayın. Yanıtları arabelleğe alan bir proxy SSE ilerlemesini bozar ve daha belirgin biçimde, proxy tüm dosyayı iletmeden önce kendisinde tuttuğu için büyük bir dosya indirmesinin "başlayıp hiç bitmemesine" yol açar. SnapOtter indirmelerde `X-Accel-Buffering: no` gönderir; böylece başka yerlerde arabelleğe alma açık kalsa bile nginx bunları akışla iletir. Ancak nginx dışındaki proxy'lerde yanıt arabelleğe almanın açıkça kapatılması gerekir (her yapılandırmada gösterilmiştir). Bir indirme yarıda takılırsa ilk bakılacak yer öndeki arabelleğe alan proxy'dir.

HSTS hakkında bir not: API her yanıtta `Strict-Transport-Security` başlığını kendisi gönderir; bu yüzden yanıt başlıklarını geçiren bir proxy (aşağıdaki tüm yapılandırmalar geçirir) kendi HSTS ayarına ihtiyaç duymaz. Başlığı korumanız veya uçta yeniden eklemeniz yalnızca proxy'niz üst akış yanıt başlıklarını kaldıracak veya geçersiz kılacak şekilde yapılandırılmışsa gerekir.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
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

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Alt yol altında dağıtım {#subpath}

`https://example.com/snapotter` adresinden sunmak için SnapOtter konteyner ortamında `BASE_PATH=/snapotter` değerini ayarlayın ve konteyneri yeniden başlatın. Resmi CPU ve GPU Compose dosyaları `BASE_PATH` değerini kabuğunuzdan veya Compose `.env` dosyanızdan da kabul eder. Aynı imaj her yolda çalışır; ön yüzün yeniden derlenmesi gerekmez.

`BASE_PATH`; harf, rakam, `_` veya `-` içeren, eğik çizgiyle ayrılmış bölümleri kabul eder; `/apps/snapotter` gibi iç içe yollar da dahildir. Sondaki eğik çizgi isteğe bağlıdır. Kök dağıtım için boş bırakın (varsayılan) veya `/` yapın.

Mevcut Nginx HTTPS sunucu bloğunuzda şunu kullanın:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Bu örnek ön eki korur. İletmeden önce `/snapotter` ön ekini kaldıran proxy'ler de desteklenir. Dahili sağlık denetimleri `/api/v1/health` adresini kullanmaya devam edebilir. OIDC veya SAML için ayrıca `EXTERNAL_URL=https://example.com/snapotter` değerini ayarlayın ve kimlik sağlayıcının geri çağırma URL'lerini sırasıyla `/snapotter/api/auth/oidc/callback` veya `/snapotter/api/auth/saml/callback` içerecek şekilde güncelleyin.

API betikleri değişmeden çalışmaya devam eder: API yanıtlarındaki URL'ler, örneğin bir aracın `downloadUrl` değeri, `BASE_PATH` ne olursa olsun `/api/` ile başlar. Bunları alan adı köküne göre çözümlemek yerine örneğinizin temel URL'sine ekleyin (`https://example.com/snapotter` + `/api/v1/download/...`).

Arayüzü ön ekli URL üzerinden açın (`https://example.com/snapotter`). Ön eksiz gelen bir tarayıcı otomatik olarak oraya yönlendirilir; yalnızca API isteklerinin uygulamaya ön eksiz ulaşması beklenir. Günlüklerde `Requests arrive under /snapotter/ but BASE_PATH is empty` görünüyorsa proxy'niz, `BASE_PATH` değerinin bildirmediği bir ön eki iletiyor demektir: `BASE_PATH` değerini bu ön eke ayarlayın veya ön eki proxy'de kaldırın.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Yeni bir Proxy Host ekleyin
2. Domain Name alanını alan adınıza ayarlayın
3. Scheme değerini `http`, Forward Hostname değerini `SnapOtter` (veya konteyner IP'niz), Forward Port değerini `1349` yapın
4. WebSocket desteğini etkinleştirin
5. Advanced altında şunları ekleyin: `client_max_body_size 500M;` ve `proxy_buffering off;`

API'nin `Strict-Transport-Security` başlığı NPM'den olduğu gibi geçer; SSL sekmesindeki HSTS anahtarı bunun üzerine isteğe bağlıdır.

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

Traefik üst akış yanıt başlıklarını değiştirmeden iletir; bu yüzden API'nin `Strict-Transport-Security` başlığı bir `headers` ara katmanı olmadan tarayıcılara ulaşır. Yanıt başlıklarını yeniden yazan bir ara katman zaten çalıştırıyorsanız bu başlığı bozmadığından emin olun.

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

`flush_interval -1` yanıt arabelleğe almayı devre dışı bırakır; bu, SSE ilerleme olayları (toplu işleme, AI araçları, özellik kurulumları) için ve büyük dosya indirmelerinin takılmak yerine akışla iletilmesi için gereklidir. Uzatılmış zaman aşımları, büyük dosya yüklemelerinin Caddy bağlantıyı erken kapatmadan tamamlanmasına izin verir. Caddy ayrıca API'nin `Strict-Transport-Security` başlığını olduğu gibi geçirir; bu yüzden HSTS için `header` yönergesine gerek yoktur.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Not: Cloudflare ücretsiz planlarda 100 MB yükleme sınırı uygular. `MAX_UPLOAD_SIZE_MB=100` değerini buna uyacak şekilde ayarlayın.

Tünel, API'nin yanıt başlıklarını (`Strict-Transport-Security` dahil) iletir; bu yüzden pano üzerinde HSTS yapılandırması gerekmez (Cloudflare'in kendi uç HSTS ayarı bunun üzerine isteğe bağlıdır).

## Sorun Giderme {#troubleshooting}

### Başarısız bir ilk başlatmanın hemen ardından "Postgres not reachable: EAI_AGAIN" {#eai-again-after-failed-first-start}

İlk `docker compose up -d` komutu yarıda başarısız olursa (genellikle nedeni kullanımda olan bir porttur), düz bir `up -d` yeniden denemesi uygulama konteynerini compose ağına bağlamadan başlatabilir. Uygulama bu durumda şu hatayla çökme döngüsüne girer:

```
Postgres not reachable: EAI_AGAIN
```

`docker ps` ise postgres'in sağlıklı olduğunu gösterir. Hata gerçektir ama yanlış konteyneri işaret eder: ağ olmadan `postgres` ana makine adı için DNS hiç çözümlenemez ve yeniden başlatma ilkesi aynı hatayı sonsuza dek tekrarlar.

İlk başlatmayı bozan şeyi düzeltin (genellikle: portu boşaltın), ardından ağa yeniden bağlanması için uygulama konteynerini zorla yeniden oluşturun:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: diğer cihazlardan erişilebiliyor, PC'nin kendisinden değil {#windows-wsl2-loopback}

Docker, WSL2 içinde çalışırken (olağan Windows kurulumu), WSL'in yansıtılmış ağ modu etkin olsa bile yığına ağınızdaki diğer tüm makinelerden erişilebilirken `http://localhost:1349` adresi Windows ana makinesinin kendisinde zaman aşımına uğrayabilir. Port Windows `netstat` çıktısında hiç görünmez ve konteynerlerde bir sorun yoktur.

Uygulamayı başka bir cihazdan veya dağıtımın içinden kendi adresini kullanarak açın (WSL kabuğunda `hostname -I`). WSL sürümünüzde localhost yönlendirmesi çalışıyorsa bunu güvenilecek bir şey değil, ek bir kolaylık sayın.

## CI/CD {#ci-cd}

GitHub deposunda üç iş akışı vardır:

- **ci.yml** - Her push ve PR'da otomatik çalışır. Lint, tür denetimi, test ve derleme yapar; Docker imajını (göndermeden) doğrular.
- **release.yml** - `workflow_dispatch` ile elle tetiklenir. Sürüm etiketi ve GitHub sürümü oluşturmak için semantic-release çalıştırır, ardından çok mimarili bir Docker imajı (amd64 + arm64) derler ve Docker Hub'a (`snapotter/snapotter`) ile GitHub Container Registry'ye (`ghcr.io/snapotter-hq/snapotter`) gönderir.
- **deploy-docs.yml** - Bu dokümantasyon sitesini derler ve `main` dalına push edildiğinde Cloudflare Pages'e dağıtır.

Sürüm oluşturmak için GitHub arayüzünde **Actions > Release > Run workflow** yolunu izleyin veya şunu çalıştırın:

```bash
gh workflow run release.yml
```

Semantic-release sürümü commit geçmişinden belirler. `latest` Docker etiketi her zaman en son sürümü gösterir.

## Analitik {#analytics}

SnapOtter, hataları yakalamaya ve özellikleri geliştirmeye yardımcı olmak için anonim ürün analitiği (araç kullanım örüntüleri, hata raporları) içerir. Varsayılan olarak açıktır. Dosyalarınız, dosya adlarınız ve kişisel verileriniz hiçbir zaman buna dahil değildir. SnapOtter analitik devre dışıyken normal çalışır.

### Analitiği devre dışı bırakma {#disabling-analytics}

Çalışma zamanı devre dışı bırakma, tek tıklamalık bir yönetici anahtarıdır. Settings > System > Privacy bölümünü açın ve Anonymous Product Analytics seçeneğini kapatın. Tüm örnek için hemen durur, yeniden derleme gerekmez.

Hiçbir zaman analitik yayınlayamayacak bir imaj için, depoyu klonlayıp yeniden derleyerek derleme zamanı kalıcı kapatmayı ayarlayın:

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
