---
description: "SnapOtter için güvenlik sıkılaştırma kılavuzu. Konteyner güvenliği, ağ yalıtımı, Docker secrets, Kubernetes dağıtımı ve uyumluluk yapıtları."
i18n_source_hash: 986f7658430c
i18n_provenance: human
i18n_output_hash: 06ae3b36d6e3
---

# Güvenlik ve Sıkılaştırma {#security-hardening}

SnapOtter dosyaları tamamen kendi altyapınızda işler. Projeyi geliştirmeye yardımcı olmak için varsayılan olarak anonim, içerik içermeyen ürün analitiği ve çökme raporları gönderir. Dosyalarınızı, dosya adlarınızı, dosya içeriklerinizi, OCR çıktısını, görsel meta verilerini veya belge metnini asla göndermez. İsteğe bağlı geri bildirim yalnızca bir kullanıcı gönderdikten sonra, yalnızca analitik etkinken gönderilir ve iletişim alanları yalnızca açık iletişim onayıyla dahil edilir. Bir yönetici, Settings > System > Privacy altında tek tıklamayla analitik ve geri bildirim yakalamayı yeniden derleme gerekmeden kapatabilir. Dosya işleme her zaman konteynerinizin içinde kalır.

Konteyner, gerekli minimum küme dışında tüm Linux yetenekleri düşürülmüş özel bir root olmayan kullanıcı (`snapotter`) olarak çalışır. Tam güvenlik açığı açıklama politikası ve güvenlik mimarisi için GitHub'daki [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) dosyasına bakın.

## Konteyner Sıkılaştırma {#container-hardening}

[Varsayılan docker-compose.yml](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) üretim güvenlik sıkılaştırması içerir. İşte her seçeneğin bir dökümü ve neden önemli olduğu:

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      # Bind to localhost only for internet-facing deployments:
      - "127.0.0.1:1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_PASSWORD=change-me-immediately
      - RATE_LIMIT_PER_MIN=1000
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

    # --- Resource limits ---
    mem_limit: 6g            # Prevents runaway memory from crashing the host
    memswap_limit: 6g        # No swap - fail fast instead of degrading the host
    cpus: 4                  # Cap CPU usage to 4 cores
    pids_limit: 512          # Prevents fork bombs

    # --- Capability restrictions ---
    cap_drop:
      - ALL                  # Drop ALL Linux capabilities first
    cap_add:
      - CHOWN                # Needed for volume permission setup
      - SETUID               # Needed for gosu privilege drop (root -> snapotter)
      - SETGID               # Needed for gosu privilege drop
      - DAC_OVERRIDE         # Needed for volume permission setup
      - FOWNER               # Needed for volume permission setup

    # --- Logging ---
    logging:
      driver: json-file
      options:
        max-size: "50m"      # Rotate logs at 50 MB
        max-file: "5"        # Keep 5 rotated log files

    # --- Health check ---
    healthcheck:
      test: ["CMD", "curl", "-sf", "--max-time", "5", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3

    shm_size: "2gb"          # Required for Python ML shared memory
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
      start_period: 15s

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
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

### Neden `no-new-privileges` Ayarlanmıyor {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` kasıtlı olarak atlanmıştır. Giriş noktası, birim sahipliğini düzeltmek için root olarak başlar, ardından setuid gerektiren [gosu](https://github.com/tianon/gosu) aracılığıyla `snapotter` kullanıcısına düşer. Ayrıcalık düşürme tamamlandığında, işlem yukarıda listelenen beşi dışındaki tüm yeteneklerden arındırılmış olarak `snapotter` olarak çalışır.

Doğrudan root olmayan olarak çalıştırmak için Kubernetes veya Docker'ın `--user` bayrağını kullanırsanız (gosu'yu atlayarak), `no-new-privileges` etkinleştirmek güvenlidir.

### Neden `read_only` Ayarlanmıyor {#why-read-only-is-not-set}

`read_only: true` ayarlanmamıştır çünkü PUID/PGID yeniden eşleme başlangıçta `/etc/passwd` ve `/etc/group` dizinlerine yazar. PUID/PGID yerine Docker'ın `--user` bayrağını veya Kubernetes `runAsUser` kullanırsanız, salt-okunur bir root dosya sistemini güvenle etkinleştirebilirsiniz.

## Ağ Yalıtımı {#network-isolation}

Normal çalışma sırasında konteyner **sıfır giden ağ bağlantısı** yapar. Tüm dosya işleme, birlikte gelen kitaplıklar kullanılarak yerel olarak gerçekleşir.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Tek istisna **AI model indirmeleridir**: bir kullanıcı arayüz aracılığıyla bir AI özellik paketi kurduğunda, konteyner önceden derlenmiş paket arşivini Hugging Face'ten, ayrıca GitHub Releases, Google Storage ve PyPI'dan birkaç bireysel model dosyasını indirir. Bu indirmeler paket başına bir kez gerçekleşir ve `/data` biriminde saklanır.

**Güvenlik duvarı önerileri:**

| Senaryo | Giden kural |
|---|---|
| Hava boşluklu (AI yok) | Konteynerden tüm giden trafiği engelle |
| AI paketleri gerekli | Kurulum sırasında `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` adreslerine HTTPS'ye izin ver, ardından engelle |
| AI kurulumundan sonra | Tüm giden trafiği engelle - modeller yerel olarak önbelleğe alınır |

Paket arşivleri, `*.xethub.hf.co` uç noktaları üzerinden paralel olarak aktarılan ve çoklu GB paket indirmelerini hızlı yapan Hugging Face'in Xet depolamasından sunulur. Güvenlik duvarınız `huggingface.co` adresine izin veriyor ancak `*.xethub.hf.co` adresini engelliyorsa, kurulumlar yine de başarılı olur ancak daha yavaş bir tek akışlı indirmeye geri döner, bu nedenle hızlı yolda kalmak için Xet ana bilgisayarlarını izin listesine ekleyin. Tamamen çevrimdışı kurulumlar tüm bunları atlayabilir ve bunun yerine [Çevrimdışı Paket İçe Aktarma](/tr/guide/deployment) kullanabilir.

Ters proxy yapılandırması (Nginx, Traefik, Caddy, Cloudflare Tunnels) için [Dağıtım kılavuzuna](/tr/guide/deployment#reverse-proxy) bakın.

## Docker Secrets {#docker-secrets}

Üretim dağıtımları için, secret'ları düz metin ortam değişkenleri olarak geçirmekten kaçının. Giriş noktası Docker'ın `_FILE` kuralını destekler: bir secret'ı dosya olarak bağlayın ve karşılık gelen `_FILE` değişkenini yoluna ayarlayın.

**Desteklenen secret'lar:**

| Değişken | `_FILE` eşdeğeri |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Docker Compose secrets ile örnek:**

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD_FILE=/run/secrets/snapotter_password
      - COOKIE_SECRET_FILE=/run/secrets/cookie_secret
    secrets:
      - snapotter_password
      - cookie_secret

secrets:
  snapotter_password:
    file: ./secrets/snapotter_password.txt
  cookie_secret:
    file: ./secrets/cookie_secret.txt
```

::: tip 
Docker Compose secrets (Swarm olmadan) Compose v2.23 veya üstünü gerektirir.
:::

## Kubernetes Dağıtımı {#kubernetes-deployment}

Giriş noktası, konteynerin zaten root olmayan olarak çalıştığını algılar (ör. Kubernetes `runAsUser` aracılığıyla) ve gosu ayrıcalık düşürmesini otomatik olarak atlar. Bu durumda bağlanan birimleri kendisi chown yapamaz, bu nedenle bunların yazılabilir olduğunu doğrular ve değilse eyleme geçirilebilir yönlendirmeyle erken çıkar - `fsGroup` ve yabancı-UID kurulumları (TrueNAS, OpenShift) için [Depolama izinleri](/tr/guide/deployment#storage-permissions) bölümüne bakın.

**Önerilen Pod SecurityContext:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: snapotter
spec:
  replicas: 1
  selector:
    matchLabels:
      app: snapotter
  template:
    metadata:
      labels:
        app: snapotter
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        fsGroup: 999
      containers:
        - name: snapotter
          image: snapotter/snapotter:latest
          ports:
            - containerPort: 1349
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: [ALL]
          resources:
            requests:
              cpu: "1"
              memory: 2Gi
            limits:
              cpu: "4"
              memory: 6Gi
          livenessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 60
            periodSeconds: 30
            timeoutSeconds: 5
          readinessProbe:
            httpGet:
              path: /api/v1/health
              port: 1349
            initialDelaySeconds: 10
            periodSeconds: 10
            timeoutSeconds: 5
          volumeMounts:
            - name: data
              mountPath: /data
            - name: workspace
              mountPath: /tmp/workspace
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: snapotter-data
        - name: workspace
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
```

`runAsUser: 999` pod düzeyinde ayarlandığından, giriş noktası gosu'yu tamamen atlar. Bu, `allowPrivilegeEscalation: false` ve `drop: [ALL]` yeteneklerine çakışma olmadan izin verir.

Kaynak boyutlandırma için [Donanım Gereksinimleri](/tr/guide/deployment#hardware-requirements) bölümüne bakın.

## Yedekleme ve Kurtarma {#backup-and-recovery}

Kalıcı durum iki birim arasında bölünmüştür:

| Birim | İçerik | Kritik mi? |
|---|---|---|
| `SnapOtter-pgdata` | PostgreSQL veritabanı (kullanıcılar, ayarlar, ardışık düzenler, işler, denetim günlüğü) | Evet |
| `/data` (uygulama birimi) | Kullanıcı tarafından yüklenen dosyalar, AI modelleri, Python venv | Kısmen (aşağıya bakın) |

`/data` birimi içinde:

| Yol | İçerik | Kritik mi? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | Kullanıcı dosyaları ve işleme sonuçları | Evet |
| `/data/ai/` | İndirilen AI model dosyaları | Hayır (yeniden indirilebilir) |
| `/data/venv/` | Python sanal ortamı | Hayır (başlangıçta yeniden derlenir) |

### Veritabanı yedekleme {#database-backup}

Yığın çalışırken veritabanını yedeklemek için `pg_dump` kullanın:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Alternatif olarak, yığını durdurun ve `SnapOtter-pgdata` biriminin anlık görüntüsünü alın:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Kullanıcı dosyaları yedekleme {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

AI modelleri tüm paketlerde toplamda yaklaşık 24 GB'a kadar çıkar. Yeniden indirilebilir olduklarından, yerden tasarruf etmek için `/data/ai/` ve `/data/venv/` dizinlerini yedeklemelerden hariç tutun. Yalnızca veritabanı ve kullanıcı dosyaları kritiktir.

## Uyumluluk Yapıtları {#compliance-artifacts}

Her SnapOtter sürümü aşağıdaki güvenlik yapıtlarını içerir:

| Yapıt | Format | Nerede bulunur |
|---|---|---|
| SBOM (CycloneDX) | JSON | [GitHub Sürümü](https://github.com/snapotter-hq/SnapOtter/releases) varlığı: `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | [GitHub Sürümü](https://github.com/snapotter-hq/SnapOtter/releases) varlığı: `snapotter-v{version}-sbom.spdx.json` |
| Güvenlik açığı taraması | Trivy JSON | [GitHub Sürümü](https://github.com/snapotter-hq/SnapOtter/releases) varlığı: `snapotter-v{version}-trivy.json` |
| Güvenlik açığı taraması | SARIF | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) sekmesi |
| Statik analiz | CodeQL (JS/TS + Python) | [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) sekmesi, haftalık + PR başına çalışır |
| Bağımlılık incelemesi | GitHub yerel | PR başına kontrol, yüksek önem dereceli eklemelerde başarısız olur |
| Python bağımlılık denetimi | pip-audit | Her push'ta CI çalıştırma günlüğü |
| Güvenlik politikası | Markdown | Depodaki [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) |
| Bağımlılık güncellemeleri | Dependabot | npm, pip, Docker, Actions için otomatik haftalık PR'ler |

**Kendi taramanızı çalıştırma:**

SBOM'u sürümden indirin ve tercih ettiğiniz araçla tarayın:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM ve güvenlik açığı taraması, o sürüm için yayınlanan tam imajı yansıtır. Dağıtımdan sonra kurulan AI model paketleri, çalışma zamanında indirildiğinden SBOM'a dahil edilmez.
:::
