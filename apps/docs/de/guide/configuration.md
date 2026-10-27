---
description: "Alle SnapOtter-Umgebungsvariablen mit Standardwerten. Konfiguriere Auth, Storage, KI-Modelle, Analyse und mehr."
i18n_source_hash: a694a81ef7e0
i18n_provenance: human
i18n_output_hash: f5e4c1c86731
i18n_hash_version: 2
---

# Konfiguration {#configuration}

Die gesamte Konfiguration erfolgt über Umgebungsvariablen. Jede Variable hat einen sinnvollen Standardwert, sodass SnapOtter ohne das Setzen einer einzigen davon sofort funktioniert.

## Umgebungsvariablen {#environment-variables}

### Server {#server}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `1349` | Port, auf dem der Server lauscht. |
| `BASE_PATH` | (leer) | Öffentlicher Bereitstellungspfad, z. B. `/snapotter`. Leer oder `/` stellt im Wurzelverzeichnis bereit. Wird zur Laufzeit angewendet; kein Neu-Build des Images erforderlich. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximale Anzahl von Anfragen pro Minute pro IP. Auf 0 setzen, um die Ratenbegrenzung zu deaktivieren. |
| `CORS_ORIGIN` | (leer) | Kommagetrennte erlaubte Origins für CORS, oder leer für ausschließlich Same-Origin. |
| `LOG_LEVEL` | `info` | Log-Ausführlichkeit. Eines von: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welche Gegenstellen die Client-IP über `X-Forwarded-For` setzen dürfen. Der Standard glaubt nur einer Gegenstelle aus einem privaten Netz, also gilt ein Reverse-Proxy im Docker-Netzwerk oder im LAN als vertrauenswürdig, der gefälschte Header eines öffentlichen Clients dagegen nicht. Setze `true` nur dann, wenn ein von dir kontrollierter Proxy unter einer öffentlichen Adresse davorsitzt. |

### Authentifizierung {#authentication}

Die beiden folgenden Booleans akzeptieren nur `true` und `false`. Alles andere, ob `1`, `yes` oder `on`, scheitert an der Validierung, und der Server beendet sich, bevor er zu lauschen beginnt.

| Variable | Standard | Beschreibung |
|---|---|---|
| `AUTH_ENABLED` | `true` | Eine Anmeldung erzwingen. Auf `false` setzen, um ganz ohne Konten zu laufen; das gibt jeder Anfrage Admin-Rechte, beschränke das also auf ein vertrauenswürdiges Netzwerk. |
| `DEFAULT_USERNAME` | `admin` | Benutzername für das anfängliche Admin-Konto. Wird nur beim ersten Start verwendet. |
| `DEFAULT_PASSWORD` | `admin` | Passwort für das anfängliche Admin-Konto. Ändere dies nach der ersten Anmeldung. |
| `MAX_USERS` | `0` (unbegrenzt) | Maximale Anzahl registrierter Benutzerkonten. Auf 0 setzen für unbegrenzt. |
| `SESSION_DURATION_HOURS` | `168` | Lebensdauer der Anmeldesitzung in Stunden (Standard sind 7 Tage). |
| `SKIP_MUST_CHANGE_PASSWORD` | `false` | Auf `true` setzen, um die erzwungene Passwortänderungsaufforderung bei der ersten Anmeldung zu überspringen. |

### Storage {#storage}

| Variable | Standard | Beschreibung |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` oder `s3`. S3 und MinIO benötigen eine Lizenz mit dem Feature s3_storage sowie die untenstehenden `S3_*`-Variablen. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL-Verbindungszeichenfolge und die Verbindung, über die jede Anfrage bedient wird. Ab 2.3.0 setzt du zusätzlich `DATABASE_MIGRATION_URL`, und diese wird dann zur Laufzeitrolle mit minimalen Rechten, die DML auf den Tabellen der App besitzt und sonst nichts. Der Compose-Stack richtet sie auf seinen `postgres`-Dienst; lass sie (zusammen mit `REDIS_URL`) ungesetzt, um den eingebetteten Modus zu bekommen. |
| `DATABASE_MIGRATION_URL` | (leer) | Verfügbar ab 2.3.0; das Image 2.2.0 ignoriert sie und benötigt `DATABASE_URL` mit dem Datenbankeigentümer. Privilegierte Verbindung, die nur beim Start verwendet wird, um Migrationen auszuführen und der Laufzeitrolle Rechte zu erteilen, und die vor der ersten Anfrage geschlossen wird. Bleibt sie leer, läuft SnapOtter mit einer einzigen Rolle, und `DATABASE_URL` übernimmt beide Aufgaben. Siehe [Rollen mit minimalen Rechten](/de/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis-Verbindungszeichenfolge (wird für BullMQ-Job-Warteschlangen verwendet). Compose richtet sie auf seinen `redis`-Dienst. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Verzeichnis für temporäre Dateien während der Verarbeitung. Wird automatisch aufgeräumt. Das Image setzt `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Verzeichnis für persistente Benutzerdateien (hochgeladene Bilder, gespeicherte Ergebnisse). Das Image setzt `/data/files`. |

### S3-Objektspeicher {#s3-object-storage}

Wird nur gelesen, wenn `STORAGE_MODE=s3` gilt. Fehlt eine der drei erforderlichen Variablen, schlägt der Start fehl und nennt den Namen der Variable, die du weggelassen hast.

| Variable | Standard | Beschreibung |
|---|---|---|
| `S3_BUCKET` | (leer) | Bucket, der Uploads und Ausgaben enthält. Erforderlich. |
| `S3_ACCESS_KEY_ID` | (leer) | Access Key. Erforderlich. Im Container kannst du ihn stattdessen einhängen, über `S3_ACCESS_KEY_ID_FILE`. |
| `S3_SECRET_ACCESS_KEY` | (leer) | Secret Key. Erforderlich. Gleiche Datei-Konvention: `S3_SECRET_ACCESS_KEY_FILE`. |
| `S3_REGION` | `us-east-1` | Region des Buckets. |
| `S3_ENDPOINT` | (leer) | Eigener Endpunkt für MinIO, R2, Backblaze und andere S3-kompatible Speicher. Leer bedeutet AWS. |
| `S3_FORCE_PATH_STYLE` | `false` | Auf `true` setzen für MinIO und alles andere, das `endpoint/bucket/key` statt der Virtual-Host-Adressierung erwartet. |
| `S3_PREFIX` | (leer) | Schlüsselpräfix, damit ein Bucket mehrere Instanzen aufnehmen kann. |

### Verschlüsselung im Ruhezustand {#encryption-at-rest}

| Variable | Standard | Beschreibung |
|---|---|---|
| `DATA_ENCRYPTION_KEY` | (leer) | 64 Hex-Zeichen (32 Byte). Verschlüsselt sensible Einstellungen, die in der Datenbank gespeichert sind. Alles, was nicht 64 Hex-Zeichen lang ist, wird beim Start abgelehnt. |
| `DATA_ENCRYPTION_KEY_PREVIOUS` | (leer) | Der Schlüssel, von dem du wegrotierst, im gleichen Format. Setze während einer Rotation beide, damit vorhandene Zeilen weiterhin entschlüsselt werden, und entferne diesen danach. |

### Eingebetteter Modus {#embedded-mode}

Wenn du das Image ohne `DATABASE_URL` und ohne `REDIS_URL` startest, startet es sein eigenes PostgreSQL 17 und Redis im Container, an Loopback gebunden, mit allen Daten auf dem `/data`-Volume. Das stellt das Erlebnis `docker run` mit einem einzigen Befehl für Schnellstart, Homelab und Upgrades von 1.x wieder her. Es ist ein Komfortpfad, kein Produktions-Deployment: Für die Produktion betreibe den 3-Container-Compose-Stack mit separatem PostgreSQL und Redis. Der eingebettete Modus erfordert, den Container als Root zu betreiben, und ist mit Runtimes mit beliebiger UID (OpenShift, Kubernetes `runAsNonRoot`) nicht kompatibel; verwende dort Compose.

| Variable | Standard | Beschreibung |
|---|---|---|
| `EMBEDDED` | `auto` | Automatisch aktiviert, wenn sowohl `DATABASE_URL` als auch `REDIS_URL` nicht gesetzt sind. Auf `0` setzen, um es zu deaktivieren (die App schlägt dann sofort fehl, wenn kein externes `DATABASE_URL`/`REDIS_URL` gesetzt ist, statt stillschweigend eine In-Container-Datenbank zu starten). |
| `REDIS_MAXMEMORY` | `512mb` | Speicherobergrenze für das eingebettete Redis (nur im eingebetteten Modus). Senke sie auf speicherbeschränkten Hosts wie einem Raspberry Pi. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Sekunden, die der Start auf eine Antwort von `PING` des eingebetteten Redis wartet, bevor er aufgibt. Bei einem Timeout stoppt der Container und protokolliert den Grund, statt zu hängen. Ganze Sekunden von 1 bis 999999; es gibt keinen unbegrenzten Wert, weil endloses Warten genau der Fehler ist, den diese Grenze verhindern soll. Erhöhe sie nur, wenn ein langsamer Host sie auslöst. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Dasselbe für das eingebettete PostgreSQL. Die Uhr startet nach dem Abschluss von `initdb` beim ersten Start, sodass sie den Serverstart und die Absturz-Wiederherstellung abdeckt und nicht die erstmalige Erstellung der Datenbank. |

Upgrade von 1.x: Lege deine alte `snapotter.db` unter `/data/snapotter.db` im Volume ab, und der eingebettete Modus importiert sie beim ersten Start in das eingebettete PostgreSQL. Der Import läuft einmal; spätere Starts überspringen ihn.

Telemetrie-Hinweis: Der eingebettete Modus übernimmt den Analyse-Standard des Images wie jede andere Konfiguration. Das veröffentlichte Image wird mit aktivierter Analyse ausgeliefert; baue mit `--build-arg SNAPOTTER_ANALYTICS=off` oder nutze das In-App-Admin-Opt-out, um sie zu deaktivieren.

### Verarbeitungslimits {#processing-limits}

| Variable | Standard | Beschreibung |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (unbegrenzt) | Maximale Dateigröße pro Upload in Megabyte. Auf 0 setzen für unbegrenzt. Das veröffentlichte Image wird mit `0` ausgeliefert; ein Build aus dem Quellcode startet bei 100. |
| `MAX_BATCH_SIZE` | `0` (unbegrenzt) | Maximale Anzahl von Dateien in einer einzelnen Stapelanfrage. Auf 0 setzen für unbegrenzt. Das veröffentlichte Image wird mit `0` ausgeliefert; ein Build aus dem Quellcode startet bei 100. |
| `CONCURRENT_JOBS` | `0` (auto) | Anzahl der Stapeljobs, die parallel laufen. Auf 0 setzen, um automatisch anhand der verfügbaren CPU-Kerne zu erkennen. |
| `MAX_MEGAPIXELS` | `0` (unbegrenzt) | Maximal erlaubte Bildauflösung in Megapixeln. Auf 0 setzen für unbegrenzt. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximale Worker-Threads für die Bildverarbeitung. Auf 0 setzen, um automatisch anhand der verfügbaren CPU-Kerne zu erkennen. |
| `PROCESSING_TIMEOUT_S` | `0` (kein Limit) | Maximale Verarbeitungszeit pro Anfrage in Sekunden. Auf 0 setzen für kein Timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Maximale Anzahl von Schritten in einer Pipeline. Auf 0 setzen für kein Limit. |
| `MAX_CANVAS_PIXELS` | `0` (kein Limit) | Maximale Leinwandgröße in Pixeln für Ausgabebilder. Auf 0 setzen für kein Limit. |
| `MAX_SVG_SIZE_MB` | `50` | Größte SVG-Datei, die vor der Bereinigung akzeptiert wird, in Megabyte. `0` verhält sich hier anders als in den umliegenden Zeilen. Es entfernt die Größenbeschränkung vor dem Parsen vollständig, statt sie anzuheben, lass diesen Wert also gesetzt. |
| `MAX_PDF_PAGES` | `0` (unbegrenzt) | Maximale Anzahl von PDF-Seiten für die PDF-zu-Image-Konvertierung. Auf 0 setzen für unbegrenzt. |

### Engines {#engines}

SnapOtter sucht jede Verarbeitungs-Binärdatei unter `$PATH` im Container, daher bleiben diese leer, solange du keinen eigenen Build einbindest.

| Variable | Standard | Beschreibung |
|---|---|---|
| `FFMPEG_PATH` | (leer) | Pfad zur `ffmpeg`-Binärdatei hinter den Video- und Audio-Werkzeugen. |
| `FFPROBE_PATH` | (leer) | Pfad zu `ffprobe`, das Mediendateien liest, bevor sie verarbeitet werden. Richte ihn auf denselben Build wie `FFMPEG_PATH`. |
| `QPDF_PATH` | (leer) | Pfad zu `qpdf`, verwendet von den PDF-Werkzeugen und zur Prüfung hochgeladener PDFs. |
| `SOFFICE_PATH` | (leer) | Pfad zu LibreOffice' `soffice`, verwendet für Konvertierungen von Office-Dokumenten. |
| `PDFCPU_PATH` | (leer) | Pfad zu `pdfcpu`, verwendet von einigen PDF-Werkzeugen. |
| `SNAPOTTER_HW_ACCEL` | (leer) | Familie der Hardware-Videoencoder, `nvenc` oder `vaapi`. Leer kodiert in Software. |

`SNAPOTTER_HW_ACCEL` braucht ein ffmpeg, das mit dieser Encoder-Familie gebaut wurde, und das ffmpeg im Image hat keine von beiden. Mit der Binärdatei des Images fällt die Einstellung auf Software-Encoding zurück und sagt das im Startlog. Um sie zu nutzen, binde deinen eigenen ffmpeg-Build ein, richte `FFMPEG_PATH` und `FFPROBE_PATH` darauf und gib dem Container das GPU-Gerät. Für `nvenc` setze zusätzlich `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: Das Image fragt nur `compute,utility` an, und ohne `video` bindet die NVIDIA-Runtime die Encoder-Bibliothek nicht ein, sodass der Encoder zwar aufgelistet wird, aber jede Kodierung fehlschlägt. Ein Pfad-Override, der nicht existiert oder nicht ausführbar ist, wird ebenfalls im Startlog genannt, und jeder Job, der diese Binärdatei braucht, schlägt fehl, bis du den Pfad korrigierst oder die Variable leerst.

Die veröffentlichten Compose-Dateien reichen alle sechs aus `.env` durch, daher genügt es, sie dort zu setzen.

### Bereinigung {#cleanup}

| Variable | Standard | Beschreibung |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Wie lange ungespeicherte Verarbeitungsergebnisse (rohe Uploads und Werkzeugausgaben) vor der automatischen Löschung aufbewahrt werden. Dateien, die du explizit in der Files-Bibliothek speicherst, sind davon nicht betroffen und bleiben bestehen, bis du sie löschst. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Wie oft der Bereinigungsjob läuft. |

### Erscheinungsbild {#appearance}

| Variable | Standard | Beschreibung |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standard-Theme für neue Sitzungen. `light`, `dark` oder `system`. |
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
      POSTGRES_PASSWORD: snapotter     # Ändern Sie dies für nicht lokale Bereitstellungen
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

- `/data` (app) - KI-Modelle, Python-venv und Benutzerdateien. Mounte dies, um hochgeladene Dateien und installierte KI-Bundles über Neustarts hinweg zu behalten.
- `/tmp/workspace` (app) - Temporärer Speicher für Dateien, die gerade verarbeitet werden. Dies kann flüchtig sein, aber ein Mount vermeidet, dass die beschreibbare Schicht des Containers voll läuft.
- `SnapOtter-pgdata` (postgres) - PostgreSQL-Datenverzeichnis. Dies enthält alle relationalen Daten (Benutzer, Einstellungen, Pipelines, Jobs, Audit-Log). Sichere es über `pg_dump` oder einen Volume-Snapshot.
- `SnapOtter-redisdata` (redis) - Redis-Append-only-Datei für dauerhafte Job-Warteschlangen.
