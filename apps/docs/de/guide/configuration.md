---
description: "Alle SnapOtter-Umgebungsvariablen mit Standardwerten. Konfiguriere Auth, Storage, KI-Modelle, Analyse und mehr."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 874b73f5ab4e
---

# Konfiguration {#configuration}

Die gesamte Konfiguration erfolgt über Umgebungsvariablen. Jede Variable hat einen sinnvollen Standardwert, sodass SnapOtter ohne das Setzen einer einzigen davon sofort funktioniert.

## Umgebungsvariablen {#environment-variables}

### Server {#server}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `1349` | Port, auf dem der Server lauscht. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximale Anzahl von Anfragen pro Minute pro IP. Auf 0 setzen, um die Ratenbegrenzung zu deaktivieren. |
| `CORS_ORIGIN` | (leer) | Kommagetrennte erlaubte Origins für CORS, oder leer für ausschließlich Same-Origin. |
| `LOG_LEVEL` | `info` | Log-Ausführlichkeit. Eines von: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | `X-Forwarded-For`-Headern von einem Reverse-Proxy vertrauen. Auf `false` setzen, wenn nicht hinter einem Proxy. |

### Authentifizierung {#authentication}

| Variable | Standard | Beschreibung |
|---|---|---|
| `AUTH_ENABLED` | `false` | Auf `true` setzen, um eine Anmeldung zu erzwingen. Das Docker-Image verwendet standardmäßig `true`. |
| `DEFAULT_USERNAME` | `admin` | Benutzername für das anfängliche Admin-Konto. Wird nur beim ersten Start verwendet. |
| `DEFAULT_PASSWORD` | `admin` | Passwort für das anfängliche Admin-Konto. Ändere dies nach der ersten Anmeldung. |
| `MAX_USERS` | `0` (unbegrenzt) | Maximale Anzahl registrierter Benutzerkonten. Auf 0 setzen für unbegrenzt. |
| `SESSION_DURATION_HOURS` | `168` | Lebensdauer der Anmeldesitzung in Stunden (Standard sind 7 Tage). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Auf einen beliebigen nicht-leeren Wert setzen, um die erzwungene Passwortänderungsaufforderung bei der ersten Anmeldung zu umgehen |

### Storage {#storage}

| Variable | Standard | Beschreibung |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` oder `s3`. S3/MinIO erfordert eine Lizenz mit dem Feature s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL-Verbindungszeichenfolge. |
| `REDIS_URL` | `redis://redis:6379` | Redis-Verbindungszeichenfolge (wird für BullMQ-Job-Warteschlangen verwendet). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Verzeichnis für temporäre Dateien während der Verarbeitung. Wird automatisch aufgeräumt. |
| `FILES_STORAGE_PATH` | `./data/files` | Verzeichnis für persistente Benutzerdateien (hochgeladene Bilder, gespeicherte Ergebnisse). |

### Eingebetteter Modus {#embedded-mode}

Wenn du das Image ohne `DATABASE_URL` und ohne `REDIS_URL` startest, startet es sein eigenes PostgreSQL 17 und Redis im Container, an Loopback gebunden, mit allen Daten auf dem `/data`-Volume. Das stellt das Erlebnis `docker run` mit einem einzigen Befehl für Schnellstart, Homelab und Upgrades von 1.x wieder her. Es ist ein Komfortpfad, kein Produktions-Deployment: Für die Produktion betreibe den 3-Container-Compose-Stack mit separatem PostgreSQL und Redis. Der eingebettete Modus erfordert, den Container als Root zu betreiben, und ist mit Runtimes mit beliebiger UID (OpenShift, Kubernetes `runAsNonRoot`) nicht kompatibel; verwende dort Compose.

| Variable | Standard | Beschreibung |
|---|---|---|
| `EMBEDDED` | `auto` | Automatisch aktiviert, wenn sowohl `DATABASE_URL` als auch `REDIS_URL` nicht gesetzt sind. Auf `0` setzen, um es zu deaktivieren (die App schlägt dann sofort fehl, wenn kein externes `DATABASE_URL`/`REDIS_URL` gesetzt ist, statt stillschweigend eine In-Container-Datenbank zu starten). |
| `REDIS_MAXMEMORY` | `512mb` | Speicherobergrenze für das eingebettete Redis (nur im eingebetteten Modus). Senke sie auf speicherbeschränkten Hosts wie einem Raspberry Pi. |

Upgrade von 1.x: Lege deine alte `snapotter.db` unter `/data/snapotter.db` im Volume ab, und der eingebettete Modus importiert sie beim ersten Start in das eingebettete PostgreSQL. Der Import läuft einmal; spätere Starts überspringen ihn.

Telemetrie-Hinweis: Der eingebettete Modus übernimmt den Analyse-Standard des Images wie jede andere Konfiguration. Das veröffentlichte Image wird mit aktivierter Analyse ausgeliefert; baue mit `--build-arg SNAPOTTER_ANALYTICS=off` oder nutze das In-App-Admin-Opt-out, um sie zu deaktivieren.

### Verarbeitungslimits {#processing-limits}

| Variable | Standard | Beschreibung |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Maximale Dateigröße pro Upload in Megabyte. Auf 0 setzen für unbegrenzt. |
| `MAX_BATCH_SIZE` | `100` | Maximale Anzahl von Dateien in einer einzelnen Stapelanfrage. Auf 0 setzen für unbegrenzt. |
| `CONCURRENT_JOBS` | `0` (auto) | Anzahl der Stapeljobs, die parallel laufen. Auf 0 setzen, um automatisch anhand der verfügbaren CPU-Kerne zu erkennen. |
| `MAX_MEGAPIXELS` | `0` (unbegrenzt) | Maximal erlaubte Bildauflösung in Megapixeln. Auf 0 setzen für unbegrenzt. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximale Worker-Threads für die Bildverarbeitung. Auf 0 setzen, um automatisch anhand der verfügbaren CPU-Kerne zu erkennen. |
| `PROCESSING_TIMEOUT_S` | `0` (kein Limit) | Maximale Verarbeitungszeit pro Anfrage in Sekunden. Auf 0 setzen für kein Timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Maximale Anzahl von Schritten in einer Pipeline. Auf 0 setzen für kein Limit. |
| `MAX_CANVAS_PIXELS` | `0` (kein Limit) | Maximale Leinwandgröße in Pixeln für Ausgabebilder. Auf 0 setzen für kein Limit. |
| `MAX_SVG_SIZE_MB` | `0` (unbegrenzt) | Maximale SVG-Dateigröße in Megabyte. Auf 0 setzen für unbegrenzt. |
| `MAX_SPLIT_GRID` | `100` | Maximale Rasterdimension für das Bildaufteilungswerkzeug. |
| `MAX_PDF_PAGES` | `0` (unbegrenzt) | Maximale Anzahl von PDF-Seiten für die PDF-zu-Image-Konvertierung. Auf 0 setzen für unbegrenzt. |

### Bereinigung {#cleanup}

| Variable | Standard | Beschreibung |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Wie lange ungespeicherte Verarbeitungsergebnisse (rohe Uploads und Werkzeugausgaben) vor der automatischen Löschung aufbewahrt werden. Dateien, die du explizit in der Files-Bibliothek speicherst, sind davon nicht betroffen und bleiben bestehen, bis du sie löschst. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Wie oft der Bereinigungsjob läuft. |

### Erscheinungsbild {#appearance}

| Variable | Standard | Beschreibung |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standard-Theme für neue Sitzungen. `light` oder `dark`. |
| `DEFAULT_LOCALE` | `en` | Standard-Oberflächensprache. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standard-Werkzeuglayout. `sidebar` oder `fullscreen`. |

### Docker-Berechtigungen {#docker-permissions}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PUID` | `999` | Den Containerprozess als diese UID ausführen. Setze sie passend zu deinem Host-Benutzer für Bind-Mounts (`id -u`). |
| `PGID` | `999` | Den Containerprozess als diese GID ausführen. Setze sie passend zu deiner Host-Gruppe für Bind-Mounts (`id -g`). |

## Docker-Beispiel {#docker-example}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=changeme
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
      - MAX_UPLOAD_SIZE_MB=200
      - CONCURRENT_JOBS=4
      - FILE_MAX_AGE_HOURS=12
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
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

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

## Volumes {#volumes}

Der Docker-Compose-Stack verwendet vier Volumes:

- `/data` (app) - KI-Modelle, Python-venv und Benutzerdateien. Mounte dies, um hochgeladene Dateien und installierte KI-Bundles über Neustarts hinweg zu behalten.
- `/tmp/workspace` (app) - Temporärer Speicher für Dateien, die gerade verarbeitet werden. Dies kann flüchtig sein, aber ein Mount vermeidet, dass die beschreibbare Schicht des Containers voll läuft.
- `SnapOtter-pgdata` (postgres) - PostgreSQL-Datenverzeichnis. Dies enthält alle relationalen Daten (Benutzer, Einstellungen, Pipelines, Jobs, Audit-Log). Sichere es über `pg_dump` oder einen Volume-Snapshot.
- `SnapOtter-redisdata` (redis) - Redis-Append-only-Datei für dauerhafte Job-Warteschlangen.
