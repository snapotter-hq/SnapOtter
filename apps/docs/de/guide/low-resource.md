---
i18n_source_hash: f5de74aee1b9
i18n_provenance: machine
i18n_output_hash: 3b61925b1289
---
# Ressourcenarme Setups {#low-resource-setups}

SnapOtter läuft gut auf kleiner Hardware: einem Raspberry Pi 4 oder 5, einem alten Laptop oder einem 2-GB-VPS. Diese Seite ist der praktische Leitfaden für solche Maschinen: was dich erwartet, ein Copy-Paste-Setup mit vernünftigen Limits und welche Funktionen du auslassen solltest. Die vollständigen Benchmark-Daten hinter diesen Zahlen findest du unter [Hardware-Anforderungen](/de/guide/deployment#hardware-requirements).

Zwei harte Einschränkungen vorweg:

- **Nur 64-Bit.** Das Image wird für `linux/amd64` und `linux/arm64` gebaut. 32-Bit-ARM (`armv7`/`armhf`) wird nicht unterstützt; Pis der ersten Generation und die Pi-Zero-Familie fallen damit weg.
- **Speicheruntergrenze 2 GB.** Mit 512 MB startet der Stack nicht, und 1 GB scheitert an Stapeln mit mehreren Dateien. 2 GB mit 2 Kernen sind die kleinste Konfiguration, die komfortabel funktioniert.

## Was auf kleiner Hardware gut läuft {#what-runs-well}

Jedes Nicht-KI-Tool funktioniert auf einer Maschine mit 2 GB und 2 Kernen: die Bereiche Bild und Dateien komplett, die PDF-Tools und die Stream-Copy-Operationen für Video und Audio (Trimmen, Stummschalten, Container-Remux). Die meisten sind in unter einer Sekunde fertig.

Zwei Workloads sind die Ausnahme:

- **Video-Neukodierung** (Konvertieren zwischen Codecs) ist CPU-gebunden. Ein 1080p-Clip, der auf einer schnellen Desktop-CPU ~40 s braucht, kann auf einer CPU der Pi-Klasse mehrere Minuten dauern. Stream-Copy-Operationen bleiben sofort fertig.
- **KI-Tools** brauchen RAM (4 GB empfohlen) und Festplattenplatz (die größeren Bundles sind je 4-5 GB groß), und die schweren (Hochskalierung, Foto-Wiederherstellung, Hintergrundentfernung) sind auf CPUs der Pi-Klasse nicht praktikabel. Leichte KI wie Gesichtserkennung und OCR ist nutzbar, wenn der Speicher dafür reicht.

Beides ist weder installiert noch aktiv, solange du es nicht benutzt: Ohne installierte KI-Bundles braucht die App im Leerlauf rund 360 MB, und KI-Bundles werden erst heruntergeladen, wenn ein Admin sie aktiviert.

## Schritt für Schritt: Raspberry Pi / alter Laptop {#walkthrough}

Das ist die Standard-Compose-Installation aus [Erste Schritte](/de/guide/getting-started), plus Ressourcenlimits und konservative Obergrenzen. Sie setzt ein 64-Bit-Betriebssystem voraus (auf einem Pi: Raspberry Pi OS 64-bit oder Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@db:5432/snapotter
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=snapotter
      - POSTGRES_PASSWORD=snapotter
      - POSTGRES_DB=snapotter
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Hinweise für Maschinen der Pi-Klasse:

- **Nimm lieber eine USB-SSD statt einer SD-Karte** für das Daten-Volume und Postgres. Job-Workspaces erzeugen echtes Disk-IO, und SD-Karten sind langsam und schnell verschlissen.
- **Der All-in-One-Einzelcontainer funktioniert hier ebenfalls** (eingebettetes Postgres und Redis, wenn `DATABASE_URL`/`REDIS_URL` nicht gesetzt sind). Auf einem Host mit knappem Speicher solltest du das Limit seines eingebetteten Redis mit `REDIS_MAXMEMORY` senken (siehe [Konfiguration](/de/guide/configuration)). Compose gibt dir feinere Kontrolle pro Service, deshalb nutzt diese Anleitung Compose.
- **Richte auf 2-GB-Geräten Swap ein.** Das verhindert, dass die gelegentliche Spitze (ein großes PDF, ein Stapel, den du zu begrenzen vergessen hast) in einem Out-of-Memory-Kill endet. zram ist die SD-Karten-freundliche Variante.
- Das arm64-Image ist reine CPU; auf ARM-Boards gibt es kein CUDA.

## Die Stellschrauben {#tuning-knobs}

Alle Obergrenzen sind Umgebungsvariablen und vollständig unter [Konfiguration](/de/guide/configuration) dokumentiert. `0` bedeutet unbegrenzt oder automatisch. Die wichtigen auf kleiner Hardware:

| Variable | Vorschlag für kleine Maschinen | Wovor sie schützt |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Wie viele Jobs parallel laufen. Die Auto-Erkennung nimmt CPU-Kerne minus eins; auf großen Maschinen passt das, auf einer 2-Kern-Box unter Speicherdruck ist es zu forsch. |
| `MAX_WORKER_THREADS` | `2` | Thread-Pool der Bildverarbeitung. |
| `MAX_BATCH_SIZE` | `5` | Bei Stapeln geht Maschinen mit 1-2 GB zuerst der Speicher aus. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Verhindert, dass eine einzelne riesige Datei den gesamten Workspace belegt. |
| `MAX_MEGAPIXELS` | `50` | Das Dekodieren eines Bilds mit 100+ MP kostet RAM, unabhängig von der Dateigröße. |
| `MAX_VIDEO_DURATION_S` | `300` | Lange Transkodierungen blockieren eine kleine CPU für Minuten bis Stunden. |
| `PROCESSING_TIMEOUT_S` | `600` | Harte Obergrenze, damit ein außer Kontrolle geratener Job die Maschine irgendwann wieder freigibt. |

Diese Obergrenzen gelten für das, was der Server annimmt. Setze sie also passend zu dem, was du tatsächlich nutzt, nicht so klein wie möglich. Wenn du Video nie anfasst, kostet ein `MAX_VIDEO_DURATION_S`-Limit nichts; wenn du täglich Dokumente scannst, begrenze `MAX_PDF_PAGES` nicht.

## Was du auslassen solltest {#what-to-skip}

- **Schwere KI-Bundles.** Hochskalierung, Foto-Wiederherstellung und Hintergrundentfernung wollen eine GPU oder eine schnelle CPU mit vielen Kernen, und jedes Bundle kostet 4-5 GB Festplattenplatz. Auf einer kleinen Maschine installierst du sie einfach nicht; Tools, deren Bundle fehlt, zeigen eine Installationsaufforderung, statt zu laufen.
- **Video-Neukodierung als Dauer-Workload.** Gelegentliche Transkodierungen sind in Ordnung (sie sind nur langsam); eine stetige Transcode-Warteschlange braucht CPU-Kerne, keinen Pi.
- **Ungenutzte Tools generell.** Ein Admin kann einzelne Tools in den Einstellungen abschalten; das entfernt sie aus der Oberfläche und registriert ihre API-Routen nicht mehr. Für sich genommen spart das keinen Speicher, aber es verhindert, dass eine geteilte kleine Instanz für genau den Workload benutzt wird, den die Hardware nicht stemmen kann.

Wenn du die Instanz später auf größere Hardware umziehst, entferne die Obergrenzen (setze sie zurück auf `0`); dasselbe Daten-Volume nimmst du einfach mit.
