---
description: "Panduan pengerasan keamanan untuk SnapOtter. Keamanan container, isolasi jaringan, Docker secrets, deployment Kubernetes, dan artefak kepatuhan."
i18n_source_hash: c682d19a84ce
i18n_provenance: human
i18n_output_hash: 30260caa800b
---

# Keamanan & Pengerasan {#security-hardening}

SnapOtter memproses file sepenuhnya di infrastruktur Anda. Secara default, SnapOtter mengirim analitik produk yang anonim dan tanpa konten serta laporan crash untuk membantu memperbaiki proyek. SnapOtter tidak pernah mengirim file, nama file, isi file, keluaran OCR, metadata gambar, atau teks dokumen Anda. Umpan balik opsional dikirim hanya setelah pengguna mengirimkannya, hanya ketika analitik diaktifkan, dan kolom kontak disertakan hanya dengan persetujuan kontak eksplisit. Administrator dapat mematikan pengumpulan analitik dan umpan balik dengan satu klik di Settings > System > Privacy, tanpa perlu build ulang. Pemrosesan file selalu tetap berada di dalam container Anda.

Container berjalan sebagai pengguna non-root khusus (`snapotter`) dengan semua kapabilitas Linux dihapus kecuali set minimum yang diperlukan. Untuk kebijakan pengungkapan kerentanan lengkap dan arsitektur keamanan, lihat [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di GitHub.

## Pengerasan Container {#container-hardening}

[docker-compose.yml default](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) menyertakan pengerasan keamanan untuk produksi. Berikut rincian setiap opsi dan alasan pentingnya:

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

`security_opt: [no-new-privileges:true]` sengaja dihilangkan. Entrypoint dimulai sebagai root untuk memperbaiki kepemilikan volume, lalu turun ke pengguna `snapotter` melalui [gosu](https://github.com/tianon/gosu), yang memerlukan setuid. Setelah penurunan hak istimewa selesai, proses berjalan sebagai `snapotter` dengan semua kapabilitas kecuali lima yang tercantum di atas dihapus.

Jika Anda menggunakan Kubernetes atau flag `--user` Docker untuk berjalan sebagai non-root secara langsung (melewati gosu), `no-new-privileges` aman untuk diaktifkan.

### Mengapa `read_only` Tidak Diatur {#why-read-only-is-not-set}

`read_only: true` tidak diatur karena remapping PUID/PGID menulis ke `/etc/passwd` dan `/etc/group` saat startup. Jika Anda menggunakan flag `--user` Docker atau Kubernetes `runAsUser` alih-alih PUID/PGID, Anda dapat dengan aman mengaktifkan filesystem root yang hanya-baca.

## Isolasi Jaringan {#network-isolation}

Selama operasi normal, container tidak membuat koneksi jaringan keluar sama sekali (**zero outbound network connections**). Semua pemrosesan file terjadi secara lokal menggunakan library bawaan.

```
Browser  -->  Reverse Proxy (TLS)  -->  SnapOtter container  -->  (nothing)
```

Satu-satunya pengecualian adalah **unduhan model AI**: ketika pengguna memasang bundle fitur AI melalui UI, container mengunduh file model dari GitHub Releases dan PyPI. Unduhan ini terjadi sekali per bundle dan disimpan di volume `/data`.

**Rekomendasi firewall:**

| Skenario | Aturan keluar |
|---|---|
| Air-gapped (tanpa AI) | Blokir semua lalu lintas keluar dari container |
| Bundle AI diperlukan | Izinkan HTTPS ke `github.com`, `objects.githubusercontent.com`, `pypi.org`, `files.pythonhosted.org` selama instalasi, lalu blokir |
| Setelah instalasi AI | Blokir semua lalu lintas keluar - model di-cache secara lokal |

Untuk konfigurasi reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), lihat [Panduan deployment](/id/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Untuk deployment produksi, hindari meneruskan secret sebagai variabel lingkungan teks biasa. Entrypoint mendukung konvensi `_FILE` Docker: mount sebuah secret sebagai file dan atur variabel `_FILE` terkait ke path-nya.

**Secret yang didukung:**

| Variabel | Ekuivalen `_FILE` |
|---|---|
| `DEFAULT_PASSWORD` | `DEFAULT_PASSWORD_FILE` |
| `COOKIE_SECRET` | `COOKIE_SECRET_FILE` |
| `OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET_FILE` |
| `S3_ACCESS_KEY_ID` | `S3_ACCESS_KEY_ID_FILE` |
| `S3_SECRET_ACCESS_KEY` | `S3_SECRET_ACCESS_KEY_FILE` |
| `SNAPOTTER_LICENSE_KEY` | `SNAPOTTER_LICENSE_KEY_FILE` |

**Contoh dengan Docker Compose secrets:**

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
Docker Compose secrets (tanpa Swarm) memerlukan Compose v2.23 atau yang lebih baru.
:::

## Deployment Kubernetes {#kubernetes-deployment}

Entrypoint mendeteksi ketika container sudah berjalan sebagai non-root (mis. melalui Kubernetes `runAsUser`) dan melewati penurunan hak istimewa gosu secara otomatis. Dalam kasus itu, entrypoint tidak dapat melakukan chown pada volume yang di-mount sendiri, sehingga ia memverifikasi bahwa volume tersebut dapat ditulisi dan keluar lebih awal dengan panduan yang dapat ditindaklanjuti jika tidak. Lihat [Izin penyimpanan](/id/guide/deployment#storage-permissions) untuk penyiapan `fsGroup` dan UID asing (TrueNAS, OpenShift).

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

Karena `runAsUser: 999` diatur pada level pod, entrypoint melewati gosu sepenuhnya. Ini memungkinkan kapabilitas `allowPrivilegeEscalation: false` dan `drop: [ALL]` tanpa konflik.

Untuk penentuan ukuran sumber daya, lihat [Persyaratan Perangkat Keras](/id/guide/deployment#hardware-requirements).

## Backup dan Pemulihan {#backup-and-recovery}

Status persisten terbagi di dua volume:

| Volume | Isi | Kritis? |
|---|---|---|
| `SnapOtter-pgdata` | Basis data PostgreSQL (pengguna, pengaturan, pipeline, job, audit log) | Ya |
| `/data` (volume aplikasi) | File yang diunggah pengguna, model AI, Python venv | Sebagian (lihat di bawah) |

Di dalam volume `/data`:

| Path | Isi | Kritis? |
|---|---|---|
| `/data/uploads/`, `/data/outputs/` | File pengguna dan hasil pemrosesan | Ya |
| `/data/ai/` | File model AI yang diunduh | Tidak (dapat diunduh ulang) |
| `/data/venv/` | Lingkungan virtual Python | Tidak (dibangun ulang saat start) |

### Backup basis data {#database-backup}

Gunakan `pg_dump` untuk mem-backup basis data saat stack sedang berjalan:

```bash
# Dump the database
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

Sebagai alternatif, hentikan stack dan buat snapshot volume `SnapOtter-pgdata`:

```bash
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Backup file pengguna {#user-files-backup}

```bash
# Snapshot the app data volume (excluding re-downloadable AI models)
docker run --rm -v SnapOtter-data:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-files.tar.gz \
    --exclude='ai' --exclude='venv' -C /data .
```

Model AI berjumlah total sekitar 24 GB di seluruh bundle. Karena dapat diunduh ulang, kecualikan `/data/ai/` dan `/data/venv/` dari backup untuk menghemat ruang. Hanya basis data dan file pengguna yang kritis.

## Artefak Kepatuhan {#compliance-artifacts}

Setiap rilis SnapOtter menyertakan artefak keamanan berikut:

| Artefak | Format | Tempat menemukannya |
|---|---|---|
| SBOM (CycloneDX) | JSON | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.cdx.json` |
| SBOM (SPDX) | JSON | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-sbom.spdx.json` |
| Pemindaian kerentanan | Trivy JSON | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-trivy.json` |
| Pemindaian kerentanan | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analisis statis | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), berjalan mingguan + per PR |
| Tinjauan dependensi | GitHub native | Pemeriksaan per-PR, gagal pada penambahan tingkat keparahan tinggi |
| Audit dependensi Python | pip-audit | Log run CI pada setiap push |
| Kebijakan keamanan | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di repositori |
| Pembaruan dependensi | Dependabot | PR mingguan otomatis untuk npm, pip, Docker, Actions |

**Menjalankan pemindaian Anda sendiri:**

Unduh SBOM dari rilis dan pindai dengan alat pilihan Anda:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v1.17.2-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v1.17.2-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:1.17.2
```

::: info 
SBOM dan pemindaian kerentanan mencerminkan image tepat yang dipublikasikan untuk rilis tersebut. Bundle model AI yang dipasang setelah deployment tidak disertakan dalam SBOM karena diunduh saat runtime.
:::
