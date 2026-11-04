---
description: "Alle SnapOtter-Umgebungsvariablen mit Standardwerten. Konfigurieren Sie Authentifizierung, Speicher, KI-Modelle, Analytics und mehr."
i18n_source_hash: caa895c0ba16
i18n_provenance: machine
i18n_output_hash: cab05c4856c7
i18n_hash_version: 2
---

# Konfiguration {#configuration}

Die gesamte Konfiguration erfolgt über Umgebungsvariablen. Jede Variable hat einen sinnvollen Standardwert, sodass SnapOtter ohne jede Einstellung sofort funktioniert.

## Umgebungsvariablen {#environment-variables}

### Server {#server}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `1349` | Port, auf dem der Server lauscht. |
| `BASE_PATH` | (leer) | Öffentlicher Bereitstellungspfad, z. B. `/snapotter`. Leer oder `/` liefert die App im Stammverzeichnis der Domain aus. Wird zur Laufzeit angewendet; kein erneutes Bauen des Images erforderlich. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximale Anfragen pro Minute und IP. Auf 0 setzen, um die Ratenbegrenzung zu deaktivieren. |
| `CORS_ORIGIN` | (leer) | Durch Kommas getrennte erlaubte Origins für CORS, oder leer für ausschließlich denselben Origin. |
| `LOG_LEVEL` | `info` | Ausführlichkeit der Protokollierung. Eines von: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welche Peers die Client-IP über `X-Forwarded-For` setzen dürfen. Der Standard vertraut nur einem Peer aus einem privaten Netzwerk, sodass ein Reverse Proxy in einem Docker-Netzwerk oder LAN als vertrauenswürdig gilt, der gefälschte Header eines öffentlichen Clients dagegen nicht. Setzen Sie `true` nur, wenn ein von Ihnen kontrollierter Proxy auf einer öffentlichen Adresse vorgeschaltet ist. |

### Authentifizierung {#authentication}

Die beiden folgenden booleschen Werte akzeptieren nur `true` und `false`. Alles andere, `1` oder `yes` oder `on`, besteht die Validierung nicht, und der Server beendet sich, bevor er zu lauschen beginnt.

| Variable | Standard | Beschreibung |
|---|---|---|
| `AUTH_ENABLED` | `true` | Eine Anmeldung verlangen. Auf `false` setzen, um ganz ohne Konten zu arbeiten. Dadurch erhält jede Anfrage Administratorrechte, beschränken Sie das also auf ein vertrauenswürdiges Netzwerk. |
| `DEFAULT_USERNAME` | `admin` | Benutzername für das anfängliche Administratorkonto. Wird nur beim ersten Start verwendet. |
| `DEFAULT_PASSWORD` | `admin` | Passwort für das anfängliche Administratorkonto. Ändern Sie es nach der ersten Anmeldung. |
| `MAX_USERS` | `0` (unbegrenzt) | Maximale Anzahl registrierter Benutzerkonten. Auf 0 setzen für unbegrenzt. |
| `SESSION_DURATION_HOURS` | `168` | Lebensdauer der Anmeldesitzung in Stunden (Standard sind 7 Tage). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Auf `true` setzen, um die erzwungene Passwortänderung bei der ersten Anmeldung zu überspringen. |

### Speicher {#storage}

| Variable | Standard | Beschreibung |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` oder `s3`. S3 und MinIO benötigen eine Lizenz mit dem Feature s3_storage sowie die unten aufgeführten `S3_*`-Variablen. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL-Verbindungszeichenfolge und die Verbindung, über die jede Anfrage bedient wird. Ab 2.3.0 setzen Sie zusätzlich `DATABASE_MIGRATION_URL`, und diese Verbindung wird zur Laufzeitrolle mit minimalen Rechten, die DML auf den Tabellen der App besitzt und sonst nichts. Der Compose-Stack verweist damit auf seinen `postgres`-Dienst; lassen Sie sie (zusammen mit `REDIS_URL`) ungesetzt, um den eingebetteten Modus zu erhalten. |
| `DATABASE_MIGRATION_URL` | (leer) | Privilegierte Verbindung, die nur während des Starts verwendet wird, um Migrationen auszuführen und die Laufzeitrolle zu berechtigen, und die vor der ersten Anfrage wieder geschlossen wird. Lassen Sie sie leer, dann läuft SnapOtter mit einer einzigen Rolle, wobei `DATABASE_URL` beide Aufgaben übernimmt. Siehe [Rollen mit minimalen Rechten](/de/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis-Verbindungszeichenfolge (für die BullMQ-Job-Warteschlangen). Compose verweist damit auf seinen `redis`-Dienst. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Verzeichnis für temporäre Dateien während der Verarbeitung. Wird automatisch bereinigt. Das Image setzt `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Verzeichnis für dauerhafte Benutzerdateien (hochgeladene Bilder, gespeicherte Ergebnisse). Das Image setzt `/data/files`. |

### S3-Objektspeicher {#s3-object-storage}

Wird nur gelesen, wenn `STORAGE_MODE=s3`. Fehlt eine der drei erforderlichen Variablen, schlägt der Start fehl und nennt den Namen der ausgelassenen Variable.

| Variable | Standard | Beschreibung |
|---|---|---|
| `S3_BUCKET` | (leer) | Bucket, der Uploads und Ausgaben enthält. Erforderlich. |
| `S3_ACCESS_KEY_ID` | (leer) | Zugriffsschlüssel. Erforderlich. Im Container können Sie ihn stattdessen über `S3_ACCESS_KEY_ID_FILE` einbinden. |
| `S3_SECRET_ACCESS_KEY` | (leer) | Geheimer Schlüssel. Erforderlich. Gleiche Dateikonvention: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Region des Buckets. |
| `S3_ENDPOINT` | (leer) | Benutzerdefinierter Endpunkt für MinIO, R2, Backblaze und andere S3-kompatible Speicher. Leer bedeutet AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Auf `true` setzen für MinIO und alles andere, das `endpoint/bucket/key` statt der Virtual-Host-Adressierung verlangt. |
| `S3_PREFIX` | (leer) | Schlüsselpräfix, damit ein Bucket mehrere Instanzen aufnehmen kann. |

### Verschlüsselung im Ruhezustand {#encryption-at-rest}

| Variable | Standard | Beschreibung |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (leer) | 64 Hexadezimalzeichen (32 Bytes). Verschlüsselt sensible, in der Datenbank gespeicherte Einstellungen. Alles, was keine 64 Hexadezimalzeichen sind, wird beim Start abgelehnt. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (leer) | Der Schlüssel, den Sie ablösen, im selben Format. Setzen Sie bei einer Rotation beide, damit vorhandene Zeilen weiterhin entschlüsselt werden, und entfernen Sie danach diesen. |

### Eingebetteter Modus {#embedded-mode}

Starten Sie das Image ohne `DATABASE_URL` und ohne `REDIS_URL`, dann startet es im Container seine eigene PostgreSQL-17- und Redis-Instanz, an Loopback gebunden, mit allen Daten auf dem Volume `/data`. Das stellt das `docker run`-Erlebnis mit einem einzigen Befehl für Schnellstart, Homelab und Upgrades von 1.x wieder her. Es ist ein Komfortpfad und keine Produktionsbereitstellung: Betreiben Sie in der Produktion den Compose-Stack mit drei Containern und getrennten PostgreSQL- und Redis-Instanzen. Der eingebettete Modus erfordert, dass der Container als root läuft, und ist mit Laufzeitumgebungen mit beliebiger UID nicht kompatibel (OpenShift, Kubernetes `runAsNonRoot`); verwenden Sie dort Compose.

| Variable | Standard | Beschreibung |
|---|---|---|
| `EMBEDDED` | `auto` | Wird automatisch aktiviert, wenn `DATABASE_URL` und `REDIS_URL` beide nicht gesetzt sind. Auf `0` setzen, um ihn zu deaktivieren (die App bricht dann sofort ab, wenn kein externes `DATABASE_URL`/`REDIS_URL` gesetzt ist, statt stillschweigend eine Datenbank im Container zu starten). |
| `REDIS_MAXMEMORY` | `512mb` | Speicherobergrenze für das eingebettete Redis (nur im eingebetteten Modus). Verringern Sie sie auf Hosts mit knappem Speicher wie einem Raspberry Pi. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Sekunden, die der Start darauf wartet, dass das eingebettete Redis auf `PING` antwortet, bevor er aufgibt. Bei einer Zeitüberschreitung hält der Container an und protokolliert den Grund, statt zu hängen. Ganze Sekunden von 1 bis 999999; es gibt keinen Wert für unbegrenzt, weil endloses Warten genau der Fehler ist, den diese Grenze verhindern soll. Erhöhen Sie ihn nur, wenn ein langsamer Host sie auslöst. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Dasselbe für das eingebettete PostgreSQL. Die Uhr startet, nachdem das `initdb` beim ersten Start abgeschlossen ist, sie deckt also den Serverstart und die Crash-Recovery ab, nicht die anfängliche Erstellung der Datenbank. |

Upgrade von 1.x: Legen Sie Ihre alte `snapotter.db` unter `/data/snapotter.db` im Volume ab, dann importiert der eingebettete Modus sie beim ersten Start in das eingebettete PostgreSQL. Der Import läuft einmalig; spätere Starts überspringen ihn.

Hinweis zur Telemetrie: Der eingebettete Modus übernimmt den Analytics-Standard des Images wie jede andere Konfiguration. Das veröffentlichte Image wird mit aktivierten Analytics ausgeliefert; bauen Sie mit `--build-arg SNAPOTTER_ANALYTICS=off` oder nutzen Sie das Opt-out des Admins in der App, um sie zu deaktivieren.

### Verarbeitungslimits {#processing-limits}

| Variable | Standard | Beschreibung |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (unbegrenzt) | Maximale Dateigröße pro Upload in Megabyte. Auf 0 setzen für unbegrenzt. Das veröffentlichte Image liefert `0` aus; ein Build aus dem Quellcode beginnt bei 100. |
| `MAX_BATCH_SIZE` | `0` (unbegrenzt) | Maximale Anzahl von Dateien in einer einzelnen Batch-Anfrage. Auf 0 setzen für unbegrenzt. Das veröffentlichte Image liefert `0` aus; ein Build aus dem Quellcode beginnt bei 100. |
| `CONCURRENT_JOBS` | `0` (automatisch) | Anzahl der Batch-Jobs, die parallel laufen. Auf 0 setzen, um sie anhand der verfügbaren CPU-Kerne automatisch zu ermitteln. |
| `MAX_MEGAPIXELS` | `0` (unbegrenzt) | Maximal zulässige Bildauflösung in Megapixeln. Auf 0 setzen für unbegrenzt. |
| `MAX_WORKER_THREADS` | `0` (automatisch) | Maximale Anzahl an Worker-Threads für die Bildverarbeitung. Auf 0 setzen, um sie anhand der verfügbaren CPU-Kerne automatisch zu ermitteln. |
| `PROCESSING_TIMEOUT_S` | `0` (kein Limit) | Maximale Verarbeitungszeit pro Anfrage in Sekunden. Auf 0 setzen für kein Timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Maximale Anzahl von Schritten in einer Pipeline. Auf 0 setzen für kein Limit. |
| `MAX_CANVAS_PIXELS` | `0` (kein Limit) | Maximale Canvas-Größe in Pixeln für Ausgabebilder. Auf 0 setzen für kein Limit. |
| `MAX_SVG_SIZE_MB` | `50` | Größte vor dem Bereinigen akzeptierte SVG-Datei in Megabyte. `0` verhält sich hier anders als in den Zeilen darum herum. Es hebt die Größenobergrenze vor dem Parsen vollständig auf, statt sie anzuheben, also lassen Sie diesen Wert gesetzt. |
| `MAX_PDF_PAGES` | `0` (unbegrenzt) | Maximale Anzahl von PDF-Seiten für die Konvertierung von PDF in Bilder. Auf 0 setzen für unbegrenzt. |

### Engines {#engines}

SnapOtter sucht jede Verarbeitungsbinärdatei im Container über `$PATH`, daher bleiben diese Variablen leer, es sei denn, Sie binden einen eigenen Build ein.

| Variable | Standard | Beschreibung |
|---|---|---|
| `FFMPEG_PATH` | (leer) | Pfad zur `ffmpeg`-Binärdatei hinter den Video- und Audiotools. |
| `FFPROBE_PATH` | (leer) | Pfad zu `ffprobe`, das Mediendateien liest, bevor sie verarbeitet werden. Verweisen Sie auf denselben Build wie `FFMPEG_PATH`. |
| `QPDF_PATH` | (leer) | Pfad zu `qpdf`, das von den PDF-Tools und zur Prüfung hochgeladener PDFs verwendet wird. |
| `SOFFICE_PATH` | (leer) | Pfad zu `soffice` von LibreOffice, das für Office-Dokumentkonvertierungen verwendet wird. |
| `PDFCPU_PATH` | (leer) | Pfad zu `pdfcpu`, das von einigen PDF-Tools verwendet wird. |
| `SNAPOTTER_HW_ACCEL` | (leer) | Familie des Hardware-Videoencoders, `nvenc` oder `vaapi`. Leer kodiert in Software. |

`SNAPOTTER_HW_ACCEL` benötigt ein ffmpeg, das mit dieser Encoder-Familie gebaut wurde, und das ffmpeg im Image hat keine von beiden. Mit der Binärdatei des Images fällt die Einstellung auf Software-Kodierung zurück und meldet das im Startprotokoll. Um sie zu nutzen, binden Sie Ihren eigenen ffmpeg-Build ein, verweisen `FFMPEG_PATH` und `FFPROBE_PATH` darauf und geben dem Container das GPU-Gerät. Setzen Sie für `nvenc` außerdem `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: Das Image fordert nur `compute,utility` an, und ohne `video` bindet die NVIDIA-Runtime die Encode-Bibliothek nicht ein, sodass der Encoder zwar aufgelistet wird, aber jede Kodierung fehlschlägt. Ein Pfad-Override, der nicht existiert oder nicht ausführbar ist, wird ebenfalls im Startprotokoll genannt, und jeder Job, der diese Binärdatei benötigt, schlägt fehl, bis Sie den Pfad korrigieren oder die Variable entfernen.

Die veröffentlichten Compose-Dateien reichen alle sechs aus `.env` durch, es genügt also, sie dort zu setzen.

### Bereinigung {#cleanup}

| Variable | Standard | Beschreibung |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Wie lange nicht gespeicherte Verarbeitungsergebnisse (rohe Uploads und Tool-Ausgaben) aufbewahrt werden, bevor sie automatisch gelöscht werden. Dateien, die Sie ausdrücklich in der Dateibibliothek speichern, sind davon nicht betroffen und bleiben bestehen, bis Sie sie löschen. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Wie oft der Bereinigungsjob läuft. |

### Darstellung {#appearance}

| Variable | Standard | Beschreibung |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standard-Theme für neue Sitzungen. `light`, `dark` oder `system`. |
| `DEFAULT_LOCALE` | `en` | Standardsprache der Oberfläche. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standardlayout der Tools. `sidebar` oder `fullscreen`. |

### Docker-Berechtigungen {#docker-permissions}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PUID` | `999` | Den Containerprozess mit dieser UID ausführen. Passen Sie sie für Bind-Mounts an Ihren Host-Benutzer an (`id -u`). |
| `PGID` | `999` | Den Containerprozess mit dieser GID ausführen. Passen Sie sie für Bind-Mounts an Ihre Host-Gruppe an (`id -g`). |

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
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter -d snapotter"]
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

- `/data` (App) - KI-Modelle, Python-venv und Benutzerdateien. Binden Sie es ein, um hochgeladene Dateien und installierte KI-Bundles über Neustarts hinweg zu behalten.
- `/tmp/workspace` (App) - Temporärer Speicher für Dateien in Verarbeitung. Er kann flüchtig sein, aber durch das Einbinden vermeiden Sie, dass die beschreibbare Schicht des Containers vollläuft.
- `SnapOtter-pgdata` (postgres) - PostgreSQL-Datenverzeichnis. Es enthält alle relationalen Daten (Benutzer, Einstellungen, Pipelines, Jobs, Audit-Protokoll). Sichern Sie es über `pg_dump` oder einen Volume-Snapshot.
- `SnapOtter-redisdata` (redis) - Redis-Append-only-Datei für dauerhafte Job-Warteschlangen.