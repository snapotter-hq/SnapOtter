---
description: "Stellen Sie SnapOtter mit Docker in der Produktion bereit. Hardwareanforderungen, GPU-Einrichtung und Reverse-Proxy-Konfigurationen für Nginx, Traefik und Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 7d546a38d98e
i18n_hash_version: 2
---

# Bereitstellung {#deployment}

SnapOtter wird als Docker-Compose-Stack mit drei Containern bereitgestellt: dem SnapOtter-App-Image, PostgreSQL 17 und Redis 8. Das App-Image unterstützt **linux/amd64** (mit NVIDIA CUDA für KI-Beschleunigung) und **linux/arm64** (CPU) und läuft damit nativ auf Intel/AMD-Servern, Apple-Silicon-Macs und ARM-Geräten wie dem Raspberry Pi 4/5. Eine Beschleunigung über Intel/AMD-iGPUs mittels VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt.

Siehe [Docker-Image](./docker-tags) für GPU-Einrichtung, Docker-Compose-Beispiele und Versionsfixierung.

## Schnellstart (CPU) {#quick-start-cpu}

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

Die App ist anschließend unter `http://localhost:1349` erreichbar.

Der obige Stack verbindet sich als Datenbankeigentümer. Ab SnapOtter 2.3.0 können Sie Anfragen über eine Rolle bedienen, die nur Zeilen lesen und schreiben darf; siehe [Rollen mit minimalen Rechten](./database#least-privilege-roles).

> **Docker-Hub-Ratenbegrenzungen?** Ersetzen Sie `snapotter/snapotter:latest` durch `ghcr.io/snapotter-hq/snapotter:latest`, um das Image stattdessen aus der GitHub Container Registry zu laden. Beide Registries erhalten bei jedem Release dasselbe Image.

## Schnellstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Für NVIDIA-CUDA-Beschleunigung bei unterstützten KI-Werkzeugen (Hintergrundentfernung, Hochskalierung, Gesichtsverbesserung):

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

### GPU-Beschleunigung überprüfen {#verify-gpu-acceleration}

Prüfen Sie in den Logs, ob CUDA erkannt wird:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Wenn KI-Werkzeuge auf der CPU laufen, obwohl `--gpus all` und das NVIDIA Container Toolkit korrekt eingerichtet sind, installieren Sie das betroffene Bundle (zum Beispiel Hintergrundentfernung) unter **Einstellungen → KI-Funktionen** neu. Das Installationsprogramm stellt den GPU-Build von ONNX Runtime wieder her, den ein CPU-only-Build, der von einem anderen Bundle (etwa der Transkription) eingebunden wurde, in der gemeinsamen KI-Umgebung sonst überdecken kann. Wenn die Neuinstallation über die Oberfläche bei einem älteren Image die GPU nicht wiederherstellt, finden Sie die manuelle Reparatur in [Issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Hardwareanforderungen {#hardware-requirements}

Diese Werte stammen aus Benchmarks auf verschiedenen Systemen, von einer modernen amd64-Workstation mit NVIDIA RTX 4070 bis hinunter zu einem Raspberry Pi. Auf jedem System wurde der gesamte Werkzeugkatalog ausgeführt und die Docker-Ressourcenlimits wurden variiert, um die tatsächliche Untergrenze zu ermitteln.

Betreiben Sie SnapOtter am unteren Ende dieser Stufen (Pi, altes Notebook, 2-GB-VPS)? [Ressourcenschonende Setups](/de/guide/low-resource) macht aus diesen Werten eine konkrete Anleitung mit abgestimmten Limits.

### Kurzübersicht {#quick-reference}

| Stufe | Einsatzzweck | CPU | RAM | GPU | Speicher |
|------|----------|-----|-----|-----|---------|
| Minimum | Nicht-KI-Werkzeuge (Bild, Dateien, einfaches PDF) plus integrierte schnelle OCR und Gesichtserkennung; ein Benutzer; kleine Batches | 2 Kerne | 2 GB | Keine | ~7 GB |
| Empfohlen | Alle fünf Modalitäten inkl. Video, PDF und Standard-KI-Bundles auf der CPU; Batches; einige Benutzer | 4 Kerne | 4 GB (8 GB für HQ-Inpainting) | Keine | ~25 GB |
| Voll | Alles mit voller Geschwindigkeit inkl. GPU-KI; große Batches; viele Benutzer | 6-8 Kerne | 8 GB | NVIDIA mit 8 GB+ VRAM (12 GB komfortabel) | ~35 GB |

**Architektur: nur 64 Bit** (`linux/amd64` oder `linux/arm64`). SnapOtter läuft nativ auf Intel/AMD-Servern, Apple-Silicon-Macs und 64-Bit-ARM-Boards, darunter der **Raspberry Pi 4 und 5** (4-8 GB). Es läuft **nicht** auf 32-Bit-ARM (`armv7`/`armhf`), da dafür kein Image gebaut wird, und auch nicht auf Boards der 512-MB-Klasse wie dem Pi Zero, die unter der Speicheruntergrenze liegen (siehe unten).

### Minimum (Bild-, Datei- und einfache PDF-Werkzeuge; keine KI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ressource | Anforderung |
|---|---|
| CPU | 2 Kerne |
| RAM | 2 GB |
| Festplatte | ~5,5 GB (Image) + Datenvolume |
| GPU | Nicht erforderlich |

Alle 222 Nicht-KI-Werkzeuge des Katalogs laufen auf bescheidener Hardware: Bild (Größe ändern, zuschneiden, konvertieren, komprimieren, anpassen, Wasserzeichen), Video (kürzen, stummschalten, Remux), Audio (konvertieren, normalisieren, kürzen), PDF (zusammenführen, teilen, komprimieren, drehen, schützen), Dateikonvertierungen und spezielle Konvertierungsvorgaben. Die meisten Vorgänge sind selbst bei großen Dateien in deutlich unter einer Sekunde erledigt: Ein Bild mit 2,7 MB wird in ~0,05 s skaliert und in ~2 s als WebP neu kodiert.

Die Speicheruntergrenze ist real, wie ein Docker-Ressourcenlimit-Test zeigt: **512 MB reichen nicht, um den Stack zu starten** (schon eine einzelne Bildskalierung wird beendet), **1 GB** bewältigt Einzeldateivorgänge, aber ein Batch mit mehreren Dateien läuft aus dem Speicher, und **2 GB / 2 Kerne** ist die kleinste Konfiguration, die Nicht-KI-Batches komfortabel verarbeitet. Die integrierte schnelle OCR und das Bundle `face-detection` passen ebenfalls in 2 GB, während die größeren KI-Bundles (Whisper, LaMa/DDColor, rembg, RealESRGAN, Fotorestaurierung und SD1.5-HQ-Inpainting) 4 bis 8 GB RAM benötigen und sofort abgelehnt werden, wenn der freie Speicher unter der Untergrenze des jeweiligen Bundles liegt.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Die einzige CPU-intensive Ausnahme ist die Neukodierung von Videos.** Stream-Copy-Vorgänge (kürzen, stummschalten, Container-Remux) sind sofort erledigt, die Transkodierung in einen anderen Codec ist dagegen CPU-gebunden. Ein 1080p-Clip von 45 Sekunden, der als VP9 (WebM) neu kodiert wird, benötigt auf einer schnellen modernen CPU etwa **~40 s**, auf Apple Silicon ~45 s, auf einem älteren mobilen 4-Kern-Prozessor ~80 s und auf einem älteren 4-Kern-Server **~130 s**. Wenn Ihre Last videolastig ist, priorisieren Sie CPU-Kerne und Taktfrequenz oder erhöhen Sie das Limit `cpus:` des Containers. Die mitgelieferte Compose-Datei begrenzt die App standardmäßig auf 4 Kerne (8 bei der GPU-Compose-Datei).

### Empfohlen (KI-Werkzeuge auf der CPU) {#recommended-ai-tools-on-cpu}

| Ressource | Anforderung |
|---|---|
| CPU | 4 Kerne |
| RAM | 4 GB |
| Festplatte | 3 GB (Image) + etwa 20 GB (alle optionalen KI-Pakete) + Arbeitsbereich |
| GPU | Nicht erforderlich (CPU-Fallback) |

**Die Installation und der Betrieb der größeren KI-Bundles treiben die Empfehlung auf 4 GB RAM.** Ohne installierte optionale Pakete liegt die App im Leerlauf bei etwa 360 MB. Ältere Python-Werkzeuge teilen sich einen Sidecar, während die genaue OCR einen eigenen langlebigen Dispatcher verwendet, der an die aktive unveränderliche Generation gebunden ist. Vor der Aktivierung führt das Installationsprogramm einen Smoke-Test des Kandidaten aus. Anschließend wechselt es atomar zum neuen Dispatcher und leert den vorherigen Dispatcher, bevor dieser bereinigt wird. Jedes offizielle Artefakt der genauen OCR muss seine Worst-Case-Release-Suite innerhalb einer 4-GiB-cgroup bestehen, während die Host-Empfehlung von 4 GB Spielraum für die Node.js-Anwendung, Postgres, Redis, Warteschlangen und parallele Arbeit lässt.

Die meisten KI-Werkzeuge sind auf der CPU gut nutzbar; einige benötigen wirklich eine GPU. Gemessen auf einer modernen 4-Kern-CPU:

| KI-Werkzeug | CPU-Zeit | Auf der CPU nutzbar? |
|---|---|---|
| Gesichtserkennung (blur-faces, smart-crop, red-eye), Rauschentfernung | unter 1 s | Ja |
| OCR, Transkription, Untertitel | 1-3 s | Ja |
| Kolorierung, Gesichtsverbesserung | ~10 s | Ja |
| Hintergrund entfernen / ersetzen / weichzeichnen | ~29 s | Ja (mit Wartezeit) |
| KI-Hochskalierung (RealESRGAN) | ~33 s bei kleinen, Minuten bei großen Bildern | Bedingt, GPU dringend empfohlen |
| Fotorestaurierung (komplette Pipeline) | mehrere Minuten | Nein, benötigt eine GPU oder eine schnelle CPU mit vielen Kernen |

SnapOtter packt diese Modell-Downloads absichtlich nicht in das Docker-Image. KI-Bundles werden erst geladen, wenn ein Administrator das zugehörige Werkzeug aktiviert, im persistenten Volume `/data/ai` gespeichert und von jedem Werkzeug gemeinsam genutzt, das vom selben Modellstack abhängt. So bleibt das fertige Container-Image klein, und eine vollständige KI-Installation kann dennoch die größeren Speicherwerte unten erreichen.

Einige Werkzeuge hängen von mehr als einem gemeinsamen Bundle ab. Passfoto benötigt zum Beispiel sowohl `background-removal` als auch `face-detection`; ist `background-removal` bereits installiert, lädt die Aktivierung von Passfoto nur das fehlende Bundle `face-detection` herunter. Dieselbe Wiederverwendung gilt für alle KI-Werkzeuge.

Speicherbedarf optionaler KI-Pakete und Speicheruntergrenzen der CPU (SnapOtter prüft den verfügbaren Speicher, bevor es an den Python-Sidecar übergibt, und lehnt Läufe unterhalb der Untergrenze für freien Speicher des Bundles sofort ab):

| Bundle | Größe auf der Festplatte | CPU-Speicheruntergrenze |
|---|---|---|
| Gesichtserkennung | 200-300 MB | 2 GB Host-RAM (~0,5 GB frei) |
| Transkription | ~600 MB | 4 GB Host-RAM (~2 GB frei) |
| Objektradierer + Kolorierung | 1-2 GB | 4 GB Host-RAM (~2 GB frei) |
| Genaue OCR (`balanced`/`best`) | ~208-234 MiB Download / ~409-488 MiB installiert | 4 GiB konfigurierter effektiver Speicher (`fast` läuft mit 2 GB) |
| Hintergrundentfernung | 4-5 GB | 4 GB Host-RAM (~2,5 GB frei) |
| Hochskalierung + Gesichtsverbesserung + Rauschentfernung | 5-6 GB | 4 GB Host-RAM (~2,5 GB frei) |
| Fotorestaurierung | 4-5 GB | 4 GB Host-RAM (~3 GB frei) |
| Hochwertiges Inpainting (`inpaint-hq`) | 5-7 GB | 8 GB Host-RAM (~6 GB frei) |
| **Alle Bundles** | **~25 GB installiert** | **4 GB (8 GB mit `inpaint-hq`)** |

Die schnelle OCR ist über Tesseract in das Image eingebaut, belegt etwa 25 MiB und benötigt weder das optionale OCR-Paket noch dessen Speicheranforderung von 4 GiB. Die schnelle OCR unterstützt `auto`, `en`, `de`, `es`, `fr`, `zh` und `ja`, nicht aber Koreanisch (`ko`) oder Arabisch (`ar`). Beide verwenden `balanced` oder `best` und erfordern daher das genaue Paket. Das genaue Paket ist in den offiziellen Linux-Containern für amd64 und arm64 verfügbar und führt ONNX Runtime auf der CPU aus. NVIDIA-Hosts nutzen dieselbe CPU-OCR-Laufzeit, sodass die OCR weder von der CUDA-Version noch von der GPU-Architektur abhängt. Die genaue Laufzeit benötigt mindestens 4 GiB effektiven Speicher: das konfigurierte cgroup-Limit des Containers, andernfalls den Host-Speicher. SnapOtter weist Systeme unterhalb dieses signierten Kompatibilitätsminimums ab, bevor das Paket heruntergeladen wird. Die Installation des genauen Pakets wird zudem auf Bare-Metal-/vorgefertigten Archiven abgelehnt, bei denen libc und Python-ABI nicht garantiert werden können. Auf diesen nicht unterstützten Hosts geben koreanische und arabische OCR einen eindeutigen Inkompatibilitätsfehler zurück und weichen nie stillschweigend auf die schnelle OCR aus.

Replikate, die sich dasselbe `DATA_DIR` teilen, müssen dieselbe CPU-Architektur verwenden; fixieren Sie Multi-Replikat-Deployments mit Node-Affinität. Gemischte amd64/arm64-Replikate benötigen getrennte Datenvolumes und unabhängige SnapOtter-Deployments.

Die genaue Laufzeit behält eine aktive Generation und leert nach der Aktivierung ihren Download-Cache. Für dieses Release benötigt eine Erstinstallation vorübergehend etwa 620-720 MiB für das Archiv plus Staging, und ein Upgrade kann bis auf etwa 1,2 GiB ansteigen, solange die alte Generation aktiv bleibt. Das Installationsprogramm berechnet den genauen Bedarf aus dem signierten Index und den aktuellen Generationen, bevor es herunterlädt oder entpackt, und bricht frühzeitig ab, wenn das Datenvolume zu klein ist.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Voll (KI-Werkzeuge auf NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ressource | Anforderung |
|---|---|
| CPU | 6-8 Kerne (Videovorbereitung und Parallelität laufen auch bei GPU-KI auf der CPU) |
| RAM | 8 GB |
| GPU | NVIDIA mit 8+ GB VRAM (12 GB empfohlen) |
| Festplatte | ~35 GB insgesamt |

Eine NVIDIA-GPU (CUDA) beschleunigt die aufwendigen KI-Modelle erheblich. Gemessen auf einer RTX 4070 im Vergleich zu einer modernen CPU:

| KI-Werkzeug | Beschleunigung mit GPU | Hinweise |
|---|---|---|
| KI-Hochskalierung (RealESRGAN 2×) | **~47×** | Der größte Gewinn: unter einer Sekunde gegenüber ~33 s (Minuten bei großen Bildern) |
| Gesichtsverbesserung (CodeFormer) | **~12×** | ~0,9 s gegenüber ~11 s |
| Transkription (Whisper) | ~4,5× | |
| Hintergrund entfernen / ersetzen / weichzeichnen | ~4× | ~7 s auf der GPU gegenüber ~29 s auf der CPU |
| Kolorierung | ~1,8× | |
| OCR, Gesichtserkennung, red-eye, Rauschentfernung | ~1× | Auf der CPU bereits schnell, eine GPU hilft nicht |
| Fotorestaurierung | keine | Auch auf einer GPU CPU-gebunden (0 % GPU-Auslastung); eine schnelle CPU ist hier wichtiger als eine GPU |

Eine GPU lohnt sich bei **Hochskalierung, Gesichtsverbesserung, Transkription und Hintergrundentfernung**. Gesichtserkennung, OCR und red-eye sind CPU-gebunden und bereits schnell, daher bringt eine GPU hier nichts.

Der VRAM-Spitzenverbrauch erreicht bei der Hochskalierung mit Gesichtsverbesserung 7,5 GB. Eine NVIDIA-GPU mit 6 GB funktioniert für die meisten KI-Werkzeuge einzeln, schlägt aber bei der Hochskalierung fehl. Mit 8-12 GB VRAM ist alles abgedeckt.

Eine Beschleunigung über Intel/AMD-iGPUs mittels VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Das Einbinden von `/dev/dri` in den Container aktiviert keine KI-GPU-Beschleunigung; SnapOtter führt KI-Werkzeuge auf der CPU aus, sofern NVIDIA CUDA nicht verfügbar ist.

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

### Gleichzeitige Benutzer {#concurrent-users}

Parallele Anfragen zur Bildskalierung gegen den standardmäßig auf 4 Kerne begrenzten App-Container:

| Gleichzeitige Anfragen | Durchschnittliche Antwortzeit | Fehler |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Die Antwortzeit verschlechtert sich unterlinear und ohne Fehler, während der Worker-Pool ausgelastet wird. Wenn Sie das Limit `cpus:` des App-Containers erhöhen (oder einen Host mit mehr Kernen verwenden), steigt die Obergrenze. Beachten Sie, dass aufwendige Aufträge (Video-Transkodierung, KI auf der CPU) einen Worker für ihre gesamte Dauer belegen. Dimensionieren Sie die CPU daher nach der erwarteten Zahl gleichzeitiger aufwendiger Aufträge, nicht nur nach der Anzahl der Anfragen.

### Unterstützte Bildformate {#supported-image-formats}

SnapOtter unterstützt **über 55 Eingabeformate** und **14 Ausgabeformate**, darunter RAW-Dateien von mehr als 20 Kameramarken, professionelle Formate (PSD, EPS, OpenEXR, HDR), moderne Codecs (JPEG XL, AVIF, HEIC, QOI) sowie wissenschaftliche und Gaming-Formate (FITS, DDS).

Details zu jedem unterstützten Format, dem verwendeten Decoder und den verfügbaren Qualitätsoptionen finden Sie in der [vollständigen Formatliste](/de/guide/supported-formats).

### Bekannte Einschränkungen {#known-limitations}

- **Inhaltsbewusstes Skalieren** stürzt bei großen Bildern (>5 MP) aufgrund einer Einschränkung der caire-Binärdatei ab. Bei kleineren Bildern funktioniert es einwandfrei.
- **HEIF-Dekodierung** dauert 13-23 Sekunden. HEIC (Apples Variante) ist mit 0,3-0,9 Sekunden deutlich schneller.
- **Hochskalierung** läuft auf der CPU bei allem, was über kleine Bilder hinausgeht, in ein Timeout. Für den praktischen Einsatz ist eine GPU erforderlich.
- Die Gesichtsverbesserung mit **CodeFormer** ist deutlich langsamer als GFPGAN (53 s gegenüber 2 s auf der GPU). GFPGAN wird für die meisten Anwendungsfälle empfohlen.

## Volumes {#volumes}

| Mount / Volume | Zweck | Erforderlich? |
|---|---|---|
| `/data` (App) | KI-Modelle, Python-venv, Benutzerdateien | **Ja**, ohne es gehen Dateien verloren |
| `/tmp/workspace` (App) | Temporäre Verarbeitungsdateien (automatisch bereinigt) | Empfohlen |
| `SnapOtter-pgdata` (postgres) | PostgreSQL-Datenverzeichnis (Benutzer, Einstellungen, Pipelines, Aufträge) | **Ja**, ohne es gehen Daten verloren |
| `SnapOtter-redisdata` (redis) | Redis-Append-Only-Datei für dauerhafte Job-Warteschlangen | Empfohlen |

### Bind-Mounts und benannte Volumes {#bind-mounts-vs-named-volumes}

**Benannte Volumes** (empfohlen): Docker verwaltet die Berechtigungen automatisch:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind-Mounts**: Sie verwalten die Berechtigungen selbst. Setzen Sie `PUID`/`PGID` passend zu Ihrem Host-Benutzer:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Speicherberechtigungen {#storage-permissions}

SnapOtter schreibt zur Laufzeit an zwei Orte: `/data` (Benutzerdateien, Logs, KI-Modelle und die Python-venv) und `/tmp/workspace` (temporärer Verarbeitungsspeicher). Beide müssen für den Benutzer beschreibbar sein, als der der Container läuft. Ist eines davon nicht beschreibbar, **bricht der Container beim Start sofort ab** und nennt in einer Meldung das Verzeichnis, die laufende UID/GID und die Behebung, anstatt "gesund" zu starten und dann beim ersten Upload mit einem kryptischen Fehler zu scheitern. Das Log-Verzeichnis (`LOG_DIR`, `/data/logs` im Image) wird in jedem Speichermodus auf dieselbe Weise geprüft, da Logs lokal bleiben, auch wenn Dateien in S3 liegen.

Wie Berechtigungen behandelt werden, hängt davon ab, wie der Container gestartet wird:

**Standard (Start als root, Wechsel zu `snapotter`)**: Der Entrypoint startet als root, korrigiert die Eigentümerschaft der eingebundenen Volumes und wechselt dann über `gosu` zum unprivilegierten Benutzer `snapotter`. Benannte Volumes funktionieren ohne Konfiguration. Setzen Sie bei Bind-Mounts `PUID`/`PGID` auf Ihren Host-Benutzer (siehe oben), damit die geschriebenen Dateien Ihnen gehören.

**Kubernetes / OpenShift (nicht-root über `runAsUser`)**: Wird der Container direkt als Nicht-root-Benutzer gestartet, kann er die Volumes nicht selbst per chown übernehmen, daher muss der Orchestrator sie beschreibbar machen. Setzen Sie `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Die beschreibbaren Verzeichnisse des Images gehören der Gruppe mit GID 0 und sind gruppenbeschreibbar. Ein Pod, der mit einer **beliebigen UID** plus der zusätzlichen root-Gruppe läuft (Standard bei OpenShift), kann daher ohne `chown` schreiben.

**TrueNAS Scale (und andere Setups mit "fremder UID")**: TrueNAS führt Apps als Nicht-root-Benutzer aus (oft `568:568`) und bindet Host-Datasets ein, die einem anderen Benutzer gehören. Weder der Entrypoint noch `fsGroup` machen sie daher von sich aus beschreibbar. Wählen Sie eine Möglichkeit:

- **App als root ausführen** (empfohlen): Lassen Sie den Benutzer der App ungesetzt oder setzen Sie ihn auf `0`, und lassen Sie den Standard-Entrypoint die Berechtigungen korrigieren und zu `snapotter` wechseln.
- **Als UID `999` ausführen**: Setzen Sie Benutzer/Gruppe der App auf `999:999` (den eingebauten Benutzer `snapotter` von SnapOtter), damit sie zur Eigentümerschaft im Image passt.
- **`chown` für das Host-Dataset** auf die UID, als die der Container läuft, über die TrueNAS-Shell:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Der Startfehler nennt die genaue zu verwendende UID. Am schnellsten starten Sie die App also einmal, lesen die Meldung und führen dann entsprechend `chown` aus (oder passen den Benutzer an).

## Umgebungsvariablen {#environment-variables}

| Variable | Standard | Beschreibung |
|---|---|---|
| `AUTH_ENABLED` | `true` | Anmeldepflicht aktivieren/deaktivieren |
| `DEFAULT_USERNAME` | `admin` | Benutzername des initialen Administrators |
| `DEFAULT_PASSWORD` | `admin` | Passwort des initialen Administrators (Änderung bei der ersten Anmeldung erzwungen) |
| `MAX_UPLOAD_SIZE_MB` | `0` (unbegrenzt) | Upload-Limit pro Datei in MB. Das Image liefert `0` aus; ein Quell-Build beginnt bei 100 |
| `MAX_BATCH_SIZE` | `0` (unbegrenzt) | Maximale Dateizahl pro Batch-Anfrage. Das Image liefert `0` aus; ein Quell-Build beginnt bei 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | API-Anfragen pro Minute und IP (0 setzen zum Deaktivieren) |
| `MAX_USERS` | `0` (unbegrenzt) | Maximale Anzahl an Benutzerkonten |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welche Peers die Client-IP über `X-Forwarded-For` setzen dürfen. Standardmäßig nur private Netzwerke |
| `PUID` | `999` | Mit dieser UID ausführen (für Bind-Mount-Berechtigungen) |
| `PGID` | `999` | Mit dieser GID ausführen (für Bind-Mount-Berechtigungen) |
| `LOG_LEVEL` | `info` | Log-Ausführlichkeit: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (automatisch) | Maximale Anzahl paralleler KI-Verarbeitungsaufträge |
| `SESSION_DURATION_HOURS` | `168` | Lebensdauer der Anmeldesitzung (7 Tage) |
| `CORS_ORIGIN` | (leer) | Kommagetrennte erlaubte Origins, oder leer für Same-Origin |

### Ausgehender Proxy und private CA {#outbound-proxy-and-private-ca}

Der offizielle Container aktiviert die Umgebungs-Proxy-Unterstützung von Node. Wenn SnapOtter das OCR-Laufzeit-Repository oder andere HTTPS-Dienste über einen Unternehmens-Proxy erreichen muss, setzen Sie `HTTPS_PROXY` (und bei Bedarf `HTTP_PROXY`). Setzen Sie `NO_PROXY` auf eine kommagetrennte Liste von Hosts, die direkt erreicht werden müssen, etwa Postgres, Redis und interner Objektspeicher.

Wenn der Proxy oder ein interner Dienst von einer privaten Zertifizierungsstelle signiert ist, binden Sie das CA-Zertifikat schreibgeschützt ein und verweisen Sie mit `NODE_EXTRA_CA_CERTS` darauf. Die Datei muss existieren, wenn der Node-Prozess startet:

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

Halten Sie die Proxy-Zugangsdaten außerhalb der Compose-Datei (zum Beispiel in einer geschützten `.env`-Datei oder einem Secret). Deaktivieren Sie die TLS-Überprüfung nicht: Der signierte OCR-Index authentifiziert die Release-Metadaten, während die normale TLS-Validierung weiterhin den Transport und jede andere ausgehende Anfrage schützt.

## Health-Check {#health-check}

Der Container enthält einen integrierten Health-Check:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse-Proxy {#reverse-proxy}

`TRUST_PROXY` ist standardmäßig `loopback,linklocal,uniquelocal`, sodass SnapOtter `X-Forwarded-For` nur von einem Peer in einem privaten Netzwerk glaubt. Ein Reverse-Proxy auf demselben Host, in einem Docker-Netzwerk oder in Ihrem LAN wird ab Werk als vertrauenswürdig behandelt. Ratenbegrenzung, der Brute-Force-Limiter bei der Anmeldung, das Audit-Log und die Enterprise-IP-Allowlist sehen daher ohne Konfiguration die echte Client-IP.

Setzen Sie `TRUST_PROXY=true` nur, wenn der vorgeschaltete Proxy SnapOtter von einer **öffentlichen** Adresse aus erreicht, etwa ein Cloud-Load-Balancer in einem anderen Netzwerk. Bei einer direkt erreichbaren Instanz macht dieser Wert `request.ip` vom Angreifer kontrollierbar, weil ein Aufrufer, der den Header rotiert, bei jeder Anfrage einen frischen Ratenbegrenzungs-Bucket erhält.

Zwei Dinge sollten Sie wissen, bevor Sie Client-IPs messen. Docker Desktop unter macOS und Windows stellt einen veröffentlichten Port über einen Userland-Proxy bereit, der jede Quelladresse auf das VM-Gateway `192.168.65.1` umschreibt, sodass dort kein Wert von `TRUST_PROXY` den echten Client wiederherstellt; setzen Sie für alles, was mit dem Internet verbunden ist, Linux ein. Und auf jeder Plattform wird der Zugriff auf einen veröffentlichten Port über `localhost` als Bridge-Gateway beobachtet und nicht als Ihr Client, sodass ein localhost-Test nichts darüber aussagt, wie ein echter Client zugeordnet wird. Die vollständige Tabelle der Werte von `TRUST_PROXY` und der Hinweis zu Docker Desktop stehen in [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Für jeden der folgenden Proxys sind zwei Dinge wichtig: Erlauben Sie große Request-Bodys (Uploads) und puffern Sie keine Antworten. Ein Proxy, der Antworten puffert, unterbricht den SSE-Fortschritt und führt, noch auffälliger, dazu, dass ein Download einer großen Datei "startet, aber nie fertig wird", weil der Proxy die gesamte Datei zurückhält, bevor er sie weitergibt. SnapOtter sendet bei Downloads `X-Accel-Buffering: no`, damit nginx sie streamt, selbst wenn das Puffern an anderer Stelle aktiv bleibt. Andere Proxys als nginx benötigen jedoch ein ausdrücklich deaktiviertes Puffern von Antworten (in jeder Konfiguration unten gezeigt). Wenn ein Download mittendrin hängen bleibt, ist ein vorgeschalteter puffernder Proxy das Erste, was Sie prüfen sollten.

Ein Hinweis zu HSTS: Die API sendet `Strict-Transport-Security` selbst bei jeder Antwort, sodass ein Proxy, der Antwort-Header durchreicht (alle Konfigurationen unten tun das), keine eigene HSTS-Einrichtung benötigt. Nur wenn Ihr Proxy so konfiguriert ist, dass er Antwort-Header des Upstreams entfernt oder überschreibt, müssen Sie den Header erhalten oder am Edge erneut hinzufügen.

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

### Bereitstellung unter einem Unterpfad {#subpath}

Um `https://example.com/snapotter` auszuliefern, setzen Sie `BASE_PATH=/snapotter` in der
Umgebung des SnapOtter-Containers und starten Sie ihn neu. Die offiziellen CPU- und GPU-Compose-Dateien
akzeptieren `BASE_PATH` auch aus Ihrer Shell oder Ihrer Compose-Datei `.env`. Dasselbe
Image funktioniert unter jedem Pfad; ein Neubau des Frontends ist nicht nötig.

`BASE_PATH` akzeptiert durch Schrägstriche getrennte Segmente, die Buchstaben, Ziffern, `_` oder
`-` enthalten, einschließlich verschachtelter Pfade wie `/apps/snapotter`. Ein abschließender Schrägstrich ist
optional. Lassen Sie den Wert leer (Standard) oder setzen Sie `/` für eine Bereitstellung im Stammpfad.

Verwenden Sie in Ihrem bestehenden Nginx-HTTPS-Server-Block Folgendes:

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

Dieses Beispiel behält das Präfix bei. Proxys, die `/snapotter` vor der
Weiterleitung entfernen, werden ebenfalls unterstützt. Interne Health-Checks können weiterhin
`/api/v1/health` verwenden. Für OIDC oder SAML setzen Sie außerdem
`EXTERNAL_URL=https://example.com/snapotter` und passen die Callback-URLs des Identity-Providers an, sodass sie `/snapotter/api/auth/oidc/callback` beziehungsweise
`/snapotter/api/auth/saml/callback` enthalten.

API-Skripte funktionieren unverändert weiter: URLs in API-Antworten, etwa das
`downloadUrl` eines Werkzeugs, beginnen mit `/api/`, unabhängig von `BASE_PATH`. Hängen Sie sie an die
Basis-URL Ihrer Instanz an (`https://example.com/snapotter` + `/api/v1/download/...`),
anstatt sie gegen den Domain-Stamm aufzulösen.

Öffnen Sie die Oberfläche über die URL mit Präfix (`https://example.com/snapotter`). Ein
Browser, der ohne das Präfix ankommt, wird automatisch dorthin weitergeleitet; nur API-Anfragen
sollen die App ohne Präfix erreichen. Wenn die Logs
`Requests arrive under /snapotter/ but BASE_PATH is empty` melden, leitet Ihr Proxy
ein Präfix weiter, das `BASE_PATH` nicht deklariert: Setzen Sie `BASE_PATH` darauf
oder entfernen Sie das Präfix am Proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Fügen Sie einen neuen Proxy-Host hinzu
2. Setzen Sie Domain Name auf Ihre Domain
3. Setzen Sie Scheme auf `http`, Forward Hostname auf `SnapOtter` (oder Ihre Container-IP) und Forward Port auf `1349`
4. Aktivieren Sie die WebSocket-Unterstützung
5. Fügen Sie unter Advanced hinzu: `client_max_body_size 500M;` und `proxy_buffering off;`

Der Header `Strict-Transport-Security` der API wird von NPM unverändert durchgereicht; der HSTS-Schalter auf dem Tab SSL ist darüber hinaus optional.

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

Traefik leitet Antwort-Header des Upstreams unverändert weiter, daher erreicht der Header `Strict-Transport-Security` der API die Browser ohne eine `headers`-Middleware. Wenn Sie bereits eine betreiben, die Antwort-Header umschreibt, stellen Sie sicher, dass sie diesen Header unangetastet lässt.

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

`flush_interval -1` deaktiviert das Puffern von Antworten. Das ist für SSE-Fortschrittsereignisse (Batch-Verarbeitung, KI-Werkzeuge, Funktionsinstallationen) und dafür erforderlich, dass große Dateidownloads gestreamt werden, statt zu hängen. Die verlängerten Timeouts erlauben es, große Datei-Uploads abzuschließen, ohne dass Caddy die Verbindung zu früh schließt. Caddy reicht außerdem den Header `Strict-Transport-Security` der API unangetastet durch, sodass für HSTS keine `header`-Direktive nötig ist.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Hinweis: Cloudflare begrenzt Uploads in kostenlosen Tarifen auf 100 MB. Setzen Sie `MAX_UPLOAD_SIZE_MB=100` entsprechend.

Der Tunnel leitet die Antwort-Header der API weiter, einschließlich `Strict-Transport-Security`, sodass keine HSTS-Konfiguration im Dashboard erforderlich ist (die HSTS-Einstellung am Cloudflare-Edge ist darüber hinaus optional).

## Fehlerbehebung {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" direkt nach einem fehlgeschlagenen ersten Start {#eai-again-after-failed-first-start}

Wenn der allererste `docker compose up -d` teilweise fehlschlägt (meist, weil ein Port bereits belegt ist), kann ein einfacher erneuter Versuch mit `up -d` den App-Container starten, ohne ihn an das Compose-Netzwerk anzuhängen. Die App gerät dann in eine Absturzschleife mit:

```
Postgres not reachable: EAI_AGAIN
```

während `docker ps` postgres als gesund anzeigt. Der Fehler ist real, verweist aber auf den falschen Container: Ohne das Netzwerk lässt sich der Hostname `postgres` per DNS überhaupt nicht auflösen, und die Neustart-Richtlinie wiederholt denselben Fehler endlos.

Beheben Sie, was den ersten Start gestört hat (meist: den Port freigeben), und erzwingen Sie dann die Neuerstellung des App-Containers, damit er sich wieder mit dem Netzwerk verbindet:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: von anderen Geräten erreichbar, nicht vom PC selbst {#windows-wsl2-loopback}

Wenn Docker innerhalb von WSL2 läuft (das übliche Windows-Setup), kann der Stack von allen anderen Rechnern in Ihrem Netzwerk erreichbar sein, während `http://localhost:1349` auf dem Windows-Host selbst in ein Timeout läuft, selbst wenn der gespiegelte Netzwerkmodus von WSL aktiviert ist. Der Port erscheint nie in `netstat` unter Windows, und an den Containern ist nichts falsch.

Öffnen Sie die App von einem anderen Gerät aus oder aus der Distribution heraus über deren eigene Adresse (`hostname -I` in der WSL-Shell). Wenn die Localhost-Weiterleitung bei Ihrer WSL-Version zufällig funktioniert, betrachten Sie das als Bonus und nicht als etwas, auf das Sie sich verlassen sollten.

## CI/CD {#ci-cd}

Das GitHub-Repository hat drei Workflows:

- **ci.yml** - Läuft automatisch bei jedem Push und PR. Führt Lint, Typecheck, Tests und Build aus und validiert das Docker-Image (ohne es zu pushen).
- **release.yml** - Wird manuell über `workflow_dispatch` ausgelöst. Führt semantic-release aus, um ein Versions-Tag und ein GitHub-Release zu erstellen, baut dann ein Multi-Arch-Docker-Image (amd64 + arm64) und pusht es zu Docker Hub (`snapotter/snapotter`) und zur GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Baut diese Dokumentationsseite und stellt sie bei einem Push auf `main` in Cloudflare Pages bereit.

Um ein Release zu erstellen, gehen Sie in der GitHub-Oberfläche zu **Actions > Release > Run workflow** oder führen Sie Folgendes aus:

```bash
gh workflow run release.yml
```

Semantic-release ermittelt die Version aus der Commit-Historie. Das Docker-Tag `latest` verweist immer auf das jüngste Release.

## Analysen {#analytics}

SnapOtter enthält anonyme Produktanalysen (Nutzungsmuster der Werkzeuge, Fehlerberichte), die helfen, Fehler zu finden und Funktionen zu verbessern. Sie sind standardmäßig aktiviert. Ihre Dateien, Dateinamen und personenbezogenen Daten sind nie Teil davon. SnapOtter funktioniert bei deaktivierten Analysen normal.

### Analysen deaktivieren {#disabling-analytics}

Das Opt-out zur Laufzeit ist ein Admin-Schalter mit einem Klick. Öffnen Sie Einstellungen > System > Datenschutz und schalten Sie Anonyme Produktanalysen aus. Das wirkt sofort für die gesamte Instanz, ein Neubau ist nicht erforderlich.

Für ein Image, das niemals Analysen senden kann, setzen Sie den dauerhaften Build-Time-Aus-Schalter, indem Sie das Repository klonen und neu bauen:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Oder fügen Sie das Build-Argument zu Ihrer bestehenden `docker-compose.yml` hinzu:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```