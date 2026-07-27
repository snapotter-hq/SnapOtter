---
description: "Panduan pengerasan keamanan untuk SnapOtter. Keamanan kontainer, isolasi jaringan, Docker secrets, deployment Kubernetes, dan artefak kepatuhan."
i18n_source_hash: 9ff337fa0417
i18n_provenance: machine
i18n_output_hash: d220b4fcee86
i18n_hash_version: 2
---

# Keamanan & Pengerasan {#security-hardening}

SnapOtter memproses file sepenuhnya di infrastruktur Anda. SnapOtter mengirim analitik produk dan laporan crash yang anonim serta bebas konten secara default untuk membantu meningkatkan proyek. SnapOtter tidak pernah mengirim file Anda, nama file, isi file, output OCR, metadata gambar, atau teks dokumen. Umpan balik opsional dikirim hanya setelah pengguna mengirimkannya, hanya ketika analitik diaktifkan, dan bidang kontak disertakan hanya dengan persetujuan kontak eksplisit. Administrator dapat mematikan penangkapan analitik dan umpan balik dalam satu klik di bawah Settings > System > Privacy, tanpa rebuild diperlukan. Pemrosesan file selalu tetap di dalam kontainer Anda.

Kontainer berjalan sebagai pengguna non-root khusus (`snapotter`) dengan semua kapabilitas Linux dihapus kecuali set minimum yang diperlukan. Untuk kebijakan pengungkapan kerentanan lengkap dan arsitektur keamanan, lihat [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di GitHub.

## Pengerasan Kontainer {#container-hardening}

File Compose [CPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose.yml) dan [GPU](https://github.com/snapotter-hq/SnapOtter/blob/main/docker/docker-compose-gpu.yml) kanonik adalah sumber kebenarannya. Jangan menyalin contoh yang disingkat ke dalam produksi; menyebarkan file dari tag rilis yang Anda verifikasi.

Kedua tumpukan menerapkan kontrol berikut:

- Batas memori, swap, CPU, dan PID berisi pemrosesan asli yang tidak terkendali.
- Setiap layanan menghilangkan semua kemampuan Linux. Aplikasi hanya menambahkan kembali `CHOWN, SETUID, SETGID, DAC_OVERRIDE, FOWNER, KILL` untuk kepemilikan volume, penurunan identitas `gosu` satu arah, dan penerusan sinyal yang baik. PostgreSQL dan Redis hanya menerima subset yang dibutuhkan oleh titik masuk resmi mereka.
- `security_opt: [no-new-privileges:true]` mencegah proses dalam aplikasi, PostgreSQL, dan kontainer Redis mendapatkan hak istimewa tambahan. Ini tetap kompatibel dengan `gosu`: titik masuk dimulai sebagai root, menyiapkan volume, dan hanya turun ke pengguna `snapotter` khusus.
- Input gambar PostgreSQL dan Redis disematkan oleh intisari. Aplikasi juga harus disematkan ke tag rilis atau intisari yang terverifikasi, bukan `latest`.
- Pemeriksaan kesehatan, rotasi log JSON yang dibatasi, Redis AOF yang tahan lama, dan kebijakan mulai ulang ditentukan secara terpusat dalam file kanonik.

Untuk penerapan yang terhubung ke internet, ikat port 1349 ke loopback dan akhiri TLS pada proksi terbalik yang dikelola. Hasilkan kredensial PostgreSQL dan Redis yang unik, simpan rahasia dalam file yang dilindungi atau manajer rahasia, dan segera ubah kata sandi administrator awal.

### Mengapa `read_only` Tidak Disetel {#why-read-only-is-not-set}

`read_only: true` tidak disetel karena pemetaan ulang PUID/PGID menulis ke `/etc/passwd` dan `/etc/group` saat startup. Jika Anda menggunakan flag `--user` Docker atau Kubernetes `runAsUser` dan bukan PUID/PGID, Anda dapat dengan aman mengaktifkan sistem file root read-only.

## Isolasi Jaringan {#network-isolation}

Pemrosesan file bersifat lokal, namun instalasi default **bukan sistem bebas jalan keluar**. Analisis produk anonim menggunakan PostHog dan pelaporan kerusakan menggunakan Sentry saat telemetri diaktifkan. Setel `SNAPOTTER_TELEMETRY=0` (atau nonaktifkan analitik pada Pengaturan > Sistem > Privasi) untuk mematikan keduanya. SnapOtter tidak pernah menyertakan file yang diunggah, nama file, output OCR, teks dokumen, atau konten file lainnya dalam acara tersebut.

Lalu lintas keluar lainnya didorong oleh fitur: unduhan instalasi bundel/model AI, input rilis yang ditandatangani; Impor URL mengambil URL publik yang diminta pengguna; dan OIDC, SAML, OpenTelemetry, webhook, penyimpanan yang kompatibel dengan S3, atau integrasi serupa yang dikonfigurasi secara eksplisit, hubungi tujuan yang dipilih oleh administrator. Pengunduhan model saat runtime dinonaktifkan secara default. Tetapkan `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=1` hanya untuk mengaktifkan pengunduhan fallback otomatis secara eksplisit. [Impor paket offline](/id/guide/deployment) dapat menyediakan fitur AI tanpa keluarnya model runtime.

**Rekomendasi firewall:**

|Skenario|Aturan keluar|
|---|---|
|Celah udara|Setel `SNAPOTTER_TELEMETRY=0` dan `SNAPOTTER_ALLOW_MODEL_DOWNLOAD=0`, gunakan impor bundel AI offline, nonaktifkan impor URL dan integrasi eksternal, lalu blokir jalan keluar|
|Telemetri bawaan|Izinkan titik akhir PostHog dan Sentry dicantumkan oleh log browser/jaringan Anda; nonaktifkan telemetri jika kebijakan tidak mengizinkannya|
|Paket AI diperlukan|Selama instalasi, izinkan HTTPS ke `huggingface.co, *.xethub.hf.co, cdn-lfs.huggingface.co, github.com, objects.githubusercontent.com, storage.googleapis.com, pypi.org, files.pythonhosted.org`; lalu blokir host tersebut|
|Integrasi eksternal|Izinkan hanya tujuan OIDC/SAML/OTLP/webhook/penyimpanan objek yang dikonfigurasikan oleh administrator|

Arsip bundel disajikan dari penyimpanan Xet Hugging Face, yang ditransfer melalui titik akhir `*.xethub.hf.co` secara paralel dan membuat pengunduhan bundel multi-GB menjadi cepat. Jika firewall Anda mengizinkan `huggingface.co` tetapi memblokir `*.xethub.hf.co`, penginstalan masih berhasil tetapi kembali ke pengunduhan aliran tunggal yang lebih lambat, jadi izinkan host Xet untuk tetap berada di jalur cepat. Penginstalan yang sepenuhnya offline dapat melewati semua ini dan menggunakan [Impor Paket Offline](/id/guide/deployment) sebagai gantinya.

Untuk konfigurasi proxy terbalik (Nginx, Traefik, Caddy, Cloudflare Tunnels), lihat [Panduan penerapan](/id/guide/deployment#reverse-proxy).

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

Tumpukan Compose produksi mendefinisikan empat volume. Hentikan ingress dan biarkan pekerjaan aktif selesai sebelum mengambil cadangan terkoordinasi sehingga PostgreSQL, Redis, dan status file menggambarkan titik waktu yang sama.

|Volume|Isi|Perawatan pemulihan|
|---|---|---|
|`SnapOtter-pgdata`|Pengguna PostgreSQL, pengaturan, saluran pipa, pekerjaan, metadata file, dan log audit|Kritis; gunakan dump logis cepat gagal untuk pemulihan portabel|
|`SnapOtter-data`|Objek perpustakaan yang disimpan, log, dan status AI (`/data/files, /data/logs, /data/ai, /data/ai/venv`)|Cadangkan seluruh volume; untuk menghemat ruang, dengan sengaja hilangkan semua status AI dan instal ulang bundelnya|
|`SnapOtter-redisdata`|Redis AOF untuk status antrean BullMQ yang tahan lama|Cadangkan setelah menjeda aplikasi dan memaksa `SAVE`; diperlukan untuk melanjutkan pekerjaan yang antri dengan tepat|
|`SnapOtter-workspace`|Kunci penyimpanan objek sementara (`/tmp/workspace/uploads, /tmp/workspace/outputs`)|Jangan membuat cadangan setelah semua pekerjaan dihentikan atau dibatalkan; jangan pernah membuangnya saat pekerjaan sedang aktif|

Biasanya menulis awalan nama volume dengan nama proyek. Selesaikan volume sumber sebenarnya dari kontainer yang terpasang alih-alih berasumsi bahwa nama tampilan seperti `SnapOtter-data` adalah nama volume Docker.

### Cadangan basis data {#database-backup}

Gunakan format arsip khusus PostgreSQL dan verifikasi arsip sebelum menganggap pencadangan selesai:

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

Uji setiap cadangan dengan mengembalikannya ke tumpukan terisolasi, memeriksa catatan database dan checksum file, dan memulai aplikasi. `tests/qa/backup-restore-drill.sh` repositori mengotomatiskan gerbang rilis tersebut terhadap `QA_IMAGE` eksplisit.

Jika platform Anda mengambil snapshot volume yang konsisten dengan error, hentikan seluruh tumpukan terlebih dahulu dan ambil snapshot semua volume penting sebagai satu set. Salinan direktori data PostgreSQL mentah dari kontainer yang berjalan bukan merupakan cadangan logis yang didukung.

### File dan antrian cadangan {#file-and-queue-backup}

Jeda aplikasi sebelum mengambil file dan volume antrian. Gunakan `docker inspect` untuk menyelesaikan nama volume sebenarnya, memaksa Redis untuk mempertahankan kondisinya saat ini, dan mengarsipkan dengan kepemilikan dan izin yang dipertahankan:

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

Mulai ulang Redis sebelum aplikasi. Jika Anda sengaja mengecualikan `/data/ai`, hapus seluruh subpohon AI daripada mempertahankan data `installed.json` tanpa model atau lingkungan virtualnya. Jaga agar file cadangan tetap terenkripsi, dikontrol aksesnya, dan terpisah dari host yang menjalankan SnapOtter.

## Artefak Kepatuhan {#compliance-artifacts}

Setiap rilis SnapOtter menyertakan artefak keamanan berikut:

| Artefak | Format | Di mana menemukannya |
|---|---|---|
| Lepaskan pengikatan subjek | Pengesahan kanonik JSON + GitHub | [Rilis GitHub](https://github.com/snapotter-hq/SnapOtter/releases) aset: `snapotter-v{version}-release-subjects.json` |
| Arsip SBOM | CycloneDX dan SPDX JSON | Rilis aset: `snapotter-v{version}-archive-linux-{arch}-sbom.{cdx,spdx}.json` |
| Gambar SBOM | CycloneDX dan SPDX JSON | Rilis aset: `snapotter-v{version}-image-linux-{arch}-sbom.{cdx,spdx}.json` |
| Pemindaian kerentanan | Trivy JSON | Rilis aset dengan awalan `archive-linux-{arch}` atau `image-linux-{arch}` yang cocok |
| Pemindaian kerentanan | SARIF | Tab [GitHub Keamanan](https://github.com/snapotter-hq/SnapOtter/security). |
| Analisis statis | CodeQL (JS/TS + Python) | Tab [GitHub Security](https://github.com/snapotter-hq/SnapOtter/security), berjalan mingguan + per PR |
| Tinjauan ketergantungan | GitHub asli | Pemeriksaan per-PR, gagal pada penambahan dengan tingkat keparahan tinggi |
| Audit ketergantungan Python | pip-audit | CI menjalankan log pada setiap dorongan |
| Kebijakan keamanan | Markdown | [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md) di repositori |
| Pembaruan ketergantungan | Dependabot | PR mingguan otomatis untuk npm, pip, Docker, Actions |

**Menjalankan pemindaian Anda sendiri:**

Unduh manifes subjek rilis dan verifikasi bahwa manifes tersebut dibuktikan oleh alur kerja rilis:

```bash
gh attestation verify snapotter-v2.2.0-release-subjects.json \
  --repo snapotter-hq/SnapOtter \
  --signer-workflow snapotter-hq/SnapOtter/.github/workflows/release.yml
```

Manifes mencatat `releaseTag`, `releaseCommit`, dan `workflowTriggerCommit` secara terpisah. Verifikasi bahwa `releaseCommit` adalah komit yang dikupas dari tag yang tidak dapat diubah, lalu verifikasi intisari SHA-256 dari arsip, gambar, SBOM, atau pindaian yang Anda gunakan terhadap entri di `subjects`. Perbedaan ini disengaja: memeriksa komit rilis yang baru dibuat tidak mengubah identitas komit dalam kredensial OIDC alur kerja.

Anda juga dapat memindai SBOM atau gambar yang diunduh secara langsung:

```bash
# Scan with Grype using the CycloneDX SBOM
grype sbom:snapotter-v2.2.0-image-linux-amd64-sbom.cdx.json

# Scan with Trivy using the SPDX SBOM
trivy sbom snapotter-v2.2.0-image-linux-amd64-sbom.spdx.json

# Scan the Docker image directly
trivy image snapotter/snapotter:2.2.0
```

::: info
Gambar SBOMs dan pindaian mencerminkan gambar spesifik arsitektur yang dipublikasikan untuk rilis tersebut. Arsip SBOMs dan pindaian menjelaskan arsip bawaan secara terpisah. Bundel model AI yang diinstal setelah penerapan tidak disertakan dalam SBOMs ini karena diunduh saat runtime.
:::
