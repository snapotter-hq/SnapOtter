---
description: "SnapOtter'ı Docker ile üretime dağıtın. Donanım gereksinimleri, GPU kurulumu ve Nginx, Traefik ile Cloudflare için ters vekil sunucu yapılandırmaları."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: b90f49f5c87b
i18n_hash_version: 2
---

# Dağıtım {#deployment}

SnapOtter, 3 kapsayıcılı bir Docker Compose yığını olarak dağıtılır: SnapOtter uygulama imajı, PostgreSQL 17 ve Redis 8. Uygulama imajı **linux/amd64** (yapay zeka hızlandırma için NVIDIA CUDA ile) ve **linux/arm64** (CPU) platformlarını destekler; bu nedenle Intel/AMD sunucularda, Apple Silicon Mac'lerde ve Raspberry Pi 4/5 gibi ARM cihazlarda yerel olarak çalışır. VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırma, yapay zeka çıkarımı için şu anda desteklenmemektedir.

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

Uygulama bu durumda `http://localhost:1349` adresinde kullanılabilir olur.

Yukarıdaki yığın veritabanı sahibi olarak bağlanır. SnapOtter 2.3.0 sürümünden itibaren istekleri yalnızca satır okuyup yazan bir rolle sunabilirsiniz; bkz. [En az ayrıcalıklı roller](./database#least-privilege-roles).

> **Docker Hub hız sınırlarına mı takılıyorsunuz?** İmajı bunun yerine GitHub Container Registry'den çekmek için `snapotter/snapotter:latest` ifadesini `ghcr.io/snapotter-hq/snapotter:latest` ile değiştirin. Her iki kayıt defteri de her sürümde aynı imajı alır.

## Hızlı Başlangıç (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Desteklenen yapay zeka araçlarında (arka plan kaldırma, büyütme, yüz iyileştirme) NVIDIA CUDA hızlandırma için:

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

### GPU hızlandırmayı doğrulama {#verify-gpu-acceleration}

CUDA algılamasını günlüklerde kontrol edin:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

`--gpus all` ve NVIDIA Container Toolkit doğru kurulmuş olmasına rağmen yapay zeka araçları CPU üzerinde çalışıyorsa, etkilenen paketi (örneğin Arka Plan Kaldırma) **Ayarlar → Yapay Zeka Özellikleri** bölümünden yeniden kurun. Kurucu, ONNX Runtime'ın GPU derlemesini geri yükler; aksi halde başka bir paketin (örneğin transkripsiyon) getirdiği yalnızca CPU derlemesi, paylaşılan yapay zeka ortamında bunu gölgeleyebilir. Daha eski bir imajda arayüzden yeniden kurmak GPU'yu geri getirmezse [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490) içindeki elle onarıma bakın.

## Donanım Gereksinimleri {#hardware-requirements}

Bu sayılar, NVIDIA RTX 4070'li modern bir amd64 iş istasyonundan bir Raspberry Pi'ye kadar çeşitli sistemlerde yapılan kıyaslamalardan gelir; her birinde tüm araç kataloğu çalıştırılmış ve gerçek tabanı bulmak için Docker kaynak sınırları taranmıştır.

Bu katmanların küçük ucunda mı çalışıyorsunuz (bir Pi, eski bir dizüstü bilgisayar, 2 GB'lık bir VPS)? [Düşük Kaynaklı Kurulumlar](/tr/guide/low-resource) sayfası bu sayıları ayarlanmış sınırlarla somut bir adım adım rehbere dönüştürür.

### Hızlı Başvuru {#quick-reference}

| Katman | Kullanım Senaryosu | CPU | RAM | GPU | Depolama |
|------|----------|-----|-----|-----|---------|
| Asgari | Yapay zeka dışı araçlar (görsel, dosyalar, hafif PDF) artı yerleşik Hızlı OCR ve yüz algılama; tek kullanıcı; küçük toplu işler | 2 çekirdek | 2 GB | Yok | ~7 GB |
| Önerilen | Video, PDF ve CPU üzerinde standart yapay zeka paketleri dahil beş kategorinin tamamı; toplu işler; birkaç kullanıcı | 4 çekirdek | 4 GB (HQ inpainting için 8 GB) | Yok | ~25 GB |
| Tam | GPU yapay zeka dahil her şey hızlı; büyük toplu işler; çok sayıda kullanıcı | 6-8 çekirdek | 8 GB | NVIDIA 8 GB+ VRAM (12 GB rahat) | ~35 GB |

**Mimari: yalnızca 64 bit** (`linux/amd64` veya `linux/arm64`). SnapOtter, Intel/AMD sunucularda, Apple Silicon Mac'lerde ve **Raspberry Pi 4 ve 5** (4-8 GB) dahil 64 bit ARM kartlarda yerel olarak çalışır. 32 bit ARM (`armv7`/`armhf`) üzerinde çalışmaz, çünkü bunun için imaj derlenmez. Pi Zero gibi 512 MB sınıfı kartlarda da çalışmaz, çünkü bunlar bellek tabanının altındadır (aşağıya bakın).

### Asgari (görsel, dosya ve hafif PDF araçları; yapay zeka yok) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Kaynak | Gereksinim |
|---|---|
| CPU | 2 çekirdek |
| RAM | 2 GB |
| Disk | ~5,5 GB (imaj) + veri birimi |
| GPU | Gerekmez |

Yapay zeka dışındaki 222 katalog aracının tümü (görsel: yeniden boyutlandırma, kırpma, dönüştürme, sıkıştırma, ayarlama, filigran; video: kırpma, sessize alma, yeniden paketleme; ses: dönüştürme, normalleştirme, kırpma; PDF: birleştirme, bölme, sıkıştırma, döndürme, koruma; dosya dönüştürmeleri ve özel dönüştürme ön ayarları) mütevazı donanımda çalışır. Çoğu işlem büyük bir dosyada bile bir saniyenin çok altında biter: 2,7 MB'lık bir görsel ~0,05 sn'de yeniden boyutlandırılır ve ~2 sn'de WebP olarak yeniden kodlanır.

Bellek tabanı gerçektir ve bir Docker kaynak sınırı taramasından gelir: **512 MB yığını başlatamaz** (tek bir görsel yeniden boyutlandırma bile sonlandırılır), **1 GB** tek dosyalı işlemleri kaldırır ancak çok dosyalı bir toplu iş belleği tüketir, **2 GB / 2 çekirdek** ise yapay zeka dışı toplu işleri rahatça kaldıran en küçük yapılandırmadır. Yerleşik Hızlı OCR ve `face-detection` paketi de 2 GB içine sığar; daha büyük yapay zeka paketleri (Whisper, LaMa/DDColor, rembg, RealESRGAN, fotoğraf restorasyonu ve SD1.5 HQ inpainting) ise 4 ila 8 GB RAM gerektirir ve boş bellek paket başına tabanın altındaysa baştan reddedilir.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU'yu ağır kullanan tek istisna video yeniden kodlamadır.** Akış kopyalama işlemleri (kırpma, sessize alma, kapsayıcı yeniden paketleme) anlıktır, ancak farklı bir codec'e kodlama CPU'ya bağımlıdır. VP9'a (WebM) yeniden kodlanan 1080p / 45 saniyelik bir klip, hızlı modern bir CPU'da kabaca **~40 sn**, Apple Silicon'da ~45 sn, eski bir 4 çekirdekli mobil işlemcide ~80 sn ve eski bir 4 çekirdekli sunucuda **~130 sn** sürer. İş yükünüz videoya ağırlıklıysa CPU çekirdeklerine ve saat hızına öncelik verin veya kapsayıcının `cpus:` sınırını yükseltin. Birlikte gelen Compose uygulamayı varsayılan olarak 4 çekirdekle sınırlar (GPU Compose'ta 8).

### Önerilen (CPU üzerinde yapay zeka araçları) {#recommended-ai-tools-on-cpu}

| Kaynak | Gereksinim |
|---|---|
| CPU | 4 çekirdek |
| RAM | 4 GB |
| Disk | 3 GB (imaj) + yaklaşık 20 GB (tüm isteğe bağlı yapay zeka paketleri) + çalışma alanı |
| GPU | Gerekmez (CPU yedeği) |

**Önerinin 4 GB RAM'e çıkmasının nedeni, daha büyük yapay zeka paketlerinin kurulması ve çalıştırılmasıdır.** Hiçbir isteğe bağlı paket kurulu değilken uygulama yaklaşık 360 MB ile boşta bekler. Eski Python araçları bir yan servisi paylaşır; doğru OCR ise etkin değişmez nesle sabitlenmiş, özel, uzun ömürlü bir dağıtıcı kullanır. Etkinleştirmeden önce kurucu, aday üzerinde bir duman testi çalıştırır. Ardından yeni dağıtıcıya atomik olarak geçer ve çöp toplamadan önce önceki dağıtıcıyı boşaltır. Her resmi doğru OCR çıktısı, en kötü durum sürüm paketini 4 GiB'lık bir cgroup içinde geçmelidir; 4 GB'lık ana makine önerisi ise Node.js uygulaması, Postgres, Redis, kuyruklar ve eşzamanlı işler için boşluk bırakır.

Çoğu yapay zeka aracı CPU üzerinde gayet kullanılabilir; birkaçı gerçekten bir GPU ister. Modern 4 çekirdekli bir CPU'da ölçülmüştür:

| Yapay Zeka Aracı | CPU Süresi | CPU'da kullanılabilir mi? |
|---|---|---|
| Yüz algılama (blur-faces, smart-crop, red-eye), noise-removal | 1 sn'nin altında | Evet |
| OCR, transkripsiyon, altyazılar | 1-3 sn | Evet |
| Renklendirme, yüz iyileştirme | ~10 sn | Evet |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~29 sn | Evet (beklemeniz gerekir) |
| Yapay zeka büyütme (RealESRGAN) | küçükte ~33 sn; büyük görsellerde dakikalar | Sınırda: GPU şiddetle önerilir |
| Fotoğraf restorasyonu (tam hat) | birkaç dakika | Hayır: bir GPU veya hızlı, çok çekirdekli bir CPU gerekir |

SnapOtter bu model indirmelerini bilerek Docker imajına gömmez. Yapay zeka paketleri yalnızca bir yönetici ilgili aracı etkinleştirdiğinde çekilir, kalıcı `/data/ai` biriminde saklanır ve aynı model yığınına bağlı her araç tarafından paylaşılır. Bu, son kapsayıcı imajını küçük tutarken tam bir yapay zeka kurulumunun aşağıdaki daha büyük depolama sayılarına ulaşmasına yine de izin verir.

Bazı araçlar birden fazla paylaşılan pakete bağlıdır. Örneğin Pasaport Fotoğrafı hem `background-removal` hem de `face-detection` gerektirir; `background-removal` zaten kuruluysa Pasaport Fotoğrafı'nı etkinleştirmek yalnızca eksik `face-detection` paketini indirir. Aynı yeniden kullanım tüm yapay zeka araçları için geçerlidir.

İsteğe bağlı yapay zeka paketi depolama alanı ve CPU bellek tabanları (SnapOtter, Python yan servisine göndermeden önce kullanılabilir belleği denetler ve paketin boş bellek tabanının altındaki çalıştırmaları hemen reddeder):

| Paket | Disk Boyutu | CPU Bellek Tabanı |
|---|---|---|
| Yüz algılama | 200-300 MB | 2 GB ana makine RAM'i (~0,5 GB boş) |
| Transkripsiyon | ~600 MB | 4 GB ana makine RAM'i (~2 GB boş) |
| Nesne silici + Renklendirme | 1-2 GB | 4 GB ana makine RAM'i (~2 GB boş) |
| Doğru OCR (`balanced`/`best`) | ~208-234 MiB indirme / ~409-488 MiB kurulu | 4 GiB yapılandırılmış etkin bellek (`fast` 2 GB'ta çalışır) |
| Arka plan kaldırma | 4-5 GB | 4 GB ana makine RAM'i (~2,5 GB boş) |
| Büyütme + Yüz iyileştirme + Gürültü kaldırma | 5-6 GB | 4 GB ana makine RAM'i (~2,5 GB boş) |
| Fotoğraf restorasyonu | 4-5 GB | 4 GB ana makine RAM'i (~3 GB boş) |
| Yüksek Kaliteli Inpainting (`inpaint-hq`) | 5-7 GB | 8 GB ana makine RAM'i (~6 GB boş) |
| **Tüm paketler** | **~25 GB kurulu** | **4 GB (`inpaint-hq` ile 8 GB)** |

Hızlı OCR, Tesseract aracılığıyla imaja gömülüdür, yaklaşık 25 MiB ekler ve isteğe bağlı OCR paketini veya onun 4 GiB bellek gereksinimini gerektirmez. Hızlı OCR `auto`, `en`, `de`, `es`, `fr`, `zh` ve `ja` dillerini destekler, ancak Korece (`ko`) ve Arapçayı (`ar`) desteklemez. İkisi de `balanced` veya `best` kullanır ve bu nedenle doğru paketi gerektirir. Doğru paket resmi Linux amd64 ve arm64 kapsayıcılarında bulunur ve ONNX Runtime'ı CPU üzerinde çalıştırır. NVIDIA ana makineleri de aynı CPU OCR çalışma zamanını kullanır; bu nedenle OCR, CUDA sürümüne veya GPU mimarisine bağlı değildir. Doğru çalışma zamanı en az 4 GiB etkin bellek gerektirir: yapılandırılmış kapsayıcı cgroup sınırı, yoksa ana makine belleği. SnapOtter, paketi indirmeden önce bu imzalı uyumluluk asgarisinin altındaki sistemleri reddeder. Doğru paket kurulumu, libc ve Python ABI'sinin garanti edilemediği bare-metal/önceden derlenmiş arşivlerde de reddedilir. Bu desteklenmeyen ana makinelerde Korece ve Arapça OCR açık bir uyumsuzluk hatası döndürür ve sessizce Hızlı OCR'a geri dönmez.

Aynı `DATA_DIR` birimini paylaşan kopyalar aynı CPU mimarisini kullanmalıdır; çok kopyalı dağıtımları düğüm benzeşimi (node affinity) ile sabitleyin. Karışık amd64/arm64 kopyaları ayrı veri birimleri ve bağımsız SnapOtter dağıtımları gerektirir.

Doğru çalışma zamanı tek bir etkin nesil tutar ve etkinleştirmeden sonra indirme önbelleğini temizler. Bu sürüm için ilk kurulum, arşiv ve hazırlama alanı için geçici olarak kabaca 620-720 MiB gerektirir; yükseltme ise eski nesil etkin kalırken 1,2 GiB'a yakın bir zirveye çıkabilir. Kurucu, indirme veya çıkarma öncesinde kesin gereksinimi imzalı dizinden ve geçerli nesillerden hesaplar ve veri birimi çok küçükse erken başarısız olur.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Tam (NVIDIA CUDA üzerinde yapay zeka araçları) {#full-ai-tools-on-nvidia-cuda}

| Kaynak | Gereksinim |
|---|---|
| CPU | 6-8 çekirdek (video hazırlığı ve eşzamanlılık, GPU yapay zeka ile bile CPU üzerinde çalışır) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM'li NVIDIA (12 GB önerilir) |
| Disk | toplam ~35 GB |

Bir NVIDIA GPU (CUDA), ağır yapay zeka modellerini çarpıcı biçimde hızlandırır. Modern bir CPU'ya karşı RTX 4070 üzerinde ölçülmüştür:

| Yapay Zeka Aracı | GPU ile Hızlanma | Notlar |
|---|---|---|
| Yapay zeka büyütme (RealESRGAN 2×) | **~47×** | En büyük kazanç: bir saniyenin altı, CPU'da ~33 sn (büyük görsellerde dakikalar) |
| Yüz iyileştirme (CodeFormer) | **~12×** | ~0,9 sn, CPU'da ~11 sn |
| Transkripsiyon (Whisper) | ~4,5× | |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~4× | GPU'da ~7 sn, CPU'da ~29 sn |
| Renklendirme | ~1,8× | |
| OCR, yüz algılama, kırmızı göz, noise-removal | ~1× | CPU'da zaten hızlı: GPU yardımcı olmaz |
| Fotoğraf restorasyonu | yok | GPU'da bile CPU'ya bağımlı (%0 GPU kullanımı); burada GPU'dan çok hızlı bir CPU önemlidir |

GPU'ya değer araçlar **büyütme, yüz iyileştirme, transkripsiyon ve arka plan kaldırmadır**. Yüz algılama, OCR ve kırmızı göz CPU'ya bağımlıdır ve zaten hızlıdır; bu yüzden GPU hiçbir şey katmaz.

Tepe VRAM kullanımı, yüz iyileştirmeli büyütme sırasında 7,5 GB'a ulaşır. 6 GB'lık bir NVIDIA GPU çoğu yapay zeka aracıyla tek tek çalışır ancak büyütmede başarısız olur. 8-12 GB VRAM her şeyi kaldırır.

VA-API, Quick Sync veya OpenCL üzerinden Intel/AMD iGPU hızlandırma, yapay zeka çıkarımı için şu anda desteklenmemektedir. `/dev/dri` aygıtını kapsayıcıya eşlemek yapay zeka GPU hızlandırmasını etkinleştirmez; NVIDIA CUDA kullanılabilir olmadıkça SnapOtter yapay zeka araçlarını CPU üzerinde çalıştırır.

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

Varsayılan 4 çekirdekle sınırlı uygulama kapsayıcısına karşı paralel görsel yeniden boyutlandırma istekleri:

| Eşzamanlı İstekler | Ort. Yanıt Süresi | Hatalar |
|---|---|---|
| 1 | 0,4 sn | 0 |
| 5 | 1,2 sn | 0 |
| 10 | 2,1 sn | 0 |

İşçi havuzu doygunluğa ulaştıkça yanıt süresi doğrusal olmayan biçimde artar ve hata görülmez. Uygulama kapsayıcısının `cpus:` sınırını yükseltmek (veya daha çok çekirdekli bir ana makine kullanmak) tavanı yükseltir. Ağır işlerin (video kodlama, CPU yapay zeka) tüm süreleri boyunca bir işçiyi tuttuğunu unutmayın; bu yüzden CPU'yu yalnızca istek sayısına göre değil, beklenen eşzamanlı ağır iş sayınıza göre boyutlandırın.

### Desteklenen Görsel Biçimleri {#supported-image-formats}

SnapOtter, 20'den fazla kamera markasının RAW dosyaları, profesyonel biçimler (PSD, EPS, OpenEXR, HDR), modern codec'ler (JPEG XL, AVIF, HEIC, QOI) ve bilimsel/oyun biçimleri (FITS, DDS) dahil **55+ girdi biçimini** ve **14 çıktı biçimini** destekler.

Desteklenen her biçim, kullanılan çözücü ve kullanılabilir kalite denetimleri hakkında ayrıntılar için [tam biçim listesine](/tr/guide/supported-formats) bakın.

### Bilinen Sınırlamalar {#known-limitations}

- **İçeriğe duyarlı yeniden boyutlandırma**, caire ikili dosyasındaki bir sınırlama nedeniyle büyük görsellerde (>5 MP) çöker. Daha küçük görsellerde sorunsuz çalışır.
- **HEIF çözme** 13-23 saniye sürer. HEIC (Apple'ın çeşidi) 0,3-0,9 saniye ile çok daha hızlıdır.
- **Büyütme**, küçük görsellerin ötesindeki her şey için CPU'da zaman aşımına uğrar. Pratik kullanım için GPU gerekir.
- **CodeFormer** yüz iyileştirme, GFPGAN'dan belirgin biçimde yavaştır (GPU'da 53 sn'ye karşı 2 sn). Çoğu kullanım senaryosu için GFPGAN önerilir.

## Birimler {#volumes}

| Bağlama / Birim | Amaç | Gerekli mi? |
|---|---|---|
| `/data` (uygulama) | Yapay zeka modelleri, Python venv, kullanıcı dosyaları | **Evet**: olmadan dosya kaybı olur |
| `/tmp/workspace` (uygulama) | Geçici işleme dosyaları (otomatik temizlenir) | Önerilir |
| `SnapOtter-pgdata` (postgres) | PostgreSQL veri dizini (kullanıcılar, ayarlar, iş hatları, işler) | **Evet**: olmadan veri kaybı olur |
| `SnapOtter-redisdata` (redis) | Kalıcı iş kuyrukları için Redis append-only dosyası | Önerilir |

### Bind mount'lar ve adlandırılmış birimler {#bind-mounts-vs-named-volumes}

**Adlandırılmış birimler** (önerilir): Docker izinleri otomatik yönetir:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount'lar**: izinleri siz yönetirsiniz. `PUID`/`PGID` değerlerini ana makine kullanıcınıza uyacak şekilde ayarlayın:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Depolama izinleri {#storage-permissions}

SnapOtter çalışma zamanında iki konuma yazar: `/data` (kullanıcı dosyaları, günlükler, yapay zeka modelleri ve Python venv) ve `/tmp/workspace` (geçici işleme alanı). Her ikisi de kapsayıcının çalıştığı kullanıcı tarafından yazılabilir olmalıdır. Biri değilse kapsayıcı **başlangıçta hızla başarısız olur** ve dizini, çalışan UID/GID'yi ve nasıl düzeltileceğini belirten bir ileti verir; "sağlıklı" olarak açılıp ilk yüklemede şifreli bir hatayla başarısız olmaz. Günlük dizini (`LOG_DIR`, imajda `/data/logs`) da, dosyalar S3'te olsa bile günlükler yerel kaldığı için her depolama modunda aynı şekilde denetlenir.

İzinlerin nasıl ele alındığı, kapsayıcının nasıl başlatıldığına bağlıdır:

**Varsayılan (root olarak başlar, `snapotter` kullanıcısına düşer)**: giriş noktası root olarak başlar, bağlanan birimlerin sahipliğini düzeltir, ardından `gosu` aracılığıyla ayrıcalıksız `snapotter` kullanıcısına düşer. Adlandırılmış birimler yapılandırma gerektirmeden çalışır. Bind mount'lar için, yazdığı dosyaların size ait olması amacıyla `PUID`/`PGID` değerlerini ana makine kullanıcınıza ayarlayın (yukarıda).

**Kubernetes / OpenShift (`runAsUser` ile root olmayan)**: doğrudan root olmayan bir kullanıcı olarak başlatıldığında kapsayıcı birimlerin sahipliğini kendisi değiştiremez; bu yüzden orkestratör onları yazılabilir yapmalıdır. `fsGroup` ayarlayın:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

İmajın yazılabilir dizinleri GID 0'a ait ve grup tarafından yazılabilir olduğundan, **rastgele bir UID** ile root ek grubuyla (OpenShift varsayılanı) çalışan bir pod, `chown` olmadan yazabilir.

**TrueNAS Scale (ve diğer "yabancı UID" kurulumları)**: TrueNAS uygulamaları root olmayan bir kullanıcıyla (çoğunlukla `568:568`) çalıştırır ve farklı bir kullanıcıya ait ana makine veri kümelerini bağlar; bu yüzden ne giriş noktası ne de `fsGroup` bunları kendi başına yazılabilir yapar. Birini seçin:

- **Uygulamayı root olarak çalıştırın** (önerilir): uygulamanın kullanıcısını ayarlamadan bırakın veya `0` yapın ve varsayılan giriş noktasının izinleri düzeltip `snapotter` kullanıcısına düşmesine izin verin.
- **UID `999` olarak çalıştırın**: imajın sahipliğiyle eşleşmesi için uygulamanın kullanıcı/grubunu `999:999` yapın (SnapOtter'ın yerleşik `snapotter` kullanıcısı).
- Ana makine veri kümesinin sahipliğini kapsayıcının çalıştığı UID'ye **`chown` ile değiştirin**, TrueNAS kabuğundan:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Başlangıç hatası kullanılacak tam UID'yi belirtir; bu yüzden en hızlı yol uygulamayı bir kez başlatmak, iletiyi okumak, ardından buna göre `chown` yapmaktır (veya kullanıcıyı ayarlamaktır).

## Ortam Değişkenleri {#environment-variables}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `true` | Oturum açma zorunluluğunu etkinleştir/devre dışı bırak |
| `DEFAULT_USERNAME` | `admin` | İlk yönetici kullanıcı adı |
| `DEFAULT_PASSWORD` | `admin` | İlk yönetici parolası (ilk girişte değiştirme zorunludur) |
| `MAX_UPLOAD_SIZE_MB` | `0` (sınırsız) | Dosya başına yükleme sınırı, MB cinsinden. İmaj `0` ile gelir; kaynak koddan derleme 100 ile başlar |
| `MAX_BATCH_SIZE` | `0` (sınırsız) | Toplu istek başına en fazla dosya sayısı. İmaj `0` ile gelir; kaynak koddan derleme 100 ile başlar |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikada API isteği (devre dışı bırakmak için 0 yapın) |
| `MAX_USERS` | `0` (sınırsız) | Azami kullanıcı hesabı sayısı |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | `X-Forwarded-For` üzerinden istemci IP'sini hangi eşlerin ayarlayabileceği. Varsayılan olarak yalnızca özel ağlar |
| `PUID` | `999` | Bu UID olarak çalıştır (bind mount izinleri için) |
| `PGID` | `999` | Bu GID olarak çalıştır (bind mount izinleri için) |
| `LOG_LEVEL` | `info` | Günlük ayrıntı düzeyi: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (otomatik) | Paralel yapay zeka işleme işlerinin azami sayısı |
| `SESSION_DURATION_HOURS` | `168` | Oturum açma oturumu ömrü (7 gün) |
| `CORS_ORIGIN` | (boş) | Virgülle ayrılmış izinli kaynaklar (origin); aynı kaynak için boş bırakın |

### Giden vekil sunucu ve özel CA {#outbound-proxy-and-private-ca}

Resmi kapsayıcı, Node'un ortam vekil sunucu desteğini etkinleştirir. SnapOtter'ın OCR çalışma zamanı deposuna veya diğer HTTPS servislerine kurumsal bir vekil sunucu üzerinden ulaşması gerekiyorsa `HTTPS_PROXY` ayarlayın (gerekirse `HTTP_PROXY` de). Postgres, Redis ve dahili nesne depolama gibi doğrudan ulaşılması gereken ana makinelerin virgülle ayrılmış listesine `NO_PROXY` ayarlayın.

Vekil sunucu veya dahili bir servis özel bir sertifika yetkilisi tarafından imzalanmışsa CA sertifikasını salt okunur bağlayın ve `NODE_EXTRA_CA_CERTS` değişkenini ona yöneltin. Dosya, Node işlemi başlarken mevcut olmalıdır:

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

Vekil sunucu kimlik bilgilerini Compose dosyasının dışında tutun (örneğin korumalı bir `.env` dosyasında veya gizli bilgide). TLS doğrulamasını devre dışı bırakmayın: imzalı OCR dizini sürüm meta verilerini doğrular, normal TLS doğrulaması ise aktarımı ve diğer tüm giden istekleri korumaya devam eder.

## Sağlık Denetimi {#health-check}

Kapsayıcı yerleşik bir sağlık denetimi içerir:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Ters Vekil Sunucu {#reverse-proxy}

`TRUST_PROXY` varsayılan olarak `loopback,linklocal,uniquelocal` değerindedir; bu yüzden SnapOtter `X-Forwarded-For` başlığına yalnızca özel bir ağdaki eşten gelirse inanır. Aynı ana makinedeki, bir Docker ağındaki veya LAN'ınızdaki bir ters vekil sunucu kutudan çıktığı gibi güvenilirdir; yani hız sınırlama, giriş kaba kuvvet sınırlayıcısı, denetim günlüğü ve kurumsal IP izin listesi, yapılandırma gerekmeden gerçek istemci IP'sini görür.

`TRUST_PROXY=true` değerini yalnızca öndeki vekil sunucu SnapOtter'a **herkese açık** bir adresten ulaşıyorsa ayarlayın; örneğin farklı bir ağdaki bir bulut yük dengeleyici. Doğrudan açığa çıkmış bir örnekte bu değer `request.ip` başlığını saldırgan denetimine açar, çünkü başlığı döndüren bir çağıran her istekte yeni bir hız sınırı kovası elde eder.

İstemci IP'lerini ölçmeye girişmeden önce bilmeniz gereken iki şey var. macOS ve Windows'ta Docker Desktop, yayımlanan bir bağlantı noktasını her kaynak adresini VM ağ geçidi `192.168.65.1` olarak yeniden yazan bir kullanıcı alanı vekil sunucusu üzerinden sunar; bu nedenle `TRUST_PROXY` değerinin hiçbir ayarı orada gerçek istemciyi geri getirmez. İnternete açık her şeyi Linux üzerinde dağıtın. İkincisi, her platformda yayımlanan bir bağlantı noktasına `localhost` üzerinden ulaşmak, istemciniz olarak değil köprü ağ geçidi olarak gözlenir; bu yüzden bir localhost testi, gerçek bir istemcinin nasıl atfedildiği hakkında hiçbir şey söylemez. `TRUST_PROXY` değerlerinin tam tablosu ve Docker Desktop uyarısı [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy) içindedir.

Aşağıdaki her vekil sunucu için iki şey önemlidir: büyük istek gövdelerine (yüklemeler) izin verin ve yanıtları tamponlamayın. Yanıt tamponlayan bir vekil sunucu SSE ilerlemesini bozar ve daha görünür biçimde, vekil sunucu tüm dosyayı iletmeden önce tuttuğu için büyük bir dosya indirmesinin "başlayıp hiç bitmemesine" yol açar. SnapOtter, indirmelerde `X-Accel-Buffering: no` gönderir; böylece başka yerlerde tamponlama açık bırakılsa bile nginx bunları akış olarak iletir, ancak nginx dışındaki vekil sunucularda yanıt tamponlamasının açıkça kapatılması gerekir (aşağıdaki her yapılandırmada gösterilmiştir). Bir indirme yarıda takılırsa ilk bakılacak yer öndeki tamponlayan vekil sunucudur.

HSTS hakkında bir not: API her yanıtta `Strict-Transport-Security` başlığını kendisi gönderir; bu yüzden yanıt başlıklarını geçiren bir vekil sunucunun (aşağıdaki yapılandırmaların hepsi geçirir) kendi HSTS kurulumuna ihtiyacı yoktur. Yalnızca vekil sunucunuz üst akış yanıt başlıklarını kaldıracak veya geçersiz kılacak şekilde yapılandırılmışsa başlığı korumanız veya uçta yeniden eklemeniz gerekir.

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

`https://example.com/snapotter` altında sunmak için SnapOtter kapsayıcısının ortamında `BASE_PATH=/snapotter` ayarlayın ve yeniden başlatın. Resmi CPU ve GPU Compose dosyaları `BASE_PATH` değerini kabuğunuzdan veya Compose `.env` dosyanızdan da kabul eder. Aynı imaj her yolda çalışır; ön yüzü yeniden derlemek gerekmez.

`BASE_PATH`, harf, rakam, `_` veya `-` içeren, eğik çizgiyle ayrılmış bölümleri kabul eder; `/apps/snapotter` gibi iç içe yollar dahildir. Sondaki eğik çizgi isteğe bağlıdır. Kök dağıtım için boş bırakın (varsayılan) veya `/` ayarlayın.

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

Bu örnek ön eki korur. İletmeden önce `/snapotter` ön ekini kaldıran vekil sunucular da desteklenir. Dahili sağlık denetimleri `/api/v1/health` kullanmaya devam edebilir. OIDC veya SAML için ayrıca `EXTERNAL_URL=https://example.com/snapotter` ayarlayın ve kimlik sağlayıcının geri çağırma URL'lerini sırasıyla `/snapotter/api/auth/oidc/callback` veya `/snapotter/api/auth/saml/callback` içerecek şekilde güncelleyin.

API betikleri değişmeden çalışmaya devam eder: bir aracın `downloadUrl` değeri gibi API yanıtlarındaki URL'ler, `BASE_PATH` ne olursa olsun `/api/` ile başlar. Bunları alan köküne göre çözümlemek yerine örneğinizin temel URL'sine (`https://example.com/snapotter` + `/api/v1/download/...`) ekleyin.

Arayüzü ön ekli URL üzerinden açın (`https://example.com/snapotter`). Ön eksiz gelen bir tarayıcı otomatik olarak oraya yönlendirilir; yalnızca API isteklerinin uygulamaya ön eksiz ulaşması beklenir. Günlüklerde `Requests arrive under /snapotter/ but BASE_PATH is empty` yazıyorsa vekil sunucunuz, `BASE_PATH` tarafından bildirilmeyen bir ön eki iletiyordur: `BASE_PATH` değerini ona ayarlayın veya ön eki vekil sunucuda kaldırın.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Yeni bir Proxy Host ekleyin
2. Domain Name alanını alan adınıza ayarlayın
3. Scheme alanını `http`, Forward Hostname alanını `SnapOtter` (veya kapsayıcı IP'niz), Forward Port alanını `1349` yapın
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

Traefik üst akış yanıt başlıklarını değiştirmeden iletir; bu yüzden API'nin `Strict-Transport-Security` başlığı bir `headers` ara katmanı olmadan tarayıcılara ulaşır. Yanıt başlıklarını yeniden yazan bir tanesini zaten çalıştırıyorsanız bu başlığı bozmadığından emin olun.

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

`flush_interval -1` yanıt tamponlamasını devre dışı bırakır; bu, SSE ilerleme olayları (toplu işleme, yapay zeka araçları, özellik kurulumları) için ve büyük dosya indirmelerinin takılmak yerine akış olarak iletilmesi için gereklidir. Uzatılmış zaman aşımları, büyük dosya yüklemelerinin Caddy bağlantıyı erken kapatmadan tamamlanmasına izin verir. Caddy ayrıca API'nin `Strict-Transport-Security` başlığını değiştirmeden geçirir; bu yüzden HSTS için bir `header` yönergesine gerek yoktur.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Not: Cloudflare'in ücretsiz planlarda 100 MB yükleme sınırı vardır. `MAX_UPLOAD_SIZE_MB=100` değerini buna uyacak şekilde ayarlayın.

Tünel, `Strict-Transport-Security` dahil API'nin yanıt başlıklarını iletir; bu yüzden panoda HSTS yapılandırması gerekmez (Cloudflare'in kendi uç HSTS ayarı bunun üzerine isteğe bağlıdır).

## Sorun Giderme {#troubleshooting}

### Başarısız bir ilk başlatmanın hemen ardından "Postgres not reachable: EAI_AGAIN" {#eai-again-after-failed-first-start}

İlk `docker compose up -d` komutu yarıda başarısız olursa (genellikle bir bağlantı noktasının zaten kullanımda olması nedeniyle), düz bir `up -d` yeniden denemesi uygulama kapsayıcısını Compose ağına bağlamadan başlatabilir. Uygulama bu durumda şu hatayla çökme döngüsüne girer:

```
Postgres not reachable: EAI_AGAIN
```

`docker ps` ise postgres'in sağlıklı olduğunu gösterir. Hata gerçektir ancak yanlış kapsayıcıyı işaret eder: ağ olmadan `postgres` ana makine adı için DNS hiç çözümlenemez ve yeniden başlatma ilkesi aynı hatayı sonsuza dek tekrarlar.

İlk başlatmayı bozan her neyse onu düzeltin (genellikle: bağlantı noktasını boşaltın), ardından ağa yeniden bağlanması için uygulama kapsayıcısını zorla yeniden oluşturun:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: diğer cihazlardan erişilebilir, PC'nin kendisinden değil {#windows-wsl2-loopback}

Docker WSL2 içinde çalışırken (olağan Windows kurulumu), WSL'in yansıtılmış ağ modu etkin olsa bile yığına ağınızdaki diğer tüm makinelerden erişilebilirken Windows ana makinesinin kendisinde `http://localhost:1349` zaman aşımına uğrayabilir. Bağlantı noktası Windows `netstat` çıktısında hiç görünmez ve kapsayıcılarda herhangi bir sorun yoktur.

Uygulamayı başka bir cihazdan veya dağıtımın içinden kendi adresini kullanarak açın (WSL kabuğunda `hostname -I`). WSL sürümünüzde localhost yönlendirmesi çalışıyorsa bunu bağımlı olunacak bir şey olarak değil, bir bonus olarak görün.

## CI/CD {#ci-cd}

GitHub deposunda üç iş akışı vardır:

- **ci.yml** - Her push ve PR'da otomatik çalışır. Lint, tür denetimi, test ve derleme yapar; Docker imajını (göndermeden) doğrular.
- **release.yml** - `workflow_dispatch` ile elle tetiklenir. Bir sürüm etiketi ve GitHub sürümü oluşturmak için semantic-release çalıştırır, ardından çok mimarili (amd64 + arm64) bir Docker imajı derler ve Docker Hub'a (`snapotter/snapotter`) ile GitHub Container Registry'ye (`ghcr.io/snapotter-hq/snapotter`) gönderir.
- **deploy-docs.yml** - Bu belge sitesini derler ve `main` dalına yapılan push'ta Cloudflare Pages'e dağıtır.

Bir sürüm oluşturmak için GitHub arayüzünde **Actions > Release > Run workflow** yolunu izleyin veya şunu çalıştırın:

```bash
gh workflow run release.yml
```

Semantic-release sürümü commit geçmişinden belirler. `latest` Docker etiketi her zaman en son sürümü işaret eder.

## Analitik {#analytics}

SnapOtter, hataları yakalamaya ve özellikleri geliştirmeye yardımcı olmak için anonim ürün analitiği (araç kullanım örüntüleri, hata raporları) içerir. Varsayılan olarak açıktır. Dosyalarınız, dosya adlarınız ve kişisel verileriniz bunun hiçbir zaman parçası değildir. SnapOtter analitik devre dışıyken normal çalışır.

### Analitiği devre dışı bırakma {#disabling-analytics}

Çalışma zamanı devre dışı bırakma, tek tıklamalık bir yönetici anahtarıdır. Ayarlar > Sistem > Gizlilik bölümünü açın ve Anonim Ürün Analitiği seçeneğini kapatın. Tüm örnek için anında durur, yeniden derleme gerekmez.

Hiçbir zaman analitik göndermeyecek bir imaj için depoyu klonlayıp yeniden derleyerek derleme zamanı sert kapatmayı ayarlayın:

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
