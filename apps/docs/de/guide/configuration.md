---
description: "Alle SnapOtter-Umgebungsvariablen mit Standardwerten. Konfigurieren Sie Authentifizierung, Speicher, KI-Modelle, Analytics und mehr."
i18n_source_hash: 0a7a78fd254c
i18n_provenance: machine
i18n_output_hash: cdfe1f159e73
i18n_hash_version: 2
---

# Konfiguration {#configuration}

Die gesamte Konfiguration erfolgt über Umgebungsvariablen. Jede Variable hat einen sinnvollen Standardwert, sodass SnapOtter ohne jede Einstellung sofort funktioniert.

## Umgebungsvariablen {#environment-variables}

### Server {#server}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PORT` | `1349` | Port, auf dem der Server lauscht. |
| `HOST` | `0.0.0.0` | IP-Adresse, auf der der Server lauscht. In einem Bridge-Netzwerk (dem Standard für `docker run` und Compose) behalten Sie `0.0.0.0` (oder `::`) bei, sonst funktionieren veröffentlichte Ports nicht mehr. Bei einer nativen Installation oder einem Container im Host-Netzwerk hält `127.0.0.1` die API vom Netzwerk fern; schalten Sie für den Fernzugriff einen Reverse Proxy davor. Der [eingebettete Modus](#embedded-mode) funktioniert nur mit `0.0.0.0`, `::` oder `127.0.0.1`, weil seine Startprüfung `127.0.0.1` aufruft. Mit jeder anderen Adresse, einschließlich `::1`, gilt der Container nie als gestartet, und ein späterer Absturz hält ihn an, statt den Server neu zu starten. Alles, was keine IP-Adresse ist, einschließlich `localhost`, stoppt den Server beim Start. |
| `BASE_PATH` | (leer) | Öffentlicher Bereitstellungspfad, z. B. `/snapotter`. Leer oder `/` liefert die App im Stammverzeichnis der Domain aus. Wird zur Laufzeit angewendet; kein erneutes Bauen des Images erforderlich. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximale Anfragen pro Minute und IP. Auf 0 setzen, um die Ratenbegrenzung zu deaktivieren. |
| `API_KEYS_RATE_LIMIT_PER_MIN` | `30` | Maximale Anfragen pro Minute und IP an die Endpunkte zur Verwaltung von API-Schlüsseln (auflisten, erstellen, widerrufen). Schlüssel, die für Tool-Aufrufe verwendet werden, sind davon nicht betroffen. Auf `0` setzen für kein Limit. |
| `CORS_ORIGIN` | (leer) | Durch Kommas getrennte erlaubte Origins für CORS, oder leer für ausschließlich denselben Origin. |
| `LOG_LEVEL` | `info` | Ausführlichkeit der Protokollierung. Eines von: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Welche Peers die Client-IP über `X-Forwarded-For` setzen dürfen. Der Standard vertraut nur einem Peer aus einem privaten Netzwerk, sodass ein Reverse Proxy in einem Docker-Netzwerk oder LAN als vertrauenswürdig gilt, der gefälschte Header eines öffentlichen Clients dagegen nicht. Setzen Sie `true` nur, wenn ein von Ihnen kontrollierter Proxy auf einer öffentlichen Adresse vorgeschaltet ist. |
| `SNAPOTTER_ANALYTICS_DEFAULT` | `on` | Setzen Sie `off`, um eine neue Instanz mit ausgeschalteter Option „Anonyme Produktanalysen“ zu starten, sodass sie ab dem ersten Start nichts sendet. Die Variable füllt die Einstellung nur aus, solange niemand eine gewählt hat. Sobald die Einstellung gespeichert ist, durch einen Administrator oder durch diese Variable, bewirkt eine Änderung der Variable nichts; ein Administrator kann die Analyse weiterhin unter Einstellungen > System > Datenschutz einschalten. |

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
| `LOGIN_ATTEMPT_LIMIT` | `30` | Maximale Anmeldeanfragen pro Minute und IP. Weitere Versuche erhalten bis zum Ablauf der Minute ein `429`. Wiederholte Fehlversuche für einen Benutzernamen erreichen meist zuerst `LOGIN_THROTTLE_MAX_FAILURES`. Ein Administrator kann den Wert unter Einstellungen > System überschreiben. Auf `0` setzen für kein Limit. Ein Build aus dem Quellcode beginnt bei 10. |
| `LOGIN_THROTTLE_MAX_FAILURES` | `10` | Fehlgeschlagene Passwort-Anmeldungen, die ein Benutzername innerhalb von `LOGIN_THROTTLE_WINDOW_S` haben darf, bevor weitere Versuche dafür ein `429` erhalten, unabhängig von der IP, von der sie kommen. Sie werden wieder durchgelassen, sobald die ältesten Fehlversuche aus dem Zeitfenster fallen. Auf 0 setzen, um die Drosselung auszuschalten. |
| `LOGIN_THROTTLE_WINDOW_S` | `900` | Länge dieses Zeitfensters in Sekunden. Muss mindestens 1 sein; der Server startet bei 0 nicht. |

### Speicher {#storage}

| Variable | Standard | Beschreibung |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` oder `s3`. S3 und MinIO benötigen eine Lizenz mit dem Feature s3_storage sowie die unten aufgeführten `S3_*`-Variablen. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@localhost:5432/snapotter` | PostgreSQL-Verbindungszeichenfolge und die Verbindung, über die jede Anfrage bedient wird. Ab 2.3.0 setzen Sie zusätzlich `DATABASE_MIGRATION_URL`, und diese Verbindung wird zur Laufzeitrolle mit minimalen Rechten, die DML auf den Tabellen der App besitzt und sonst nichts. Der Compose-Stack verweist damit auf seinen `postgres`-Dienst; lassen Sie sie (zusammen mit `REDIS_URL`) ungesetzt, um den eingebetteten Modus zu erhalten. Um sich über einen Unix-Socket zu verbinden, nennen Sie das Socket-Verzeichnis in `host`, etwa `postgres://user:pass@localhost/snapotter?host=/var/run/postgresql`, und binden Sie dieses Verzeichnis in den Container ein. |
| `DATABASE_MIGRATION_URL` | (leer) | Privilegierte Verbindung, die nur während des Starts verwendet wird, um Migrationen auszuführen und die Laufzeitrolle zu berechtigen, und die vor der ersten Anfrage wieder geschlossen wird. Lassen Sie sie leer, dann läuft SnapOtter mit einer einzigen Rolle, wobei `DATABASE_URL` beide Aufgaben übernimmt. Siehe [Rollen mit minimalen Rechten](/de/guide/database#least-privilege-roles). |
| `REDIS_URL` | `redis://localhost:6379` | Redis-Verbindungszeichenfolge (für die BullMQ-Job-Warteschlangen). Compose verweist damit auf seinen `redis`-Dienst. Für einen Unix-Socket verwenden Sie `unix:///run/redis/redis.sock?db=5` (fügen Sie `&password=...` hinzu, falls Redis eines verlangt) und binden Sie den Socket in den Container ein. |
| `WORKSPACE_PATH` | `./tmp/workspace` | Verzeichnis für temporäre Dateien während der Verarbeitung. Wird automatisch bereinigt. Das Image setzt `/tmp/workspace`. |
| `FILES_STORAGE_PATH` | `./data/files` | Verzeichnis für dauerhafte Benutzerdateien (hochgeladene Bilder, gespeicherte Ergebnisse). Das Image setzt `/data/files`. |
| `MAX_STORAGE_PER_USER_MB` | `5000` | Obergrenze in Megabyte für das, was jeder Benutzer in der Dateibibliothek behält. Ein Speichervorgang, der sie überschreiten würde, wird mit der belegten Menge und dem Limit abgelehnt. Ein für den Benutzer festgelegtes Kontingent überschreibt den Wert. Auf 0 setzen für unbegrenzt. |

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
| `EMBEDDED_PG_PORT` | `5432` | Loopback-Port für das eingebettete PostgreSQL (nur im eingebetteten Modus). Ändern Sie ihn nur, wenn der Container ein Netzwerk teilt, in dem 5432 belegt ist, etwa mit `--network host`. Er muss sich von `EMBEDDED_REDIS_PORT` unterscheiden und über 1023 liegen, weil PostgreSQL als unprivilegierter Benutzer läuft, der im Host-Netzwerk keinen privilegierten Port binden kann. |
| `EMBEDDED_REDIS_PORT` | `6379` | Dasselbe für das eingebettete Redis, das ebenfalls als unprivilegierter Benutzer läuft. |
| `EMBEDDED_DB_PASSWORDS` | (leer) | Auf `1` setzen, um beim nächsten Start zufällige Passwörter für die Rollen des eingebetteten PostgreSQL und für Redis zu erzeugen, die in `/data/.embedded-db-secrets` abgelegt werden. TCP-Anmeldungen benötigen sie dann. Auf einem Volume, das erstmals mit 2.3.0 oder später angelegt wurde, kann sich der PostgreSQL-Superuser überhaupt nicht über TCP anmelden; auf einem älteren Volume ist der Datenbankeigentümer der Superuser, und sein Passwort ist das, was ihn schützt. Verwenden Sie es immer dann, wenn andere Programme das Netzwerk des Containers teilen, etwa mit `--network host`. Es bleibt für dieses Volume aktiv: Die Passwörter werden bei jedem Start verwendet, auch wenn Sie diese Variable entfernen, und das Löschen von `/data/.embedded-db-secrets` bringt Ihnen nur neue ein, oder einen Start, der fehlschlägt, wenn die Variable nicht gesetzt ist. Wenn der Container nicht startet, weil eine dieser Dateien beschädigt ist, löschen Sie diese Datei mit `docker run --rm -v <volume>:/data --entrypoint rm snapotter/snapotter:<your tag> -r /data/.embedded-db-secrets/<name>` und starten Sie den Container erneut; der nächste Start erzeugt eine neue. Die Variable akzeptiert `1`, `0` oder leer, und jeder andere Wert bricht den Start ab. |
| `EMBEDDED_REDIS_TIMEOUT_S` | `180` | Sekunden, die der Start darauf wartet, dass das eingebettete Redis auf `PING` antwortet, bevor er aufgibt. Bei einer Zeitüberschreitung hält der Container an und protokolliert den Grund, statt zu hängen. Ganze Sekunden von 1 bis 999999; es gibt keinen Wert für unbegrenzt, weil endloses Warten genau der Fehler ist, den diese Grenze verhindern soll. Erhöhen Sie ihn nur, wenn ein langsamer Host sie auslöst. |
| `EMBEDDED_POSTGRES_TIMEOUT_S` | `600` | Dasselbe für das eingebettete PostgreSQL. Die Uhr startet, nachdem das `initdb` beim ersten Start abgeschlossen ist, sie deckt also den Serverstart und die Crash-Recovery ab, nicht die anfängliche Erstellung der Datenbank. |

Upgrade von 1.x: Legen Sie Ihre alte `snapotter.db` unter `/data/snapotter.db` im Volume ab, dann importiert der eingebettete Modus sie beim ersten Start in das eingebettete PostgreSQL. Der Import läuft einmalig; spätere Starts überspringen ihn.

Hinweis zur Telemetrie: Der eingebettete Modus übernimmt den Analytics-Standard des Images wie jede andere Konfiguration. Das veröffentlichte Image wird mit aktivierter Analytics ausgeliefert; um sie zu deaktivieren, bauen Sie mit `--build-arg SNAPOTTER_ANALYTICS=off`, setzen Sie `SNAPOTTER_ANALYTICS_DEFAULT=off` vor dem ersten Start oder nutzen Sie das Opt-out des Admins in der App.

### Verarbeitungslimits {#processing-limits}

| Variable | Standard | Beschreibung |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `0` (unbegrenzt) | Maximale Dateigröße pro Upload in Megabyte. Auf 0 setzen für unbegrenzt. Das veröffentlichte Image liefert `0` aus; ein Build aus dem Quellcode beginnt bei 100. |
| `MAX_BATCH_SIZE` | `0` (unbegrenzt) | Maximale Anzahl von Dateien in einer einzelnen Batch-Anfrage. Auf 0 setzen für unbegrenzt. Das veröffentlichte Image liefert `0` aus; ein Build aus dem Quellcode beginnt bei 100. |
| `CONCURRENT_JOBS` | `0` (automatisch) | Anzahl der Batch-Jobs, die parallel laufen. Auf 0 setzen, um sie anhand der verfügbaren CPU-Kerne automatisch zu ermitteln. |
| `MAX_MEGAPIXELS` | `0` (kein App-Limit) | Maximal zulässige Bildauflösung in Megapixeln. Auf 0 setzen, um das eigene Limit von SnapOtter aufzuheben. Der Bilddecoder lehnt weiterhin alles über etwa 268 MP (16383 x 16383 Pixel) ab, sodass ein Wert über 268 keine zusätzliche Wirkung hat. |
| `MAX_CPU_UPSCALE_MP` | `4` | Größte Eingabe in Megapixeln, die die KI-Hochskalierung auf einem Host ohne GPU annimmt. Die hochskalierte Ausgabe ist zudem auf das 16-Fache dieses Werts begrenzt (standardmäßig 64 MP), sodass ein hoher Skalierungsfaktor das Eingabelimit weiter senkt. Ein größeres Bild wird vor dem Hochskalieren verkleinert, bis es passt; wenn das Ergebnis dadurch nicht größer als das Original wäre, wird die Anfrage stattdessen abgelehnt. Lanczos überspringt das Eingabelimit, nicht aber die Ausgabegrenze. Auf 0 setzen für kein Limit, was viel RAM benötigt: RealESRGAN baut intern immer einen 4x-Puffer auf. |
| `MAX_WORKSPACE_SIZE_GB` | `0` (unbegrenzt) | Obergrenze in GB für die Gesamtgröße von Uploads und gespeicherten Ergebnissen im Workspace. Ist sie überschritten, erhalten Uploads und Tool-Anfragen ein 503, bis Dateien nach `FILE_MAX_AGE_HOURS` ablaufen. Auf 0 setzen für unbegrenzt; lokaler Speicher lehnt Schreibvorgänge weiterhin mit einem 503 ab, sobald auf dem Datenträger weniger als 0,5 GB frei sind. Das veröffentlichte Image liefert `0` aus; ein Build aus dem Quellcode beginnt bei 10. |
| `MAX_WORKER_THREADS` | `0` (automatisch) | Maximale Anzahl an Worker-Threads für die Bildverarbeitung. Auf 0 setzen, um sie anhand der verfügbaren CPU-Kerne automatisch zu ermitteln. |
| `PROCESSING_TIMEOUT_S` | `0` (kein Limit) | Timeout für jeden Aufruf des Python-Sidecars, der die KI-Tools ausführt, in Sekunden. Auf 0 setzen für kein Timeout. Es begrenzt keine Bild-, PDF- oder Medienjobs; das übernehmen `JOB_TIMEOUT_FAST_S` und `JOB_TIMEOUT_LONG_S`. |
| `AI_SIDECAR_IDLE_TIMEOUT` | `600` | Sekunden, die der Python-KI-Sidecar und die Laufzeitumgebung für präzises OCR untätig bleiben, bevor sie sich beenden und ihren Speicher freigeben (etwa 1,3 GB und 0,7 GB im aufgewärmten Zustand). Beide starten bei der nächsten Anfrage erneut, sodass der erste KI-Aufruf nach einem Beenden wegen Leerlaufs die Startkosten der Bibliotheken trägt, einige Sekunden. Auf 0 setzen, damit sie weiterlaufen. Der Standard entspricht `AI_SESSION_IDLE_TIMEOUT`, sodass geladene Modelle nicht früher verworfen werden, als diese Einstellung vorgibt. Wenn Sie `AI_SESSION_IDLE_TIMEOUT` erhöhen, erhöhen Sie diesen Wert entsprechend. |
| `AI_SESSION_IDLE_TIMEOUT` | `0` (automatisch) | Sekunden, die ein geladenes KI-Modell nach der letzten Verwendung im Sidecar zwischengespeichert bleibt. Automatisch sind 600. Wird vom Python-Sidecar gelesen, der beim Beenden nach `AI_SIDECAR_IDLE_TIMEOUT` auch alle zwischengespeicherten Modelle verwirft. |
| `AI_SESSION_CACHE_BYTES` | `0` (automatisch) | Speicherbudget für zwischengespeicherte KI-Modelle in Byte. Automatisch sind 40 % des GPU-Speichers, auf einem reinen CPU-Host gar kein Caching. Auf einem CPU-Host setzen, um Modelle im RAM zwischenzuspeichern; auf einem GPU-Host auf 1 setzen, um das Caching auszuschalten. Wird vom Python-Sidecar gelesen. |
| `MAX_AI_JOBS_PER_USER` | `5` | Einzeldatei-KI-Jobs, die ein Benutzer gleichzeitig in der Warteschlange oder in Ausführung haben darf. Weitere erhalten ein `429`, bis einer abgeschlossen ist. Der KI-Pool führt jeweils einen Job aus, daher verhindert dies, dass ein Benutzer ihn blockiert. KI-Läufe im Batch und in Pipelines zählen nicht mit. Auf 0 setzen für unbegrenzt. |
| `JOB_TIMEOUT_FAST_S` | `120` | Frist für einen Job in den schnellen Pools (Bild- und Dokumenttools), in Sekunden. Ein Job, der länger läuft, schlägt mit einem Timeout-Fehler fehl. Auf 0 setzen für kein Limit. |
| `JOB_TIMEOUT_LONG_S` | `7200` | Frist für einen Job in den langen Pools (KI- und Medientools sowie jedes als lang laufend markierte Tool), in Sekunden. Auf 0 setzen für kein Limit. PDF-OCR in den Modi Balanced und Best verlängert seine eigene Frist anhand der Seitenzahl (2 bzw. 5 Minuten pro Seite), bis zu 6 Stunden, sodass Sie diesen Wert für ein großes PDF nicht erhöhen müssen. |
| `SYNC_WAIT_MS` | `8000` | Wie lange eine Tool-Anfrage auf ihren Job wartet, bevor die API das Warten beendet und `202` mit einer Job-ID zurückgibt, der Sie über SSE folgen können, in Millisekunden. Den Job selbst stoppt das nicht. Auf 0 setzen, um auf den Job zu warten, egal wie lange er dauert. |
| `MAX_PIPELINE_STEPS` | `20` | Maximale Anzahl von Schritten in einer Pipeline. Auf 0 setzen für kein Limit. |
| `MAX_PIPELINE_STEP_PIXELS` | `67108864` | Größte Ausgabe, die ein Pipeline-Schritt anfordern darf, als Breite mal Höhe in Pixeln (der Standardwert entspricht 8192 x 8192). Ein Schritt, dessen Einstellungen mehr verlangen, wird abgelehnt, bevor die Pipeline läuft. Auf 0 setzen für kein Limit. |
| `MAX_CANVAS_PIXELS` | `0` (kein Limit) | Maximale Canvas-Größe in Pixeln für Ausgabebilder. Auf 0 setzen für kein Limit. |
| `MAX_SVG_SIZE_MB` | `50` | Größte vor dem Bereinigen akzeptierte SVG-Datei in Megabyte. `0` verhält sich hier anders als in den Zeilen darum herum. Es hebt die Größenobergrenze vor dem Parsen vollständig auf, statt sie anzuheben, also lassen Sie diesen Wert gesetzt. |
| `MAX_PDF_PAGES` | `0` (unbegrenzt) | Maximale Anzahl von PDF-Seiten für die Konvertierung von PDF in Bilder. Auf 0 setzen für unbegrenzt. |
| `MAX_VIDEO_DURATION_S` | `0` (unbegrenzt) | Längstes Video, das die Video-Tools akzeptieren, in Sekunden. Längere Dateien werden vor der Verarbeitung abgelehnt, wobei der Fehler die Dauer und das Limit nennt. Auf 0 setzen für unbegrenzt. |
| `MAX_AUDIO_DURATION_S` | `0` (unbegrenzt) | Dasselbe für die Audio-Tools. |
| `MAX_VIDEO_BITRATE_KBPS` | `0` (unbegrenzt) | Höchste Gesamtbitrate, die die Video-Tools akzeptieren, in Kilobit pro Sekunde. Auf 0 setzen für unbegrenzt. |
| `PREVIEW_TIMEOUT_S` | `300` | Zeitlimit für das Kodieren eines Vorschauclips einer Video- oder Audiodatei im Browser, in Sekunden. Dokumentvorschauen verwenden stattdessen `LIBREOFFICE_TIMEOUT_S`. Auf 0 setzen für kein Limit. |
| `LIBREOFFICE_TIMEOUT_S` | `120` | Zeitlimit für eine LibreOffice-Konvertierung (Word, Excel und PowerPoint nach PDF, die Dokumentkonverter und Dokumentvorschauen) in Sekunden. Auf `0` setzen für kein Limit. |
| `GIF_BG_MAX_FRAMES` | `150` | Maximale Anzahl an Frames, die GIF-Hintergrund entfernen in einer Animation akzeptiert. Längere Animationen erhalten ein `400`, das die Frame-Anzahl nennt. Auf 0 setzen für kein Frame-Limit; ein separates Pixelbudget gilt weiterhin. |
| `SUBPROCESS_MEMORY_LIMIT_MB` | `0` (aus) | Obergrenze des Adressraums in Megabyte für jeden dieser Hilfsprozesse: ffmpeg, ffprobe, Ghostscript, qpdf, LibreOffice, pandoc und pdfcpu in den Medien- und Dokument-Engines sowie, für Bilder, exiftool, die HEIF-, JPEG-XL- und JPEG-2000-Decoder und -Encoder, den RAW-Decoder und den ffmpeg-Fallback-Decoder. ImageMagick ist nicht begrenzt, weil es eigene Speicherlimits hat, ebenso wenig der KI-Sidecar. Ein Prozess, der die Grenze überschreitet, wird beendet, statt den gesamten Container in den Out-of-Memory-Killer zu treiben. Begrenzt wird der virtuelle, nicht der residente Speicher, setzen Sie den Wert also deutlich über dem, was ein Prozess tatsächlich nutzt. Der JPEG-XL-Encoder braucht am meisten: Ein Bild mit 24 MP benötigte etwa 1,8 GB und scheiterte bei 1 GB, und mehr Threads oder CPUs ändern daran nicht viel. Solange die Grenze gesetzt ist, wird der HEIF-Encoder auf zwei Worker-Threads beschränkt, was eine Kodierung mit 24 MP auf etwa 0,8 GB senkt, auf Kosten einer langsameren Kodierung. Beginnen Sie bei `2048` und senken Sie den Wert erst, nachdem Sie Ihre größten Dateien getestet haben. Auf 0 setzen, um die Grenze auszuschalten und sich auf das Speicherlimit des Containers zu verlassen. |
| `MAX_SETTINGS_PAYLOAD_KB` | `64` | Größtes `settings`-Feld, das eine Tool-Anfrage enthalten darf, in Kilobyte, gezählt in UTF-8-Bytes. Anfragen über dem Limit erhalten ein `400`. Auf 0 setzen für kein Limit. Echte Tool-Einstellungen sind weit kleiner als 64 KB, erhöhen Sie diesen Wert also nur, wenn ein Client ungewöhnlich große Einstellungen sendet. |
| `MAX_SUBTITLE_SIZE_MB` | `1` | Größte Untertiteldatei (`.srt`, `.vtt`, `.ass`), die Untertitel einbrennen und Untertitel einbetten akzeptieren, in Megabyte. Größere Dateien erhalten ein `400`, das Dateigröße und Limit nennt. Auf 0 setzen für kein Limit. Eine Untertiteldatei in Spielfilmlänge liegt meist deutlich unter 1 MB. |
| `MAX_METADATA_TAG_LENGTH` | `10000` | Längster Wert, den Metadaten bearbeiten in ein einzelnes Tag schreibt (Künstler, Beschreibung, Schlüsselwörter usw.), in Zeichen. Längere Werte erhalten ein `400`, das Tag und Limit nennt. Auf 0 setzen für kein Limit. Erhöhen Sie ihn, wenn Sie lange Bildunterschriften oder Beschreibungen speichern. Ein Tag-Wert muss außerdem in `MAX_SETTINGS_PAYLOAD_KB` und in das Argumentlimit des Betriebssystems pro Argument passen (128 KB unter Linux). |

### KI-Tools {#ai-tools}

Diese Variablen liest der Python-Sidecar. Setzen Sie sie in der Container-Umgebung (oder in `.env` bei den veröffentlichten Compose-Dateien) und starten Sie neu.

| Variable | Standard | Beschreibung |
|---|---|---|
| `SNAPOTTER_GPU` | (leer) | Auf `0`, `false` oder `no` setzen, damit jedes KI-Tool auf der CPU läuft, auch wenn eine GPU vorhanden ist. Jeder andere Wert und ein leeres Feld lassen SnapOtter die erkannte GPU nutzen. Verwenden Sie die Variable, wenn einer kleinen GPU mitten in einem Auftrag der Speicher ausgeht oder wenn ein Treiberproblem GPU-Läufe scheitern lässt. Am ehesten spielt sie bei nativen und LXC-Installationen eine Rolle, die jetzt die GPU nutzen, sobald das pip-cuDNN-Wheel vorhanden ist. CPU-Läufe sind langsamer, und `MAX_CPU_UPSCALE_MP` gilt für das Hochskalieren. |
| `SD15_INPAINT_DIR` | `$MODELS_PATH/sd15-inpainting` | Ordner mit dem Stable-Diffusion-1.5-Inpainting-Modell (diffusers-Layout), das Objektentferner im Modus für hohe Qualität verwendet. Das Feature-Bundle `inpaint-hq` legt es hier ab, ändern Sie die Variable also nur, wenn Sie das Modell anderswo aufbewahren. `MODELS_PATH` setzt SnapOtter auf `ai/models` im Datenverzeichnis. |
| `SD15_INPAINT_STEPS` | `28` | Entrauschungsschritte pro Entfernung. Mehr Schritte können mehr Details bringen und dauern proportional länger. |
| `SD15_INPAINT_STRENGTH` | `0.95` | Wie weit das Modell den maskierten Bereich neu malen darf, von 0 bis 1. Niedrigere Werte behalten mehr der ursprünglichen Pixel (der Bereich wird zuerst aus seiner Umgebung aufgefüllt und dann leicht verfeinert). Höhere Werte lassen das Modell freier neu malen, und `1` ignoriert die Umgebung und malt aus dem Rauschen, was eher ein neues Objekt erfindet. |
| `SD15_INPAINT_GUIDANCE` | `7.0` | Wie stark das Modell den Prompts folgt. Höhere Werte folgen ihnen wörtlicher; sehr hohe Werte können hart wirken. |
| `SD15_INPAINT_PROMPT` | (leer) | Text, der beschreibt, was in den entfernten Bereich gemalt werden soll. Leer funktioniert beim Entfernen am besten, weil das Modell dann die Umgebung fortsetzt. |
| `SD15_INPAINT_NEGATIVE` | `object, person, text, watermark, artifact, blurry, distorted, extra limbs` | Text, der beschreibt, was im entfernten Bereich nicht vorkommen soll. Der Standardwert hält das Modell davon ab, ein neues Objekt in die Lücke zu malen. |
| `SD15_INPAINT_SEED` | `0` | Zufalls-Seed. Mit einem festen Seed werden dasselbe Bild und dieselbe Maske jedes Mal gleich entfernt. Ändern Sie ihn, um ein anderes Ergebnis zu erhalten. |

### Engines {#engines}

SnapOtter sucht jede Verarbeitungsbinärdatei im Container über `$PATH`, daher bleiben diese Variablen leer, es sei denn, Sie binden einen eigenen Build ein.

| Variable | Standard | Beschreibung |
|---|---|---|
| `FFMPEG_PATH` | (leer) | Pfad zur `ffmpeg`-Binärdatei hinter den Video- und Audiotools. |
| `FFPROBE_PATH` | (leer) | Pfad zu `ffprobe`, das Mediendateien liest, bevor sie verarbeitet werden. Verweisen Sie auf denselben Build wie `FFMPEG_PATH`. |
| `QPDF_PATH` | (leer) | Pfad zu `qpdf`, das von den PDF-Tools und zur Prüfung hochgeladener PDFs verwendet wird. |
| `SOFFICE_PATH` | (leer) | Pfad zu `soffice` von LibreOffice, das für Office-Dokumentkonvertierungen verwendet wird. |
| `PDFCPU_PATH` | (leer) | Pfad zu `pdfcpu`, das von einigen PDF-Tools verwendet wird. |
| `GS_PATH` | (leer) | Pfad zu `gs` von Ghostscript, das von den PDF-Tools und von PDF-OCR verwendet wird. |
| `PANDOC_PATH` | (leer) | Pfad zu `pandoc`, das für Dokumentkonvertierungen verwendet wird. |
| `SNAPOTTER_FONT_FILE` | (leer) | Schriftdatei für Text, der auf Video gezeichnet wird (Untertitel einbrennen, Video-Wasserzeichen). Leer verwendet die erste Schrift, die das Image findet. |
| `SNAPOTTER_FONT_FAMILY` | (leer) | Familienname von `SNAPOTTER_FONT_FILE`. Leer bedeutet `Sans`. |
| `SNAPOTTER_HW_ACCEL` | (leer) | Familie des Hardware-Videoencoders, `nvenc` oder `vaapi`. Leer kodiert in Software. |

`SNAPOTTER_HW_ACCEL` benötigt ein ffmpeg, das mit dieser Encoder-Familie gebaut wurde, und das ffmpeg im Image hat keine von beiden. Mit der Binärdatei des Images fällt die Einstellung auf Software-Kodierung zurück und meldet das im Startprotokoll. Um sie zu nutzen, binden Sie Ihren eigenen ffmpeg-Build ein, verweisen `FFMPEG_PATH` und `FFPROBE_PATH` darauf und geben dem Container das GPU-Gerät. Setzen Sie für `nvenc` außerdem `NVIDIA_DRIVER_CAPABILITIES=compute,utility,video`: Das Image fordert nur `compute,utility` an, und ohne `video` bindet die NVIDIA-Runtime die Encode-Bibliothek nicht ein, sodass der Encoder zwar aufgelistet wird, aber jede Kodierung fehlschlägt. Ein Pfad-Override, der nicht existiert oder nicht ausführbar ist, wird ebenfalls im Startprotokoll genannt, und jeder Job, der diese Binärdatei benötigt, schlägt fehl, bis Sie den Pfad korrigieren oder die Variable entfernen.

Die veröffentlichten Compose-Dateien reichen sie alle aus `.env` durch, es genügt also, sie dort zu setzen.

### Bereinigung {#cleanup}

| Variable | Standard | Beschreibung |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Wie lange nicht gespeicherte Verarbeitungsergebnisse (rohe Uploads und Tool-Ausgaben) aufbewahrt werden, bevor sie automatisch gelöscht werden. Dateien, die Sie ausdrücklich in der Dateibibliothek speichern, sind davon nicht betroffen und bleiben bestehen, bis Sie sie löschen. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Wie oft der Bereinigungsjob läuft. |
| `JOBS_RETENTION_DAYS` | `30` | Tage, die ein abgeschlossener Job-Eintrag (erfolgreich, fehlgeschlagen oder abgebrochen) aufbewahrt wird, bevor die Aufbewahrungsbereinigung, die alle 6 Stunden läuft, ihn löscht. Ein Administrator kann den Wert unter Einstellungen > System überschreiben. Benutzer und Teams mit Legal Hold behalten ihre Einträge. Auf 0 setzen, um sie für immer aufzubewahren. |
| `AUDIT_RETENTION_DAYS` | `0` (für immer) | Tage, die Einträge des Audit-Protokolls aufbewahrt werden. Es gelten dieselben Überschreibungs- und Legal-Hold-Regeln. Solange manipulationssichere Audit-Protokollierung aktiv ist, wird nichts gelöscht. Auf 0 setzen, um sie für immer aufzubewahren. |

### Enterprise-Lizenz {#enterprise-license}

| Variable | Standard | Beschreibung |
|---|---|---|
| `SNAPOTTER_LICENSE_KEY` | (leer) | Lizenzschlüssel, der die Enterprise-Funktionen freischaltet, etwa SAML, SCIM und S3-Speicher. Wird beim Start gelesen, starten Sie also nach einer Änderung neu. Ein ungültiger oder abgelaufener Schlüssel protokolliert eine Warnung, und der Server läuft ohne diese Funktionen. Im Container können Sie ihn stattdessen über `SNAPOTTER_LICENSE_KEY_FILE` einbinden (siehe [Docker-Secrets](/de/guide/security#docker-secrets)). |

### Darstellung {#appearance}

| Variable | Standard | Beschreibung |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standard-Theme für neue Sitzungen. `light`, `dark` oder `system`. |
| `DEFAULT_LOCALE` | `en` | Standardsprache der Oberfläche. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standardlayout der Tools. `sidebar` oder `fullscreen`. |

### Docker-Berechtigungen {#docker-permissions}

| Variable | Standard | Beschreibung |
|---|---|---|
| `PUID` | `999` | Den Containerprozess mit dieser UID ausführen. Passen Sie sie für Bind-Mounts an Ihren Host-Benutzer an (`id -u`). Erfordert ein beschreibbares Root-Dateisystem; siehe den [Sicherheitsleitfaden](/de/guide/security#why-read-only-is-not-set). |
| `PGID` | `999` | Den Containerprozess mit dieser GID ausführen. Passen Sie sie für Bind-Mounts an Ihre Host-Gruppe an (`id -g`). Erfordert ein beschreibbares Root-Dateisystem; siehe den [Sicherheitsleitfaden](/de/guide/security#why-read-only-is-not-set). |

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
