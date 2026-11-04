---
description: "Panduan hardening keamanan untuk SnapOtter. Keamanan container, isolasi jaringan, Docker secrets, deployment Kubernetes, dan artefak kepatuhan."
i18n_source_hash: 630381c08cde
i18n_provenance: machine
i18n_output_hash: a494793b6bd6
i18n_hash_version: 2
---

# Keamanan & Hardening {#security-hardening}

SnapOtter memproses file sepenuhnya di infrastruktur Anda. Secara default SnapOtter mengirim analitik produk dan laporan crash yang anonim dan tanpa konten untuk membantu meningkatkan proyek. SnapOtter tidak pernah mengirim file, nama file, isi file, output OCR, metadata gambar, atau teks dokumen Anda. Umpan balik opsional hanya dikirim setelah pengguna mengirimkannya, hanya ketika analitik diaktifkan, dan kolom kontak hanya disertakan dengan persetujuan kontak yang eksplisit. Administrator dapat mematikan analitik dan pengumpulan umpan balik dengan satu klik di Settings > System > Privacy, tanpa perlu build ulang. Pemrosesan file selalu berada di dalam container Anda.

Container berjalan sebagai pengguna non-root khusus (`snapotter`) dengan semua kapabilitas Linux dihapus kecuali set minimum yang diperlukan. Untuk kebijakan pengungkapan kerentanan lengkap dan arsitektur keamanan, lihat [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di GitHub.

## Hardening Container {#container-hardening}

File Compose [CPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) dan [GPU](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose-gpu.yml) kanonis adalah sumber kebenaran. Jangan menyalin contoh ringkas ke produksi; deploy file dari tag rilis yang sudah Anda verifikasi.

Kedua stack menerapkan kontrol berikut:

- Batas memori, swap, CPU, dan PID menahan pemrosesan native yang lepas kendali.
- Setiap layanan menghapus semua kapabilitas Linux. Aplikasi hanya menambahkan kembali `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` untuk kepemilikan volume, penurunan identitas `gosu` satu arah, dan penerusan sinyal yang halus. PostgreSQL dan Redis hanya menerima subset yang dibutuhkan entrypoint resmi mereka.
- `security_opt: [no-new-privileges:true]` mencegah proses di container aplikasi, PostgreSQL, dan Redis memperoleh hak istimewa tambahan. Ini tetap kompatibel dengan `gosu`: entrypoint dimulai sebagai root, menyiapkan volume, dan hanya turun ke pengguna `snapotter` khusus.
- Input image PostgreSQL dan Redis disematkan berdasarkan digest. Aplikasi juga sebaiknya disematkan ke tag rilis atau digest yang terverifikasi, bukan `latest`.
- Health check, rotasi log JSON terbatas, Redis AOF yang tahan lama, dan kebijakan restart didefinisikan secara terpusat di file kanonis.

Untuk deployment yang menghadap internet, bind port 1349 ke loopback dan akhiri TLS di reverse proxy yang dirawat. Buat kredensial PostgreSQL dan Redis yang unik, simpan secret di file yang dilindungi atau secret manager, dan ganti password administrator awal segera.

### Mengapa `read_only` Tidak Diatur {#why-read-only-is-not-set}

`read_only: true` tidak diatur karena pemetaan ulang PUID/PGID menulis ke `/etc/passwd` dan `/etc/group` saat startup. Jika Anda menggunakan flag `--user` Docker atau `runAsUser` Kubernetes sebagai ganti PUID/PGID, Anda dapat dengan aman mengaktifkan filesystem root read-only.

## Isolasi Jaringan {#network-isolation}

Pemrosesan file bersifat lokal, tetapi instalasi default **bukan sistem tanpa egress**. Analitik produk anonim menggunakan PostHog dan pelaporan crash menggunakan Sentry ketika telemetri diaktifkan. Atur `SNAPOTTER_TELEMETRY=0` (atau nonaktifkan analitik di Settings > System > Privacy) untuk mematikan keduanya. SnapOtter tidak pernah menyertakan file yang diunggah, nama file, output OCR, teks dokumen, atau isi file lainnya dalam event tersebut.

Lalu lintas keluar lainnya bergantung pada fitur: instalasi bundle/model AI mengunduh input rilis bertanda tangan; impor URL mengambil URL publik yang diminta pengguna; dan integrasi yang dikonfigurasi secara eksplisit seperti OIDC, SAML, OpenTelemetry, webhook, penyimpanan yang kompatibel dengan S3, atau yang serupa menghubungi tujuan yang dipilih administrator. Unduhan model saat runtime dinonaktifkan secara default. Atur `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` hanya untuk memilih ikut secara eksplisit dalam unduhan fallback otomatis. [Impor bundle offline](/id/guide/deployment) dapat menyediakan fitur AI tanpa egress model saat runtime.

**Rekomendasi firewall:**

| Skenario | Aturan outbound |
|---|---|
| Air-gapped | Atur `SNAPOTTER_TELEMETRY=0` dan `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, gunakan impor bundle AI offline, nonaktifkan impor URL dan integrasi eksternal, lalu blokir egress |
| Telemetri default | Izinkan endpoint PostHog dan Sentry yang tercantum di log browser/jaringan Anda; nonaktifkan telemetri jika kebijakan tidak mengizinkannya |
| Bundle AI diperlukan | Selama instalasi, izinkan HTTPS ke `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; lalu blokir host tersebut |
| Integrasi eksternal | Izinkan hanya tujuan OIDC/SAML/OTLP/webhook/object-storage yang persis dikonfigurasi administrator |

Arsip bundle dilayani dari penyimpanan Xet milik Hugging Face, yang mentransfer melalui endpoint `*.xethub.hf.co` secara paralel dan membuat unduhan bundle multi-GB menjadi cepat. Jika firewall Anda mengizinkan `huggingface.co` tetapi memblokir `*.xethub.hf.co`, instalasi tetap berhasil tetapi beralih ke unduhan single-stream yang lebih lambat, jadi masukkan host Xet ke allowlist agar tetap di jalur cepat. Instalasi yang sepenuhnya offline dapat melewati semua ini dan menggunakan [Impor Bundle Offline](/id/guide/deployment).

Untuk konfigurasi reverse proxy (Nginx, Traefik, Caddy, Cloudflare Tunnels), lihat [panduan Deployment](/id/guide/deployment#reverse-proxy).

## Docker Secrets {#docker-secrets}

Untuk deployment produksi, hindari memberikan secret sebagai variabel lingkungan teks biasa. Entrypoint mendukung konvensi `_FILE` Docker: mount secret sebagai file dan atur variabel `_FILE` yang sesuai ke path-nya.

**Secret yang didukung:**

| Variabel | Padanan `_FILE` |
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
Secret Docker Compose (tanpa Swarm) memerlukan Compose v2.23 atau yang lebih baru.
:::

## Deployment Kubernetes {#kubernetes-deployment}

Entrypoint mendeteksi ketika container sudah berjalan sebagai non-root (misalnya melalui `runAsUser` Kubernetes) dan otomatis melewati penurunan hak istimewa gosu. Dalam kasus itu entrypoint tidak dapat menjalankan chown pada volume yang di-mount sendiri, jadi entrypoint memverifikasi volume dapat ditulis dan keluar lebih awal dengan panduan yang dapat ditindaklanjuti jika tidak, lihat [Izin penyimpanan](/id/guide/deployment#storage-permissions) untuk `fsGroup` dan setup UID asing (TrueNAS, OpenShift).

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

Karena `runAsUser: 999` diatur di tingkat pod, entrypoint melewati gosu sepenuhnya. Ini memungkinkan kapabilitas `allowPrivilegeEscalation: false` dan `drop: [ALL]` tanpa konflik.

Untuk ukuran sumber daya, lihat [Kebutuhan Perangkat Keras](/id/guide/deployment#hardware-requirements).

## Backup dan Pemulihan {#backup-and-recovery}

Stack Compose produksi mendefinisikan empat volume. Hentikan ingress dan biarkan job aktif selesai sebelum mengambil backup terkoordinasi agar PostgreSQL, Redis, dan status file menggambarkan titik waktu yang sama.

| Volume | Isi | Perlakuan pemulihan |
|---|---|---|
| `SnapOtter-pgdata` | Pengguna, pengaturan, pipeline, job, metadata file, dan log audit PostgreSQL | Kritis; gunakan dump logis fail-fast untuk pemulihan portabel |
| `SnapOtter-data` | Objek pustaka tersimpan, log, dan status AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`) | Backup seluruh volume; untuk menghemat ruang, sengaja abaikan semua status AI dan instal ulang bundle-nya |
| `SnapOtter-redisdata` | Redis AOF untuk status antrean BullMQ yang tahan lama | Backup setelah menjeda aplikasi dan memaksa `SAVE`; diperlukan untuk melanjutkan pekerjaan yang mengantre persis seperti semula |
| `SnapOtter-workspace` | Kunci object-storage sementara (`/tmp/workspace/uploads, /tmp/workspace/outputs`) | Jangan di-backup setelah semua job dikuras atau dibatalkan; jangan pernah dibuang selama job masih aktif |

Compose biasanya memberi awalan nama proyek pada nama volume. Resolusikan volume sumber yang sebenarnya dari container yang ter-mount, jangan mengasumsikan bahwa nama tampilan seperti `SnapOtter-data` adalah nama volume Docker.

### Backup database {#database-backup}

Gunakan format arsip kustom PostgreSQL dan verifikasi arsip sebelum menganggap backup selesai:

```bash
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore only into a fresh/disposable target first; any SQL error fails the command.
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Uji setiap backup dengan memulihkannya ke stack yang terisolasi, memeriksa record database dan checksum file, lalu menjalankan aplikasi. `tests/qa/backup-restore-drill.sh` di repositori mengotomatiskan gerbang rilis tersebut terhadap `QA_IMAGE` yang eksplisit.

Jika platform Anda mengambil snapshot volume yang konsisten saat crash, hentikan seluruh stack terlebih dahulu dan ambil snapshot semua volume kritis sebagai satu set. Salinan mentah direktori data PostgreSQL dari container yang sedang berjalan bukan backup logis yang didukung.

### Backup file dan antrean {#file-and-queue-backup}

Jeda aplikasi sebelum menangkap volume file dan antrean. Gunakan `docker inspect` untuk meresolusi nama volume yang sebenarnya, paksa Redis menyimpan status saat ini, dan arsipkan dengan kepemilikan dan izin tetap terjaga:

```bash
docker stop SnapOtter
docker exec SnapOtter-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning SAVE
docker stop SnapOtter-redis

DATA_VOLUME="$(docker inspect SnapOtter --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
REDIS_VOLUME="$(docker inspect SnapOtter-redis --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"

install -d -m 700 backup
docker run --rm -v "$DATA_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-data.tar.gz -C /source .
docker run --rm -v "$REDIS_VOLUME:/source:ro" -v "$PWD/backup:/backup" \
  alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce tar czf /backup/snapotter-redis.tar.gz -C /source .
sha256sum backup/snapotter-*.tar.gz > backup/SHA256SUMS
```

Mulai ulang Redis sebelum aplikasi. Jika Anda sengaja mengecualikan `/data/ai`, hapus seluruh subtree AI alih-alih mempertahankan record `installed.json` tanpa model atau virtual environment-nya. Simpan file backup terenkripsi, dengan kontrol akses, dan terpisah dari host yang menjalankan SnapOtter.

## Artefak Kepatuhan {#compliance-artifacts}

Setiap rilis SnapOtter menyertakan artefak keamanan berikut:

| Artefak | Format | Lokasi |
|---|---|---|
| Pengikatan subjek rilis | JSON kanonis + atestasi GitHub | Aset [GitHub Release](https://github.com/snapotter-hq/SnapOtter/releases): `snapotter-v{version}-release-subjects.json` |
| SBOM arsip | CycloneDX dan SPDX JSON | Aset rilis: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| SBOM image | CycloneDX dan SPDX JSON | Aset rilis: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Pemindaian kerentanan | Trivy JSON | Aset rilis dengan awalan `archive-linux-{arch}` atau `image-linux-{arch}` yang cocok |
| Pemindaian kerentanan | SARIF | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security) |
| Analisis statis | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), berjalan mingguan + per PR |
| Tinjauan dependensi | GitHub native | Pemeriksaan per-PR, gagal pada penambahan dengan tingkat keparahan tinggi |
| Audit dependensi Python | pip-audit | Log eksekusi CI pada setiap push |
| Kebijakan keamanan | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di repositori |
| Pembaruan dependensi | Dependabot | PR mingguan otomatis untuk npm, pip, Docker, Actions |

**Menjalankan pemindaian sendiri:**

Unduh manifes release-subject dan verifikasi bahwa manifes itu diatestasi oleh workflow rilis:

```bash
gh attestation verify snapotter-v2.3.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifes mencatat `releaseTag`, `releaseCommit`, dan `workflowTriggerCommit` secara terpisah. Verifikasi bahwa `releaseCommit` adalah commit yang dikupas dari tag immutable, lalu verifikasi digest SHA-256 dari arsip, image, SBOM, atau pemindaian yang Anda gunakan terhadap entrinya di `subjects`. Pembedaan ini disengaja: meng-checkout commit rilis yang baru dibuat tidak mengubah identitas commit pada kredensial OIDC workflow.

Anda juga dapat memindai SBOM yang diunduh atau image secara langsung:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.3.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.3.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.3.0
```

::: info 
SBOM dan pemindaian image mencerminkan image spesifik arsitektur persis yang diterbitkan untuk rilis tersebut. SBOM dan pemindaian arsip menggambarkan arsip prebuilt secara terpisah. Bundle model AI yang diinstal setelah deployment tidak disertakan dalam SBOM ini karena diunduh saat runtime.
:::
