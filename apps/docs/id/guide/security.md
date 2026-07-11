---
description: "Panduan pengerasan keamanan untuk SnapOtter. Keamanan kontainer, isolasi jaringan, Docker secrets, deployment Kubernetes, dan artefak kepatuhan."
i18n_source_hash: 986f7658430c
i18n_provenance: machine
i18n_output_hash: 75b0e460c514
---

# Keamanan & Pengerasan {#security-hardening}

SnapOtter memproses file sepenuhnya di infrastruktur Anda. SnapOtter mengirim analitik produk dan laporan crash yang anonim serta bebas konten secara default untuk membantu meningkatkan proyek. SnapOtter tidak pernah mengirim file Anda, nama file, isi file, output OCR, metadata gambar, atau teks dokumen. Umpan balik opsional dikirim hanya setelah pengguna mengirimkannya, hanya ketika analitik diaktifkan, dan bidang kontak disertakan hanya dengan persetujuan kontak eksplisit. Administrator dapat mematikan penangkapan analitik dan umpan balik dalam satu klik di bawah Settings > System > Privacy, tanpa rebuild diperlukan. Pemrosesan file selalu tetap di dalam kontainer Anda.

Kontainer berjalan sebagai pengguna non-root khusus (`snapotter`) dengan semua kapabilitas Linux dihapus kecuali set minimum yang diperlukan. Untuk kebijakan pengungkapan kerentanan lengkap dan arsitektur keamanan, lihat [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di GitHub.

## Pengerasan Kontainer {#container-hardening}

[docker-compose.yml default](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) menyertakan pengerasan keamanan produksi. Berikut rincian setiap opsi dan mengapa itu penting:

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

### Mengapa `no-new-privileges` Tidak Diatur {#why-no-new-privileges-is-not-set}

`security_opt: [no-new-privileges:true]` sengaja dihilangkan. Entrypoint mulai sebagai root untuk memperbaiki kepemilikan volume, lalu turun ke pengguna `snapotter` melalui [gosu](https://github.com/tianon/gosu), yang membutuhkan setuid. Setelah penurunan hak istimewa selesai, proses berjalan sebagai `snapotter` dengan semua kapabilitas kecuali lima yang tercantum di atas dihapus.

Jika Anda menggunakan Kubernetes atau flag `--user` Docker untuk berjalan sebagai non-root secara langsung (melewati gosu), `no-new-privileges` aman untuk diaktifkan.

### Mengapa `read_only` Tidak Diatur {#why-read-only-is-not-set}

`read_only: true` tidak diatur karena remapping PUID/PGID menulis ke `/etc/passwd` dan `/etc/group` saat startup. Jika Anda menggunakan flag `--user` Docker atau `runAsUser` Kubernetes alih-alih PUID/PGID, Anda dapat mengaktifkan filesystem root read-only dengan aman.

## Isolasi Jaringan {#network-isolation}

Selama operasi normal, kontainer membuat **nol koneksi jaringan keluar**. Semua pemrosesan file terjadi secara lokal menggunakan pustaka yang disertakan.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Satu-satunya pengecualian adalah **unduhan model AI**: ketika pengguna memasang bundle fitur AI melalui UI, kontainer mengunduh arsip bundle yang telah dibangun sebelumnya dari Hugging Face, ditambah beberapa file model individual dari GitHub Releases, Google Storage, dan PyPI. Unduhan ini terjadi sekali per bundle dan disimpan di volume `/data`.

**Rekomendasi firewall:**

| Skenario | Aturan keluar |
|---|---|
| Air-gapped (tanpa AI) | Blokir semua lalu lintas keluar dari kontainer |
| Bundle AI diperlukan | Izinkan HTTPS ke `huggingface.co`, `*.xethub.hf.co`, `cdn-lfs.huggingface.co`, `github.com`, `objects.githubusercontent.com`, `storage.googleapis.com`, `pypi.org`, `files.pythonhosted.org` selama instalasi, lalu blokir |
| Setelah instalasi AI | Blokir semua lalu lintas keluar, model di-cache secara lokal |

Arsip bundle disajikan dari penyimpanan Xet Hugging Face, yang mentransfer melalui endpoint `*.xethub.hf.co` secara paralel dan itulah yang membuat unduhan bundle multi-GB cepat. Jika firewall Anda mengizinkan `huggingface.co` tetapi memblokir `*.xethub.hf.co`, instalasi tetap berhasil tetapi kembali ke unduhan single-stream yang lebih lambat, jadi masukkan host Xet ke allowlist agar tetap di jalur cepat. Instalasi sepenuhnya offline dapat melewati semua ini dan menggunakan [Impor Bundle Offline](/id/guide/deployment) sebagai gantinya.

Untuk konfigurasi reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), lihat [panduan Deployment](/id/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Untuk deployment produksi, hindari meneruskan secret sebagai variabel lingkungan teks biasa. Entrypoint mendukung konvensi `_FILE` Docker: mount sebuah secret sebagai file dan atur variabel `_FILE` yang sesuai ke path-nya.

**Secret yang didukung:**

| Variabel | Setara `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Contoh dengan secret Docker Compose:**

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
Secret Docker Compose (tanpa Swarm) membutuhkan Compose v2.23 atau lebih baru.
:::

## Deployment Kubernetes {#kubernetes-deployment}

Entrypoint mendeteksi ketika kontainer sudah berjalan sebagai non-root (misalnya, melalui `runAsUser` Kubernetes) dan melewati penurunan hak istimewa gosu secara otomatis. Dalam kasus itu ia tidak dapat chown volume yang di-mount sendiri, jadi ia memverifikasi bahwa volume dapat ditulis dan keluar lebih awal dengan panduan yang dapat ditindaklanjuti jika tidak, lihat [Izin penyimpanan](/id/guide/deployment#storage-permissions) untuk penyiapan `fsGroup` dan UID asing (TrueNAS, OpenShift).

**SecurityContext Pod yang direkomendasikan:**

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

Karena `runAsUser: 999` diatur pada tingkat pod, entrypoint melewati gosu sepenuhnya. Ini memungkinkan kapabilitas `allowPrivilegeEscalation: false` dan `drop: [ALL]` tanpa konflik.

Untuk penentuan ukuran sumber daya, lihat [Persyaratan Perangkat Keras](/id/guide/deployment#hardware-requirements).

## Pencadangan dan Pemulihan {#backup-and-recovery}

State persisten dibagi di dua volume:

| Volume | Isi | Kritis? |
|---|---|---|
| `SnapOtter-pgdata` | Basis data PostgreSQL (pengguna, pengaturan, pipeline, job, audit log) | Ya |
| `/data` (volume app) | File yang diunggah pengguna, model AI, venv Python | Sebagian (lihat di bawah) |

Di dalam volume `/data`:

| Path | Isi | Kritis? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | File pengguna dan hasil pemrosesan | Ya |
| `/data/ai/` | File model AI yang diunduh | Tidak (dapat diunduh ulang) |
| `/data/venv/` | Lingkungan virtual Python | Tidak (dibangun ulang saat start) |

### Pencadangan basis data {#database-backup}

Gunakan `pg_dump` untuk mencadangkan basis data selama stack berjalan:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Atau, hentikan stack dan buat snapshot volume `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Pencadangan file pengguna {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Model AI berjumlah hingga sekitar 24 GB di semua bundle. Karena dapat diunduh ulang, kecualikan `/data/ai/` dan `/data/venv/` dari pencadangan untuk menghemat ruang. Hanya basis data dan file pengguna yang kritis.

## Artefak Kepatuhan {#compliance-artifacts}

Setiap rilis SnapOtter menyertakan artefak keamanan berikut:

| Artefak | Format | Di mana menemukannya |
|---|---|---|
| SBOM (CycloneDX) | JSON | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Pemindaian kerentanan | Trivy JSON | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Pemindaian kerentanan | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analisis statis | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), berjalan mingguan + per PR |
| Tinjauan dependensi | GitHub native | Pemeriksaan per-PR, gagal pada penambahan severity tinggi |
| Audit dependensi Python | pip-audit | Log run CI pada setiap push |
| Kebijakan keamanan | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di repositori |
| Pembaruan dependensi | Dependabot | PR mingguan otomatis untuk npm, pip, Docker, Actions |

**Menjalankan pemindaian Anda sendiri:**

Unduh SBOM dari rilis dan pindai dengan perkakas pilihan Anda:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM dan pemindaian kerentanan mencerminkan image persis yang dipublikasikan untuk rilis itu. Bundle model AI yang dipasang setelah deployment tidak disertakan dalam SBOM karena diunduh saat runtime.
:::
