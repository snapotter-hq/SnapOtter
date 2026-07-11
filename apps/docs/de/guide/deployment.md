---
description: "SnapOtter mit Docker in die Produktion bringen. Hardware-Anforderungen, GPU-Einrichtung und Reverse-Proxy-Konfigurationen für Nginx, Traefik und Cloudflare."
i18n_source_hash: 6b6957060fa6
i18n_provenance: machine
i18n_output_hash: 07c771bca730
---

# Deployment {#deployment}

SnapOtter wird als Docker-Compose-Stack aus 3 Containern bereitgestellt: dem SnapOtter-App-Image, PostgreSQL 17 und Redis 8. Das App-Image unterstützt **linux/amd64** (mit NVIDIA CUDA für KI-Beschleunigung) und **linux/arm64** (CPU), sodass es nativ auf Intel/AMD-Servern, Apple-Silicon-Macs und ARM-Geräten wie dem Raspberry Pi 4/5 läuft. Intel/AMD-iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt.

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

Die App ist dann unter `http://localhost:1349` erreichbar.

> **Docker-Hub-Ratenbegrenzungen?** Ersetze `snapotter/snapotter:latest` durch `ghcr.io/snapotter-hq/snapotter:latest`, um stattdessen aus der GitHub Container Registry zu ziehen. Beide Registries erhalten bei jedem Release dasselbe Image.

## Schnellstart (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Für NVIDIA-CUDA-Beschleunigung bei KI-Tools (Hintergrundentfernung, Hochskalierung, Gesichtsverbesserung, OCR):

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

Prüfe die CUDA-Erkennung in den Logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Hardware-Anforderungen {#hardware-requirements}

Diese Werte stammen aus Benchmarks über eine Reihe von Systemen hinweg, von einer modernen amd64-Workstation mit einer NVIDIA RTX 4070 bis hinunter zu einem Raspberry Pi. Auf jedem wurde der gesamte Tool-Katalog ausgeführt und die Docker-Ressourcenlimits durchlaufen, um die tatsächliche Untergrenze zu ermitteln.

### Kurzübersicht {#quick-reference}

| Stufe | Anwendungsfall | CPU | RAM | GPU | Speicher |
|------|----------|-----|-----|-----|---------|
| Minimum | Bild-, Datei- und leichte PDF-Tools; ein Benutzer; kleine Stapel | 2 Kerne | 2 GB | Keine | ~7 GB |
| Empfohlen | Alle fünf Modalitäten inkl. Video, PDF und KI auf CPU; Stapel; einige Benutzer | 4 Kerne | 4 GB | Keine | ~25 GB |
| Voll | Alles in voller Geschwindigkeit inkl. GPU-KI; große Stapel; viele Benutzer | 6-8 Kerne | 8 GB | NVIDIA 8 GB+ VRAM (12 GB komfortabel) | ~35 GB |

**Architektur: nur 64-Bit** (`linux/amd64` oder `linux/arm64`). SnapOtter läuft nativ auf Intel/AMD-Servern, Apple-Silicon-Macs und 64-Bit-ARM-Boards einschließlich des **Raspberry Pi 4 und 5** (4-8 GB). Es läuft **nicht** auf 32-Bit-ARM (`armv7`/`armhf`) - dafür wird kein Image gebaut - und auch nicht auf Boards der 512-MB-Klasse wie dem Pi Zero, die unter der Speicheruntergrenze liegen (siehe unten).

### Minimum (Bild-, Datei- und leichte PDF-Tools; keine KI) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Ressource | Anforderung |
|---|---|
| CPU | 2 Kerne |
| RAM | 2 GB |
| Festplatte | ~5,5 GB (Image) + Datenvolume |
| GPU | Nicht erforderlich |

Alle 222 Nicht-KI-Katalog-Tools - Bild (Größe ändern, zuschneiden, konvertieren, komprimieren, anpassen, Wasserzeichen), Video (trimmen, stummschalten, remuxen), Audio (konvertieren, normalisieren, trimmen), PDF (zusammenführen, teilen, komprimieren, drehen, schützen), Dateikonvertierungen und dedizierte Konvertierungsvorlagen - laufen auf bescheidener Hardware. Die meisten Vorgänge sind selbst bei einer großen Datei in deutlich unter einer Sekunde abgeschlossen: Ein 2,7 MB großes Bild wird in ~0,05 s in der Größe geändert und in ~2 s zu WebP neu kodiert.

Die Speicheruntergrenze ist real, aus einem Durchlauf der Docker-Ressourcenlimits: **512 MB können den Stack nicht starten** (selbst eine einzelne Bildgrößenänderung wird abgebrochen), **1 GB** bewältigt Einzeldatei-Vorgänge, aber einem Mehrdatei-Stapel geht der Speicher aus, und **2 GB / 2 Kerne** ist die kleinste Konfiguration, die Stapel komfortabel bewältigt.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**Die eine CPU-intensive Ausnahme ist die Video-Neukodierung.** Stream-Copy-Vorgänge (trimmen, stummschalten, Container-Remux) sind sofort erledigt, aber das Transkodieren in einen anderen Codec ist CPU-gebunden. Ein 1080p-Clip von 45 Sekunden, der zu VP9 (WebM) neu kodiert wird, benötigt auf einer schnellen modernen CPU etwa **~40 s**, ~45 s auf Apple Silicon, ~80 s auf einer älteren mobilen 4-Kern-CPU und **~130 s** auf einem älteren 4-Kern-Server. Wenn deine Arbeitslast videolastig ist, priorisiere CPU-Kerne und Taktrate oder erhöhe das `cpus:`-Limit des Containers - das mitgelieferte Compose begrenzt die App standardmäßig auf 4 Kerne (8 beim GPU-Compose).

### Empfohlen (KI-Tools auf CPU) {#recommended-ai-tools-on-cpu}

| Ressource | Anforderung |
|---|---|
| CPU | 4 Kerne |
| RAM | 4 GB |
| Festplatte | 3 GB (Image) + 24 GB (KI-Modelle) + Arbeitsbereich |
| GPU | Nicht erforderlich (CPU-Fallback) |

**Die Installation der KI-Bundles treibt den RAM auf 4 GB.** Ohne installierte KI läuft die App im Leerlauf bei etwa 360 MB; mit allen sieben installierten Bundles hält sie ~2,6 GB resident, weil das Python-KI-Sidecar seine Modelle (Hintergrundentfernung, Hochskalierung, OCR, Transkription, Gesichtserkennung, Restaurierung) beim Start vorlädt. Nicht-KI-Installationen bleiben leichtgewichtig; KI-Installationen benötigen ≥4 GB.

Die meisten KI-Tools sind auf der CPU einwandfrei nutzbar; einige wenige wollen wirklich eine GPU. Gemessen auf einer modernen 4-Kern-CPU:

| KI-Tool | CPU-Zeit | Auf CPU nutzbar? |
|---|---|---|
| Gesichtserkennung (Gesichter unkenntlich machen, intelligenter Zuschnitt, Rote-Augen), Rauschentfernung | unter 1 s | Ja |
| OCR, Transkription, Untertitel | 1-3 s | Ja |
| Kolorieren, Gesichtsverbesserung | ~10 s | Ja |
| Hintergrundentfernung / -ersetzung / -unschärfe | ~29 s | Ja (du wirst warten) |
| KI-Hochskalierung (RealESRGAN) | ~33 s klein; Minuten bei großen Bildern | Grenzwertig - GPU dringend empfohlen |
| Fotorestaurierung (vollständige Pipeline) | mehrere Minuten | Nein - benötigt eine GPU oder eine schnelle Many-Core-CPU |

SnapOtter backt diese Modell-Downloads bewusst nicht in das Docker-Image ein. KI-Bundles werden nur heruntergeladen, wenn ein Administrator das zugehörige Tool aktiviert, im persistenten `/data/ai`-Volume gespeichert und von jedem Tool geteilt, das vom selben Modell-Stack abhängt. Das hält das finale Container-Image klein und lässt eine vollständige KI-Installation dennoch die größeren Speicherwerte unten erreichen.

Manche Tools hängen von mehr als einem geteilten Bundle ab. Passfoto benötigt beispielsweise sowohl `background-removal` als auch `face-detection`; wenn `background-removal` bereits installiert ist, lädt das Aktivieren von Passfoto nur das fehlende `face-detection`-Bundle herunter. Dieselbe Wiederverwendung gilt für alle KI-Tools.

Download-Größen der KI-Modelle:

| Bundle | Festplattengröße |
|---|---|
| Hintergrundentfernung | 4-5 GB |
| Hochskalierung + Gesichtsverbesserung + Rauschentfernung | 5-6 GB |
| Gesichtserkennung | 200-300 MB |
| Objekt-Radierer + Kolorieren | 1-2 GB |
| OCR | 5-6 GB |
| Fotorestaurierung | 4-5 GB |
| **Alle Bundles** | **~24 GB** |

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Voll (KI-Tools auf NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Ressource | Anforderung |
|---|---|
| CPU | 6-8 Kerne (Video-Vorbereitung + Nebenläufigkeit laufen auch bei GPU-KI auf der CPU) |
| RAM | 8 GB |
| GPU | NVIDIA mit 8+ GB VRAM (12 GB empfohlen) |
| Festplatte | ~35 GB gesamt |

Eine NVIDIA-GPU (CUDA) beschleunigt die schweren KI-Modelle dramatisch. Gemessen auf einer RTX 4070 gegenüber einer modernen CPU:

| KI-Tool | Beschleunigung mit GPU | Hinweise |
|---|---|---|
| KI-Hochskalierung (RealESRGAN 2×) | **~47×** | Der größte Gewinn - unter einer Sekunde statt ~33 s (Minuten bei großen Bildern) |
| Gesichtsverbesserung (CodeFormer) | **~12×** | ~0,9 s statt ~11 s |
| Transkription (Whisper) | ~4,5× | |
| Hintergrundentfernung / -ersetzung / -unschärfe | ~4× | ~7 s auf GPU statt ~29 s auf CPU |
| Kolorieren | ~1,8× | |
| OCR, Gesichtserkennung, Rote-Augen, Rauschentfernung | ~1× | Bereits schnell auf der CPU - eine GPU hilft nicht |
| Fotorestaurierung | keine | CPU-gebunden selbst auf einer GPU (0 % GPU-Auslastung); eine schnelle CPU zählt hier mehr als eine GPU |

Die Tools, für die sich eine GPU lohnt, sind **Hochskalierung, Gesichtsverbesserung, Transkription und Hintergrundentfernung**. Gesichtserkennung, OCR und Rote-Augen sind CPU-gebunden und bereits schnell, sodass eine GPU nichts bringt.

Die VRAM-Spitzennutzung erreicht 7,5 GB während der Hochskalierung mit Gesichtsverbesserung. Eine 6-GB-NVIDIA-GPU funktioniert für die meisten KI-Tools einzeln, scheitert aber bei der Hochskalierung. 8-12 GB VRAM bewältigen alles.

Intel/AMD-iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Das Einbinden von `/dev/dri` in den Container aktiviert keine KI-GPU-Beschleunigung; SnapOtter führt KI-Tools auf der CPU aus, sofern nicht NVIDIA CUDA verfügbar ist.

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

Parallele Bildgrößenänderungs-Anfragen gegen den standardmäßig auf 4 Kerne begrenzten App-Container:

| Gleichzeitige Anfragen | Durchschn. Antwortzeit | Fehler |
|---|---|---|
| 1 | 0,4 s | 0 |
| 5 | 1,2 s | 0 |
| 10 | 2,1 s | 0 |

Die Antwortzeit verschlechtert sich sublinear ohne Fehler, während der Worker-Pool gesättigt wird. Das Anheben des `cpus:`-Limits des App-Containers (oder die Verwendung eines Hosts mit mehr Kernen) hebt die Obergrenze an. Beachte, dass schwere Jobs (Video-Transkodierung, CPU-KI) einen Worker für ihre gesamte Dauer belegen, also dimensioniere die CPU nach deiner erwarteten Anzahl gleichzeitiger schwerer Jobs, nicht nur nach der Anfragezahl.

### Unterstützte Bildformate {#supported-image-formats}

SnapOtter unterstützt **55+ Eingabeformate** und **14 Ausgabeformate**, einschließlich RAW-Dateien von 20+ Kameramarken, professionellen Formaten (PSD, EPS, OpenEXR, HDR), modernen Codecs (JPEG XL, AVIF, HEIC, QOI) sowie wissenschaftlichen und Gaming-Formaten (FITS, DDS).

Siehe die [vollständige Formatliste](/de/guide/supported-formats) für Details zu jedem unterstützten Format, dem verwendeten Decoder und den verfügbaren Qualitätsreglern.

### Bekannte Einschränkungen {#known-limitations}

- **Inhaltsbewusste Größenänderung** stürzt bei großen Bildern (>5 MP) aufgrund einer Einschränkung im caire-Binary ab. Funktioniert bei kleineren Bildern einwandfrei.
- **HEIF-Dekodierung** dauert 13-23 Sekunden. HEIC (Apples Variante) ist mit 0,3-0,9 Sekunden deutlich schneller.
- **OCR Japanisch** schlägt auf der CPU aufgrund eines PaddlePaddle-MKLDNN-Fehlers fehl. Funktioniert auf der GPU.
- **Hochskalierung** läuft auf der CPU bei allem jenseits kleiner Bilder in eine Zeitüberschreitung. GPU für den praktischen Einsatz erforderlich.
- **CodeFormer**-Gesichtsverbesserung ist deutlich langsamer als GFPGAN (53 s statt 2 s auf GPU). GFPGAN wird für die meisten Anwendungsfälle empfohlen.

## Volumes {#volumes}

| Mount / Volume | Zweck | Erforderlich? |
|---|---|---|
| `/data` (App) | KI-Modelle, Python-venv, Benutzerdateien | **Ja** - Dateiverlust ohne es |
| `/tmp/workspace` (App) | Temporäre Verarbeitungsdateien (automatisch bereinigt) | Empfohlen |
| `SnapOtter-pgdata` (Postgres) | PostgreSQL-Datenverzeichnis (Benutzer, Einstellungen, Pipelines, Jobs) | **Ja** - Datenverlust ohne es |
| `SnapOtter-redisdata` (Redis) | Redis-Append-Only-Datei für dauerhafte Job-Warteschlangen | Empfohlen |

### Bind-Mounts vs. benannte Volumes {#bind-mounts-vs-named-volumes}

**Benannte Volumes** (empfohlen) - Docker verwaltet die Berechtigungen automatisch:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind-Mounts** - Du verwaltest die Berechtigungen. Setze `PUID`/`PGID` passend zu deinem Host-Benutzer:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Speicherberechtigungen {#storage-permissions}

SnapOtter schreibt zur Laufzeit an zwei Orte: `/data` (Benutzerdateien, Logs, KI-Modelle und das Python-venv) und `/tmp/workspace` (temporärer Verarbeitungs-Scratch). Beide müssen für den Benutzer, unter dem der Container läuft, beschreibbar sein. Ist eines von beiden es nicht, **scheitert der Container beim Start sofort** mit einer Meldung, die das Verzeichnis, die laufende UID/GID und die Behebung nennt - statt "gesund" hochzufahren und dann beim ersten Upload mit einem kryptischen Fehler zu scheitern.

Wie Berechtigungen gehandhabt werden, hängt davon ab, wie der Container gestartet wird:

**Standard (startet als root, fällt auf `snapotter` zurück)** - der Entrypoint startet als root, korrigiert die Eigentümerschaft der eingebundenen Volumes und fällt dann über `gosu` auf den unprivilegierten `snapotter`-Benutzer zurück. Benannte Volumes funktionieren ohne Konfiguration. Setze für Bind-Mounts `PUID`/`PGID` auf deinen Host-Benutzer (oben), damit die geschriebenen Dateien dir gehören.

**Kubernetes / OpenShift (non-root über `runAsUser`)** - direkt als Non-Root-Benutzer gestartet, kann der Container die Volumes nicht selbst chownen, daher muss der Orchestrator sie beschreibbar machen. Setze `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Die beschreibbaren Verzeichnisse des Images gehören der Gruppe GID 0 und sind gruppenbeschreibbar, sodass ein Pod, der mit einer **beliebigen UID** plus der Root-Zusatzgruppe (dem OpenShift-Standard) läuft, ohne `chown` schreiben kann.

**TrueNAS Scale (und andere "Fremd-UID"-Setups)** - TrueNAS führt Apps als Non-Root-Benutzer aus (oft `568:568`) und bindet Host-Datasets ein, die einem anderen Benutzer gehören, sodass weder der Entrypoint noch `fsGroup` sie von sich aus beschreibbar macht. Wähle eine Option:

- **Führe die App als root aus** (empfohlen) - lasse den Benutzer der App ungesetzt oder setze ihn auf `0` und lass den Standard-Entrypoint die Berechtigungen korrigieren und auf `snapotter` zurückfallen.
- **Führe als UID `999` aus** - setze Benutzer/Gruppe der App auf `999:999` (SnapOtters eingebauter `snapotter`-Benutzer), sodass sie zur Eigentümerschaft des Images passt.
- **`chown` das Host-Dataset** auf die UID, unter der der Container läuft, aus der TrueNAS-Shell:

  ```bash
  # Verwende die UID aus dem Startfehler (oder führe `id` im Container aus)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

Der Startfehler nennt die genau zu verwendende UID, daher ist der schnellste Weg, die App einmal zu starten, die Meldung zu lesen und dann entsprechend `chown` (oder den Benutzer anzupassen).

## Umgebungsvariablen {#environment-variables}

| Variable | Standard | Beschreibung |
|---|---|---|
| `AUTH_ENABLED` | `true` | Login-Pflicht aktivieren/deaktivieren |
| `DEFAULT_USERNAME` | `admin` | Anfänglicher Admin-Benutzername |
| `DEFAULT_PASSWORD` | `admin` | Anfängliches Admin-Passwort (erzwungene Änderung beim ersten Login) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Upload-Limit pro Datei |
| `MAX_BATCH_SIZE` | `100` | Max. Dateien pro Stapelanfrage |
| `RATE_LIMIT_PER_MIN` | `1000` | API-Anfragen pro Minute und IP (0 zum Deaktivieren) |
| `MAX_USERS` | `0` (unbegrenzt) | Maximale Benutzerkonten |
| `TRUST_PROXY` | `true` | X-Forwarded-For-Header vom Reverse-Proxy vertrauen |
| `PUID` | `999` | Als diese UID ausführen (für Bind-Mount-Berechtigungen) |
| `PGID` | `999` | Als diese GID ausführen (für Bind-Mount-Berechtigungen) |
| `LOG_LEVEL` | `info` | Log-Ausführlichkeit: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Max. parallele KI-Verarbeitungsjobs |
| `SESSION_DURATION_HOURS` | `168` | Lebensdauer der Login-Sitzung (7 Tage) |
| `CORS_ORIGIN` | (leer) | Kommagetrennte erlaubte Ursprünge oder leer für Same-Origin |

## Health-Check {#health-check}

Der Container enthält einen eingebauten Health-Check:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Reverse-Proxy {#reverse-proxy}

SnapOtter setzt `TRUST_PROXY=true` standardmäßig, sodass Ratenbegrenzung und Protokollierung die echte Client-IP aus den `X-Forwarded-For`-Headern verwenden.

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

1. Füge einen neuen Proxy Host hinzu
2. Setze den Domain Name auf deine Domain
3. Setze Scheme auf `http`, Forward Hostname auf `SnapOtter` (oder deine Container-IP), Forward Port auf `1349`
4. Aktiviere WebSocket-Unterstützung
5. Füge unter Advanced hinzu: `client_max_body_size 500M;` und `proxy_buffering off;`

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

`flush_interval -1` deaktiviert die Antwort-Pufferung, was für SSE-Fortschrittsereignisse (Stapelverarbeitung, KI-Tools, Feature-Installationen) erforderlich ist. Die verlängerten Zeitüberschreitungen erlauben es, große Datei-Uploads abzuschließen, ohne dass Caddy die Verbindung vorzeitig schließt.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Hinweis: Cloudflare hat auf kostenlosen Tarifen ein Upload-Limit von 100 MB. Setze `MAX_UPLOAD_SIZE_MB=100` passend dazu.

## CI/CD {#ci-cd}

Das GitHub-Repository hat drei Workflows:

- **ci.yml** - Läuft automatisch bei jedem Push und PR. Lintet, typechecked, testet, baut und validiert das Docker-Image (ohne Push).
- **release.yml** - Wird manuell über `workflow_dispatch` ausgelöst. Führt semantic-release aus, um ein Versions-Tag und ein GitHub-Release zu erstellen, baut dann ein Multi-Arch-Docker-Image (amd64 + arm64) und pusht zu Docker Hub (`snapotter/snapotter`) und zur GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Baut diese Dokumentations-Site und stellt sie bei Push auf `main` auf Cloudflare Pages bereit.

Um ein Release zu erstellen, gehe in der GitHub-Oberfläche auf **Actions > Release > Run workflow** oder führe aus:

```bash
gh workflow run release.yml
```

Semantic-release bestimmt die Version aus der Commit-Historie. Das `latest`-Docker-Tag zeigt immer auf das jüngste Release.

## Analytics {#analytics}

SnapOtter enthält anonyme Produkt-Analytics (Tool-Nutzungsmuster, Fehlerberichte), um Bugs zu erkennen und Funktionen zu verbessern. Sie sind standardmäßig aktiviert. Deine Dateien, Dateinamen und persönlichen Daten sind niemals Teil davon. SnapOtter funktioniert mit deaktivierten Analytics normal.

### Analytics deaktivieren {#disabling-analytics}

Das Laufzeit-Opt-out ist ein Admin-Umschalter mit einem Klick. Öffne Einstellungen > System > Datenschutz und schalte Anonyme Produkt-Analytics aus. Es stoppt sofort für die gesamte Instanz, kein Neuaufbau erforderlich.

Für ein Image, das niemals Analytics senden kann, setze das Build-Time-Hard-Off, indem du das Repository klonst und neu baust:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Oder füge das Build-Argument zu deinem vorhandenen `docker-compose.yml` hinzu:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
