---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: 7e436ba9e7e4
i18n_hash_version: 2
---
# Ressourcenschonende Setups {#low-resource-setups}

SnapOtter läuft gut auf kleiner Hardware: einem Raspberry Pi 4 oder 5, einem alten Notebook oder einem VPS mit 2 GB. Diese Seite ist die praktische Anleitung für diese Rechner: was Sie erwarten können, ein Setup zum Kopieren mit sinnvollen Limits und welche Funktionen Sie weglassen sollten. Die vollständigen Benchmark-Daten hinter diesen Werten finden Sie unter [Hardwareanforderungen](/de/guide/deployment#hardware-requirements).

Zwei harte Einschränkungen vorab:

- **Nur 64 Bit.** Das Image wird für `linux/amd64` und `linux/arm64` gebaut. 32-Bit-ARM (`armv7`/`armhf`) wird nicht unterstützt, daher scheiden Pis der ersten Generation und die Pi-Zero-Familie aus.
- **Speicheruntergrenze von 2 GB (Nicht-KI-Werkzeuge).** Mit 512 MB lässt sich der Stack nicht starten, und 1 GB scheitert bei Batches mit mehreren Dateien. 2 GB mit 2 Kernen ist die kleinste Konfiguration, die die Nicht-KI-Werkzeuge komfortabel ausführt.

## Was auf kleiner Hardware gut läuft {#what-runs-well}

Jedes Nicht-KI-Werkzeug funktioniert auf einem Rechner mit 2 GB / 2 Kernen: die kompletten Bereiche Bild und Dateien, PDF-Werkzeuge sowie die Stream-Copy-Operationen für Video und Audio (kürzen, stummschalten, Container-Remux). Die meisten sind in unter einer Sekunde fertig.

Zwei Arbeitslasten sind Ausnahmen:

- **Video-Neukodierung** (Konvertierung zwischen Codecs) ist CPU-gebunden. Ein 1080p-Clip, der auf einer schnellen Desktop-CPU ~40 s benötigt, kann auf einer CPU der Pi-Klasse mehrere Minuten dauern. Stream-Copy-Operationen bleiben sofort erledigt.
- **KI-Werkzeuge** haben CPU-Speicheruntergrenzen pro Bundle: 2 GB Host-RAM (0,5 GB frei) für Gesichtserkennung und die integrierte schnelle OCR, 4 GiB konfigurierter effektiver Speicher für genaue OCR, 4 GB Host-RAM (2 bis 3 GB frei) für Transkription, Objektradierer und Kolorierung, Hintergrundentfernung, Hochskalierung und Verbesserung sowie Fotorestaurierung und 8 GB Host-RAM (6 GB frei) für hochwertiges Inpainting. Ein Rechner mit 2 GB kann Whisper, RealESRGAN, rembg oder LaMa nicht ausführen, ohne vom OOM-Killer beendet zu werden. SnapOtter prüft daher den freien Speicher, bevor es an den Python-Sidecar übergibt, und lehnt Läufe unterhalb der Bundle-Untergrenze sofort ab.

Keines von beiden wird installiert oder ausgeführt, solange Sie es nicht nutzen: Ohne installierte KI-Bundles liegt die App im Leerlauf bei etwa 360 MB, und KI-Bundles werden erst heruntergeladen, wenn ein Administrator sie aktiviert.

## Anleitung für Raspberry Pi / altes Notebook {#walkthrough}

Dies ist die Standard-Compose-Installation aus [Erste Schritte](/de/guide/getting-started) plus Ressourcenlimits und konservativen Obergrenzen. Sie setzt ein 64-Bit-Betriebssystem voraus (auf einem Pi: Raspberry Pi OS 64-Bit oder Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
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
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Hinweise für Rechner der Pi-Klasse:

- **Bevorzugen Sie eine USB-SSD gegenüber einer SD-Karte** für das Datenvolume und Postgres. Job-Arbeitsbereiche verursachen echte Festplatten-E/A, und SD-Karten sind sowohl langsam als auch schnell verschlissen.
- **Der All-in-One-Einzelcontainer funktioniert hier ebenfalls** (eingebettetes Postgres und Redis, wenn `DATABASE_URL`/`REDIS_URL` nicht gesetzt sind). Auf einem speicherbegrenzten Host sollten Sie sein eingebettetes Redis-Limit mit `REDIS_MAXMEMORY` senken (siehe [Konfiguration](/de/guide/configuration)). Compose bietet feinere Kontrolle pro Dienst, weshalb diese Anleitung es verwendet.
- **Fügen Sie auf Geräten mit 2 GB Swap hinzu.** Das verhindert, dass gelegentliche Spitzen (ein großes PDF, ein Batch, den Sie nicht begrenzt haben) in einem Out-of-Memory-Kill enden. zram ist die SD-karten-schonende Option.
- Das arm64-Image ist reines CPU-Image; auf ARM-Boards gibt es kein CUDA.

## Die Stellschrauben {#tuning-knobs}

Alle Limits sind Umgebungsvariablen, die vollständig in der [Konfiguration](/de/guide/configuration) dokumentiert sind. `0` bedeutet unbegrenzt oder automatisch. Die wichtigsten auf kleiner Hardware:

| Variable | Vorschlag für kleine Systeme | Was sie schützt |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Wie viele Aufträge parallel laufen. Die automatische Erkennung verwendet die CPU-Kerne minus eins, was auf großen Rechnern passt, auf einem System mit 2 Kernen unter Speicherdruck aber zu eifrig ist. |
| `MAX_WORKER_THREADS` | `2` | Thread-Pool der Bildverarbeitung. |
| `MAX_BATCH_SIZE` | `5` | Bei Batches geht Rechnern mit 1-2 GB zuerst der Speicher aus. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Verhindert, dass eine einzelne riesige Datei den gesamten Arbeitsbereich belegt. |
| `MAX_MEGAPIXELS` | `50` | Das Dekodieren eines Bildes mit 100+ MP kostet unabhängig von der Dateigröße RAM. |
| `MAX_VIDEO_DURATION_S` | `300` | Lange Transkodierungen blockieren eine kleine CPU für Minuten bis Stunden. |
| `PROCESSING_TIMEOUT_S` | `600` | Harte Obergrenze, damit ein außer Kontrolle geratener Auftrag den Rechner irgendwann wieder freigibt. |

Diese Limits gelten für das, was der Server annimmt. Stellen Sie sie daher passend zu dem ein, was Sie tatsächlich nutzen, und nicht so klein wie möglich. Wenn Sie nie mit Video arbeiten, kostet ein Limit `MAX_VIDEO_DURATION_S` nichts; wenn Sie täglich Dokumente scannen, begrenzen Sie `MAX_PDF_PAGES` nicht.

## Was Sie weglassen sollten {#what-to-skip}

- **Große KI-Bundles.** Hochskalierung, Fotorestaurierung und Hintergrundentfernung benötigen eine GPU oder eine schnelle CPU mit vielen Kernen, und jedes Bundle kostet 4-5 GB Festplattenplatz. Installieren Sie sie auf einem kleinen Rechner schlicht nicht; Werkzeuge, deren Bundle fehlt, zeigen eine Installationsaufforderung an, statt zu laufen.
- **Video-Neukodierung als Routinelast.** Gelegentliche Transkodierungen sind in Ordnung (nur langsam); eine ständige Transkodierungs-Warteschlange braucht CPU-Kerne, keinen Pi.
- **Ungenutzte Werkzeuge im Allgemeinen.** Ein Administrator kann einzelne Werkzeuge in den Einstellungen abschalten, wodurch sie aus der Oberfläche verschwinden und ihre API-Routen nicht mehr registriert werden. Das spart für sich genommen keinen Speicher, verhindert aber, dass eine gemeinsam genutzte kleine Instanz für die eine Arbeitslast verwendet wird, die die Hardware nicht bewältigen kann.

Wenn Sie die Instanz später auf größere Hardware verschieben, entfernen Sie die Limits (setzen Sie sie zurück auf `0`), und dasselbe Datenvolume wird übernommen.