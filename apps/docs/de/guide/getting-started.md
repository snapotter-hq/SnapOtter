---
description: "Installieren Sie SnapOtter mit Docker in einem einzigen Befehl. Enthält die Docker-Compose-Einrichtung, den Build aus dem Quellcode und eine vollständige Funktionsübersicht."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: a004afad029c
i18n_hash_version: 2
---

# Erste Schritte {#getting-started}

::: tip Vor der Installation ausprobieren
Erkunden Sie die vollständige Oberfläche unter [demo.snapotter.com](https://demo.snapotter.com), ganz ohne Registrierung oder Installation.
:::

## Schnellstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Dieser einzelne Container führt alles aus, was er benötigt: Wenn `DATABASE_URL` nicht gesetzt ist, startet er sein eigenes PostgreSQL und Redis auf der Loopback-Schnittstelle (eingebetteter Modus) und hält alle Daten im Volume `SnapOtter-data`. Das ist der schnellste Weg, SnapOtter auszuprobieren oder im Homelab selbst zu hosten. Für den Produktivbetrieb verwenden Sie den [kanonischen Docker-Compose-Stack](#docker-compose), der PostgreSQL und Redis in eigenen Containern hält. Der eingebettete Modus läuft als root (Standard) und schaltet sich automatisch ab, sobald Sie `DATABASE_URL` setzen.

Installieren Sie auf einem Raspberry Pi, einem alten Notebook oder einem kleinen VPS? Siehe [Ressourcenschonende Setups](/de/guide/low-resource) für eine abgestimmte Anleitung und was Sie von eingeschränkter Hardware erwarten können.

Bei der ersten Anmeldung werden Sie aufgefordert, Ihr Passwort zu ändern.

::: tip Anonyme Produktanalysen
SnapOtter enthält standardmäßig anonyme Produktanalysen. Um sie auszuschalten, öffnen Sie **Einstellungen → System → Datenschutz** und schalten Sie **Anonyme Produktanalysen** aus. Das wirkt sofort für die gesamte Instanz.

Sie können auch die Umgebungsvariable `SNAPOTTER_TELEMETRY=0` setzen (`false` und `off` funktionieren ebenfalls), um die gesamte Telemetrie der Instanz ohne Neubau zu deaktivieren.

Die Fehlerüberwachung erfolgt über [Sentry](https://sentry.io), das SnapOtter über sein Open-Source-Programm unterstützt.

Details dazu, was erfasst wird, finden Sie unter [Was SnapOtter erfasst](/de/guide/telemetry).
:::

::: tip NVIDIA-CUDA-Beschleunigung
Fügen Sie `--gpus all` hinzu, um Hintergrundentfernung, Hochskalierung, Gesichtsverbesserung und Restaurierung mit NVIDIA CUDA zu beschleunigen. OCR bleibt CPU-basiert und funktioniert im selben Image mit oder ohne GPU-Zugriff:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Erfordert das [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Fällt automatisch auf die CPU zurück, wenn CUDA nicht verfügbar ist. Eine Beschleunigung über Intel/AMD-iGPUs mittels VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Benchmarks finden Sie unter [Docker-Tags](/de/guide/docker-tags). Wenn KI-Werkzeuge trotz `--gpus all` auf der CPU laufen, siehe [GPU-Beschleunigung überprüfen](/de/guide/deployment#verify-gpu-acceleration).
:::

::: details Auch auf GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide Registries veröffentlichen bei jedem Release dasselbe Image.
:::

## Docker Compose {#docker-compose}

Verwenden Sie die Produktionsdatei, die mit jedem Release gepflegt und getestet wird, anstatt ein verkürztes Compose-Beispiel von dieser Seite zu kopieren:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.3.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Die kanonische [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) enthält alle vier Laufzeit-Volumes, Health-Checks, Ressourcenlimits, eine dauerhafte Redis-Konfiguration, fixierte Datenbank-/Cache-Images und die aktuelle Container-Härtung. Ändern Sie das Standard-Administratorpasswort unmittelbar nach der ersten Anmeldung. Für eine reproduzierbare Bereitstellung fixieren Sie das SnapOtter-Anwendungs-Image auf das von Ihnen geprüfte Release-Tag oder den Digest, anstatt `latest` zu folgen.

Alle Umgebungsvariablen finden Sie unter [Konfiguration](/de/guide/configuration), Hinweise zu Secrets, Netzwerkrichtlinien und Backups unter [Sicherheit und Härtung](/de/guide/security).

## Aus dem Quellcode bauen {#build-from-source}

**Voraussetzungen:** Node.js 22.22+, pnpm 9+, Docker (für Postgres + Redis), Python 3.11+ (für KI-Funktionen), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Was Sie tun können {#what-you-can-do}

### Dateiverarbeitung (200+ Werkzeuge) {#file-processing-200-tools}

| Modalität | Anzahl | Beispielwerkzeuge |
|----------|-------|---------------|
| **Bild** | 112 | Größe ändern, Zuschneiden, Komprimieren, Konvertieren, Hintergrund entfernen, Hochskalieren, OCR, Wasserzeichen, Collage, Kolorieren, GIF-Werkzeuge, Formatvorgaben |
| **Video** | 57 | Kürzen, Zuschneiden, Komprimieren, Konvertieren, Zusammenführen, Audio extrahieren, Automatische Untertitel, Video zu GIF, Größe ändern, Stabilisieren, Formatvorgaben |
| **Audio** | 27 | Kürzen, Zusammenführen, Konvertieren, Normalisieren, Rauschreduzierung, Transkribieren, Tonhöhe ändern, Überblenden, Klingelton-Ersteller, Formatvorgaben |
| **PDF / Dokument** | 35 | Zusammenführen, Teilen, Komprimieren, OCR, Wasserzeichen, Schwärzen, Word zu PDF, Excel zu PDF, Drehen, Schützen, Reparieren |
| **Dateien** | 23 | CSV zu JSON, JSON zu XML, CSVs zusammenführen, CSV teilen, ZIP erstellen, ZIP extrahieren, Diagramm-Ersteller, YAML/JSON |

### Pipelines {#pipelines}

Verketten Sie Werkzeuge zu mehrstufigen Workflows und wenden Sie sie auf ein Bild oder einen ganzen Batch an:

1. Öffnen Sie **Pipelines** in der Seitenleiste.
2. Fügen Sie Schritte hinzu (beliebiges Werkzeug, beliebige Einstellungen).
3. Führen Sie sie für eine einzelne Datei aus, oder für einen ganzen Batch auf einmal.
4. Speichern Sie die Pipeline zur späteren Wiederverwendung.

Pipelines erlauben standardmäßig 20 Schritte. Setzen Sie `MAX_PIPELINE_STEPS=0`, um das Limit aufzuheben.

### Dateibibliothek {#file-library}

Jede Datei, die Sie verarbeiten, kann in Ihrer **Dateien**-Bibliothek gespeichert werden. SnapOtter protokolliert den vollständigen Versionsverlauf, sodass Sie jeden Verarbeitungsschritt vom ursprünglichen Upload bis zum endgültigen Ergebnis nachvollziehen können.

Das Speichern erfolgt ausdrücklich: Ergebnisse, die Sie in der Bibliothek speichern, bleiben erhalten, bis Sie sie löschen, während Ergebnisse, die Sie verarbeiten und nicht speichern, nach 72 Stunden automatisch gelöscht werden (konfigurierbar über `FILE_MAX_AGE_HOURS`).

### REST-API und API-Schlüssel {#rest-api-api-keys}

Jedes Werkzeug ist über HTTP erreichbar:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Erzeugen Sie API-Schlüssel unter **Einstellungen → API-Schlüssel**. Alle Endpunkte finden Sie in der [REST-API-Referenz](/de/api/rest), die interaktive Referenz unter [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

### Mehrere Benutzer und Teams {#multi-user-teams}

Aktivieren Sie mehrere Benutzer mit rollenbasierter Zugriffskontrolle:

- **Admin**: Vollzugriff, verwaltet Benutzer, Teams, Einstellungen sowie alle Dateien/Pipelines/API-Schlüssel
- **Benutzer**: nutzt Werkzeuge, verwaltet eigene Dateien/Pipelines/API-Schlüssel

Erstellen Sie Teams unter **Einstellungen → Teams**, um Benutzer zu gruppieren.

Setzen Sie `AUTH_ENABLED=true` (oder `false` für den Einzelbenutzer- bzw. Eigengebrauch ohne Anmeldung).

## Vom Smartphone aus nutzen {#use-it-from-your-phone}

SnapOtter funktioniert in mobilen Browsern, und Sie können es als App installieren. Öffnen Sie Ihre Instanz auf dem Smartphone und gehen Sie dann so vor:

- **iPhone / iPad (Safari):** Tippen Sie auf Teilen und dann auf **Zum Home-Bildschirm**.
- **Android (Chrome):** Öffnen Sie das Browsermenü und tippen Sie auf **App installieren**.

Die installierte App öffnet sich in einem eigenen Fenster, direkt auf Ihrer Instanz.

Ein Haken: Browser bieten die Installationsaufforderung nur über HTTPS an. Eine einfache HTTP-Adresse in Ihrem LAN funktioniert in einem Browser-Tab weiterhin einwandfrei; für die richtige Installation stellen Sie die Instanz hinter einen Reverse-Proxy mit Zertifikat (siehe die [Bereitstellungsanleitung](/de/guide/deployment)).

Auf Smartphones und Tablets zeigen Bildwerkzeuge neben der Upload-Schaltfläche eine Schaltfläche **Foto aufnehmen**. Fotografieren Sie einen Beleg oder ein Whiteboard, und es landet direkt im Werkzeug.