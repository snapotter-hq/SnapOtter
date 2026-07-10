---
description: "SnapOtter'ı Docker ile üretime dağıtın. Donanım gereksinimleri, GPU kurulumu ve Nginx, Traefik ile Cloudflare için ters proxy yapılandırmaları."
i18n_source_hash: ecc1b528bc4b
i18n_provenance: human
i18n_output_hash: 3ca4110e474a
---

# Dağıtım {#deployment}

SnapOtter, 3 container'lık bir Docker Compose yığını olarak dağıtılır: SnapOtter uygulama imajı, PostgreSQL 17 ve Redis 8. Uygulama imajı **linux/amd64** (AI hızlandırması için NVIDIA CUDA ile) ve **linux/arm64** (CPU) mimarilerini destekler; böylece Intel/AMD sunucularda, Apple Silicon Mac'lerde ve Raspberry Pi 4/5 gibi ARM cihazlarda yerel olarak çalışır. VA-API, Quick Sync ya da OpenCL üzerinden Intel/AMD iGPU hızlandırması bugün AI çıkarımı için desteklenmemektedir.

GPU kurulumu, Docker Compose örnekleri ve sürüm sabitleme için [Docker İmajı](./docker-tags) bölümüne bakın.

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

Uygulama daha sonra `http://localhost:1349` adresinde kullanılabilir.

> **Docker Hub oran sınırları mı?** GitHub Container Registry'den çekmek için `snapotter/snapotter:latest` yerine `ghcr.io/snapotter-hq/snapotter:latest` kullanın. Her iki kayıt da her sürümde aynı imajı alır.

## Hızlı Başlangıç (NVIDIA CUDA) {#quick-start-nvidia-cuda}

AI araçlarında (arka plan kaldırma, ölçek büyütme, yüz iyileştirme, OCR) NVIDIA CUDA hızlandırması için:

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

Bu rakamlar, NVIDIA RTX 4070'li modern bir amd64 iş istasyonundan Raspberry Pi'ye kadar bir dizi sistem üzerinde yapılan benchmark'lardan gelir; her birinde tüm araç kataloğu çalıştırılmış ve gerçek alt sınırı bulmak için Docker kaynak sınırları taranmıştır.

### Hızlı Referans {#quick-reference}

| Katman | Kullanım Senaryosu | CPU | RAM | GPU | Depolama |
|------|----------|-----|-----|-----|---------|
| Minimum | Görsel, dosya ve hafif PDF araçları; tek kullanıcı; küçük gruplar | 2 çekirdek | 2 GB | Yok | ~7 GB |
| Önerilen | Video, PDF ve CPU üzerinde AI dahil beş modalitenin tümü; gruplar; birkaç kullanıcı | 4 çekirdek | 4 GB | Yok | ~25 GB |
| Tam | GPU AI dahil her şey hızlı; büyük gruplar; çok sayıda kullanıcı | 6-8 çekirdek | 8 GB | NVIDIA 8 GB+ VRAM (12 GB rahat) | ~35 GB |

**Mimari: yalnızca 64 bit** (`linux/amd64` veya `linux/arm64`). SnapOtter, Intel/AMD sunucularda, Apple Silicon Mac'lerde ve **Raspberry Pi 4 ile 5** (4-8 GB) dahil 64 bit ARM kartlarda yerel olarak çalışır. 32 bit ARM (`armv7`/`armhf`) üzerinde **çalışmaz** (bunun için hiçbir imaj derlenmez), Pi Zero gibi 512 MB sınıfı kartlarda da çalışmaz; bunlar bellek alt sınırının altındadır (aşağıya bakın).

### Minimum (görsel, dosya ve hafif PDF araçları; AI yok) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Kaynak | Gereksinim |
|---|---|
| CPU | 2 çekirdek |
| RAM | 2 GB |
| Disk | ~5.5 GB (imaj) + veri volume'u |
| GPU | Gerekmez |

AI içermeyen 222 katalog aracının tümü; görsel (yeniden boyutlandırma, kırpma, dönüştürme, sıkıştırma, ayarlama, filigran), video (kesme, sesi kapatma, remux), ses (dönüştürme, normalleştirme, kesme), PDF (birleştirme, bölme, sıkıştırma, döndürme, koruma), dosya dönüşümleri ve özel dönüştürme ön ayarları, mütevazı donanımda çalışır. Çoğu işlem büyük bir dosyada bile bir saniyenin çok altında biter: 2.7 MB'lık bir görsel ~0.05 s'de yeniden boyutlandırılır ve ~2 s'de WebP'ye yeniden kodlanır.

Bellek alt sınırı gerçektir ve bir Docker kaynak sınırı taramasından gelir: **512 MB yığını başlatamaz** (tek bir görsel yeniden boyutlandırma bile sonlandırılır), **1 GB** tek dosyalı işlemleri yürütür ama çok dosyalı bir grup belleği tüketir ve **2 GB / 2 çekirdek**, grupları rahatça yürüten en küçük yapılandırmadır.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**CPU'yu tek yoğun kullanan istisna video yeniden kodlamadır.** Akış kopyalama işlemleri (kesme, sesi kapatma, container remux) anlıktır, ancak farklı bir codec'e dönüştürme CPU'ya bağlıdır. VP9'a (WebM) yeniden kodlanan 1080p / 45 saniyelik bir klip, hızlı modern bir CPU'da yaklaşık **~40 s**, Apple Silicon'da ~45 s, daha eski mobil bir 4 çekirdekte ~80 s ve daha eski bir 4 çekirdekli sunucuda **~130 s** sürer. İş yükünüz videoya dayalıysa, CPU çekirdeklerine ve saat hızına öncelik verin ya da container'ın `cpus:` sınırını yükseltin; birlikte gelen compose, uygulamayı varsayılan olarak 4 çekirdekle sınırlar (GPU compose'da 8).

### Önerilen (CPU üzerinde AI araçları) {#recommended-ai-tools-on-cpu}

| Kaynak | Gereksinim |
|---|---|
| CPU | 4 çekirdek |
| RAM | 4 GB |
| Disk | 3 GB (imaj) + 24 GB (AI modelleri) + çalışma alanı |
| GPU | Gerekmez (CPU yedeği) |

**RAM'i 4 GB'a çıkaran şey AI paketlerini kurmaktır.** Hiç AI kurulu değilken uygulama ~360 MB civarında boşta bekler; yedi paketin tümü kurulduğunda ~2.6 GB yerleşik bellek tutar; çünkü Python AI yardımcı işlemi modellerini (arka plan kaldırma, ölçek büyütme, OCR, transkripsiyon, yüz algılama, restorasyon) başlangıçta önceden yükler. AI içermeyen kurulumlar hafif kalır; AI kurulumları ≥4 GB gerektirir.

Çoğu AI aracı CPU üzerinde tamamen kullanılabilir; birkaçı gerçekten bir GPU ister. Modern bir 4 çekirdekli CPU üzerinde ölçülmüştür:

| AI Aracı | CPU Süresi | CPU'da kullanılabilir mi? |
|---|---|---|
| Yüz algılama (yüz bulanıklaştırma, akıllı kırpma, kırmızı göz), gürültü giderme | 1 s altında | Evet |
| OCR, transkripsiyon, altyazılar | 1-3 s | Evet |
| Renklendirme, yüz iyileştirme | ~10 s | Evet |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~29 s | Evet (beklersiniz) |
| AI ölçek büyütme (RealESRGAN) | küçükte ~33 s; büyük görsellerde dakikalar | Sınırda; GPU şiddetle önerilir |
| Fotoğraf restorasyonu (tam pipeline) | birkaç dakika | Hayır; bir GPU ya da çok çekirdekli hızlı bir CPU gerekir |

AI model indirme boyutları:

| Paket | Disk Boyutu |
|---|---|
| Arka plan kaldırma | 4-5 GB |
| Ölçek büyütme + Yüz iyileştirme + Gürültü giderme | 5-6 GB |
| Yüz algılama | 200-300 MB |
| Nesne silici + Renklendirme | 1-2 GB |
| OCR | 5-6 GB |
| Fotoğraf restorasyonu | 4-5 GB |
| **Tüm paketler** | **~24 GB** |

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
| CPU | 6-8 çekirdek (GPU AI'da bile video hazırlığı + eşzamanlılık CPU üzerinde çalışır) |
| RAM | 8 GB |
| GPU | 8+ GB VRAM'li NVIDIA (12 GB önerilir) |
| Disk | toplam ~35 GB |

Bir NVIDIA GPU (CUDA), ağır AI modellerini dramatik biçimde hızlandırır. Bir RTX 4070'e karşı modern bir CPU üzerinde ölçülmüştür:

| AI Aracı | GPU ile Hızlanma | Notlar |
|---|---|---|
| AI ölçek büyütme (RealESRGAN 2×) | **~47×** | En büyük kazanç; ~33 s'ye karşı bir saniyenin altında (büyük görsellerde dakikalar) |
| Yüz iyileştirme (CodeFormer) | **~12×** | ~11 s'ye karşı ~0.9 s |
| Transkripsiyon (Whisper) | ~4.5× | |
| Arka plan kaldırma / değiştirme / bulanıklaştırma | ~4× | CPU'da ~29 s'ye karşı GPU'da ~7 s |
| Renklendirme | ~1.8× | |
| OCR, yüz algılama, kırmızı göz, gürültü giderme | ~1× | CPU'da zaten hızlı; bir GPU yardımcı olmaz |
| Fotoğraf restorasyonu | yok | GPU'da bile CPU'ya bağlı (%0 GPU kullanımı); burada hızlı bir CPU bir GPU'dan daha önemlidir |

Bir GPU'ya değecek araçlar **ölçek büyütme, yüz iyileştirme, transkripsiyon ve arka plan kaldırmadır**. Yüz algılama, OCR ve kırmızı göz CPU'ya bağlıdır ve zaten hızlıdır, bu yüzden bir GPU hiçbir şey katmaz.

En yüksek VRAM kullanımı, yüz iyileştirmeli ölçek büyütme sırasında 7.5 GB'a ulaşır. 6 GB'lık bir NVIDIA GPU çoğu AI aracı için tek tek çalışır ama ölçek büyütmede başarısız olur. 8-12 GB VRAM her şeyi yürütür.

VA-API, Quick Sync ya da OpenCL üzerinden Intel/AMD iGPU hızlandırması bugün AI çıkarımı için desteklenmemektedir. `/dev/dri` öğesini container'a eşlemek AI GPU hızlandırmasını etkinleştirmez; NVIDIA CUDA mevcut olmadıkça SnapOtter AI araçlarını CPU üzerinde çalıştırır.

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

Varsayılan 4 çekirdek sınırlı uygulama container'ına karşı paralel görsel yeniden boyutlandırma istekleri:

| Eşzamanlı İstekler | Ortalama Yanıt Süresi | Hatalar |
|---|---|---|
| 1 | 0.4s | 0 |
| 5 | 1.2s | 0 |
| 10 | 2.1s | 0 |

Worker havuzu doygunluğa ulaştıkça yanıt süresi doğrusal altı biçimde bozulur ve hiç hata olmaz. Uygulama container'ının `cpus:` sınırını yükseltmek (ya da daha fazla çekirdeği olan bir ana makine kullanmak) tavanı yükseltir. Ağır job'ların (video dönüştürme, CPU AI) tüm süreleri boyunca bir worker'ı tuttuğunu unutmayın; bu yüzden CPU'yu yalnızca istek sayısına göre değil, beklediğiniz eşzamanlı ağır job sayısına göre boyutlandırın.

### Desteklenen Görsel Formatları {#supported-image-formats}

SnapOtter, 20'den fazla kamera markasından RAW dosyaları, profesyonel formatlar (PSD, EPS, OpenEXR, HDR), modern codec'ler (JPEG XL, AVIF, HEIC, QOI) ve bilimsel/oyun formatları (FITS, DDS) dahil olmak üzere **55+ girdi formatı** ve **14 çıktı formatı** destekler.

Desteklenen her format, kullanılan çözücü ve mevcut kalite kontrolleri hakkında ayrıntılar için [tam format listesine](/tr/guide/supported-formats) bakın.

### Bilinen Sınırlamalar {#known-limitations}

- **İçerik farkında yeniden boyutlandırma**, caire ikili dosyasındaki bir sınırlama nedeniyle büyük görsellerde (>5 MP) çöker. Daha küçük görsellerde sorunsuz çalışır.
- **HEIF çözme** 13-23 saniye sürer. HEIC (Apple'ın varyantı) 0.3-0.9 saniyeyle çok daha hızlıdır.
- **OCR Japonca**, bir PaddlePaddle MKLDNN hatası nedeniyle CPU'da başarısız olur. GPU'da çalışır.
- **Ölçek büyütme**, küçük görseller dışında herhangi bir şey için CPU'da zaman aşımına uğrar. Pratik kullanım için GPU gerekir.
- **CodeFormer** yüz iyileştirme, GFPGAN'dan belirgin biçimde daha yavaştır (GPU'da 2 s'ye karşı 53 s). Çoğu kullanım senaryosu için GFPGAN önerilir.

## Volume'lar {#volumes}

| Bağlama / Volume | Amaç | Zorunlu mu? |
|---|---|---|
| `/data` (uygulama) | AI modelleri, Python venv, kullanıcı dosyaları | **Evet**; onsuz dosya kaybı olur |
| `/tmp/workspace` (uygulama) | Geçici işleme dosyaları (otomatik temizlenir) | Önerilir |
| `SnapOtter-pgdata` (postgres) | PostgreSQL veri dizini (kullanıcılar, ayarlar, pipeline'lar, job'lar) | **Evet**; onsuz veri kaybı olur |
| `SnapOtter-redisdata` (redis) | Dayanıklı job kuyrukları için Redis append-only dosyası | Önerilir |

### Bind mount'lar vs. adlandırılmış volume'lar {#bind-mounts-vs-named-volumes}

**Adlandırılmış volume'lar** (önerilir); Docker izinleri otomatik olarak yönetir:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mount'lar**; izinleri siz yönetirsiniz. Ana makine kullanıcınıza uyacak şekilde `PUID`/`PGID` değerini ayarlayın:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Depolama izinleri {#storage-permissions}

SnapOtter, çalışma zamanında iki konuma yazar: `/data` (kullanıcı dosyaları, günlükler, AI modelleri ve Python venv) ve `/tmp/workspace` (geçici işleme çalışma alanı). Her ikisi de container'ın çalıştığı kullanıcı tarafından yazılabilir olmalıdır. İkisinden biri değilse, container başlangıçta "sağlıklı" olarak başlayıp ilk yüklemede anlaşılmaz bir hatayla başarısız olmak yerine, dizini, çalışan UID/GID'yi ve nasıl düzeltileceğini belirten bir mesajla **başlangıçta hemen başarısız olur**.

İzinlerin nasıl ele alındığı, container'ın nasıl başlatıldığına bağlıdır:

**Varsayılan (root olarak başlar, `snapotter` kullanıcısına düşer)**; entrypoint root olarak başlar, bağlanan volume'ların sahipliğini düzeltir, ardından `gosu` aracılığıyla ayrıcalıksız `snapotter` kullanıcısına düşer. Adlandırılmış volume'lar hiçbir yapılandırma olmadan çalışır. Bind mount'lar için, yazdığı dosyaların sahibi siz olacak şekilde `PUID`/`PGID` değerini ana makine kullanıcınıza (yukarıdaki gibi) ayarlayın.

**Kubernetes / OpenShift (`runAsUser` aracılığıyla root olmayan)**; doğrudan root olmayan bir kullanıcı olarak başlatıldığında, container volume'ları kendisi chown edemez, bu yüzden orkestratörün onları yazılabilir yapması gerekir. `fsGroup` değerini ayarlayın:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

İmajın yazılabilir dizinleri GID 0 tarafından grup sahipli ve grup tarafından yazılabilirdir; böylece **rastgele bir UID** ile root ek grubu (OpenShift varsayılanı) çalıştıran bir pod, hiçbir `chown` olmadan yazabilir.

**TrueNAS Scale (ve diğer "yabancı UID" kurulumları)**; TrueNAS uygulamaları root olmayan bir kullanıcı olarak (genellikle `568:568`) çalıştırır ve farklı bir kullanıcının sahip olduğu ana makine veri kümelerini bağlar; bu yüzden ne entrypoint ne de `fsGroup` onları kendi başına yazılabilir yapar. Birini seçin:

- **Uygulamayı root olarak çalıştırın** (önerilir); uygulamanın kullanıcısını ayarlanmamış bırakın ya da `0` olarak ayarlayın ve varsayılan entrypoint'in izinleri düzeltip `snapotter` kullanıcısına düşmesine izin verin.
- **UID `999` olarak çalıştırın**; uygulamanın kullanıcı/grubunu `999:999` (SnapOtter'ın yerleşik `snapotter` kullanıcısı) olarak ayarlayın; böylece imajın sahipliğiyle eşleşir.
- Ana makine veri kümesini container'ın çalıştığı UID'ye TrueNAS kabuğundan **`chown`** yapın:

  ```bash
  # Başlangıç hatasındaki UID'yi kullanın (ya da container içinde `id` çalıştırın)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Başlangıç hatası, kullanılacak tam UID'yi belirtir, bu yüzden en hızlı yol uygulamayı bir kez başlatmak, mesajı okumak, ardından buna göre `chown` yapmaktır (ya da kullanıcıyı ayarlamaktır).

## Ortam Değişkenleri {#environment-variables}

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `AUTH_ENABLED` | `true` | Oturum açma gerekliliğini etkinleştir/devre dışı bırak |
| `DEFAULT_USERNAME` | `admin` | İlk yönetici kullanıcı adı |
| `DEFAULT_PASSWORD` | `admin` | İlk yönetici parolası (ilk oturum açmada değişim zorunlu) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Dosya başına yükleme sınırı |
| `MAX_BATCH_SIZE` | `100` | Grup isteği başına en fazla dosya |
| `RATE_LIMIT_PER_MIN` | `1000` | IP başına dakikada API isteği (devre dışı bırakmak için 0 ayarlayın) |
| `MAX_USERS` | `0` (sınırsız) | En fazla kullanıcı hesabı |
| `TRUST_PROXY` | `true` | Ters proxy'den gelen X-Forwarded-For başlıklarına güven |
| `PUID` | `999` | Bu UID olarak çalıştır (bind mount izinleri için) |
| `PGID` | `999` | Bu GID olarak çalıştır (bind mount izinleri için) |
| `LOG_LEVEL` | `info` | Günlük ayrıntısı: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (otomatik) | En fazla paralel AI işleme job'u |
| `SESSION_DURATION_HOURS` | `168` | Oturum açma oturumu ömrü (7 gün) |
| `CORS_ORIGIN` | (boş) | Virgülle ayrılmış izin verilen origin'ler, ya da aynı origin için boş |

## Sağlık Kontrolü {#health-check}

Container, yerleşik bir sağlık kontrolü içerir:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Ters Proxy {#reverse-proxy}

SnapOtter, oran sınırlama ve günlük kaydının `X-Forwarded-For` başlıklarından gerçek istemci IP'sini kullanması için varsayılan olarak `TRUST_PROXY=true` değerini ayarlar.

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
3. Scheme'i `http`, Forward Hostname'i `SnapOtter` (ya da container IP'niz), Forward Port'u `1349` olarak ayarlayın
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

`flush_interval -1`, SSE ilerleme olayları (grup işleme, AI araçları, özellik kurulumları) için gereken yanıt tamponlamasını devre dışı bırakır. Uzatılmış zaman aşımları, Caddy bağlantıyı erken kapatmadan büyük dosya yüklemelerinin tamamlanmasına olanak tanır.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Not: Cloudflare, ücretsiz planlarda 100 MB yükleme sınırına sahiptir. Eşleştirmek için `MAX_UPLOAD_SIZE_MB=100` değerini ayarlayın.

## CI/CD {#ci-cd}

GitHub deposunda üç iş akışı vardır:

- **ci.yml** - Her push ve PR'de otomatik olarak çalışır. Lint, tip kontrolü, test, derleme yapar ve Docker imajını (push etmeden) doğrular.
- **release.yml** - `workflow_dispatch` aracılığıyla el ile tetiklenir. Bir sürüm etiketi ve GitHub sürümü oluşturmak için semantic-release'i çalıştırır, ardından çok mimarili bir Docker imajı (amd64 + arm64) derler ve Docker Hub'a (`snapotter/snapotter`) ile GitHub Container Registry'ye (`ghcr.io/snapotter-hq/snapotter`) push eder.
- **deploy-docs.yml** - Bu dokümantasyon sitesini derler ve `main` üzerine push'ta Cloudflare Pages'e dağıtır.

Bir sürüm oluşturmak için GitHub arayüzünde **Actions > Release > Run workflow** yolunu izleyin ya da şunu çalıştırın:

```bash
gh workflow run release.yml
```

Semantic-release sürümü commit geçmişinden belirler. `latest` Docker etiketi her zaman en son sürüme işaret eder.

## Analitik {#analytics}

SnapOtter, hataları yakalamaya ve özellikleri iyileştirmeye yardımcı olmak için anonim ürün analitiği (araç kullanım desenleri, hata bildirimleri) içerir. Varsayılan olarak açıktır. Dosyalarınız, dosya adlarınız ve kişisel verileriniz bunun hiçbir parçası olmaz. SnapOtter analitik devre dışıyken normal biçimde çalışır.

### Analitiği devre dışı bırakma {#disabling-analytics}

Çalışma zamanı devre dışı bırakma, tek tıklamalık bir yönetici anahtarıdır. Settings > System > Privacy bölümünü açın ve Anonymous Product Analytics'i kapatın. Yeniden derleme gerekmeden tüm örnek için hemen durur.

Hiçbir zaman analitik yayamayacak bir imaj için, depoyu klonlayıp yeniden derleyerek derleme zamanı kesin kapatma ayarını yapın:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Ya da derleme argümanını mevcut `docker-compose.yml` dosyanıza ekleyin:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
