---
description: "SnapOtter mit Docker in einem einzigen Befehl installieren. Enthält Docker-Compose-Einrichtung, Bauen aus dem Quellcode und eine vollständige Funktionsübersicht."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: c7c22489510f
i18n_hash_version: 2
---

# Erste Schritte {#getting-started}

::: tip Vor dem Installieren ausprobieren
Erkunde die vollständige Oberfläche unter [demo.snapotter.com](https://demo.snapotter.com) - keine Anmeldung oder Installation erforderlich.
:::

## Schnellstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Dieser einzelne Container führt alles aus, was er benötigt: Wenn kein `DATABASE_URL` festgelegt ist, startet er sein eigenes PostgreSQL und Redis auf der Loopback-Schnittstelle (eingebetteter Modus) und behält alle Daten im `SnapOtter-data`-Volume. Dies ist der schnellste Weg, SnapOtter auszuprobieren oder sich selbst auf einem Homelab zu hosten. Verwenden Sie für die Produktion den [kanonischen Docker Compose-Stack](#docker-compose), der PostgreSQL und Redis in ihren eigenen Containern hält. Der eingebettete Modus wird als Root ausgeführt (Standardeinstellung) und automatisch deaktiviert, sobald Sie `DATABASE_URL` festlegen.

Du installierst auf einem Raspberry Pi, einem alten Laptop oder einem kleinen VPS? Siehe [Ressourcenarme Setups](/de/guide/low-resource) für eine abgestimmte Schritt-für-Schritt-Anleitung und einen Überblick darüber, was dich auf eingeschränkter Hardware erwartet.

Du wirst beim ersten Login aufgefordert, dein Passwort zu ändern.

::: tip Anonyme Produkt-Analytics
SnapOtter enthält standardmäßig anonyme Produkt-Analytics. Um sie auszuschalten, öffne **Einstellungen → System → Datenschutz** und schalte **Anonyme Produkt-Analytics** aus. Es stoppt sofort für die gesamte Instanz.

Du kannst auch die Umgebungsvariable `SNAPOTTER_TELEMETRY=0` setzen (`false` und `off` funktionieren ebenfalls), um alle Telemetrie für die Instanz ohne Neuaufbau zu deaktivieren.

Die Fehlerüberwachung wird von [Sentry](https://sentry.io) bereitgestellt, das SnapOtter über sein Open-Source-Programm unterstützt.

Für Details darüber, was erfasst wird, siehe [Was SnapOtter erfasst](/de/guide/telemetry).
:::

::: tip NVIDIA-CUDA-Beschleunigung
Fügen Sie `--gpus all` für NVIDIA CUDA-beschleunigte Hintergrundentfernung, Hochskalierung, Gesichtsverbesserung und Wiederherstellung hinzu. OCR bleibt CPU-basiert und funktioniert im selben Image mit oder ohne GPU-Zugriff:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Erfordert das [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Fällt automatisch auf die CPU zurück, wenn CUDA nicht verfügbar ist. Die Intel/AMD iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird derzeit für KI-Inferenz nicht unterstützt. Benchmarks finden Sie unter [Docker-Tags](/de/guide/docker-tags). Wenn KI-Tools trotz `--gpus all` auf der CPU laufen, siehe [GPU-Beschleunigung überprüfen](/de/guide/deployment#verify-gpu-acceleration).
:::

::: details Auch auf GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide Registries veröffentlichen bei jedem Release dasselbe Image.
:::

## Docker Compose {#docker-compose}

Verwenden Sie die Produktionsdatei, die mit jeder Version gepflegt und getestet wird, anstatt ein verkürztes Compose-Beispiel von dieser Seite zu kopieren:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.2.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Das kanonische [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.2.0/docker/docker-compose.yml) umfasst alle vier Laufzeit-Volumes, Gesundheitsprüfungen, Ressourcenlimits, dauerhafte Redis-Konfiguration, angeheftete Datenbank-/Cache-Images und die aktuelle Containerhärtung. Ändern Sie das Standard-Administratorkennwort sofort nach der ersten Anmeldung. Für eine reproduzierbare Bereitstellung heften Sie das SnapOtter-Anwendungsimage an das von Ihnen überprüfte Release-Tag oder Digest, anstatt `latest` zu folgen.

Siehe [Konfiguration](/de/guide/configuration) für alle Umgebungsvariablen und [Sicherheit und Härtung](/de/guide/security) für Geheimnisse, Netzwerkrichtlinien und Backup-Anleitungen.

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

## Was du tun kannst {#what-you-can-do}

### Dateiverarbeitung (200+ Tools) {#file-processing-200-tools}

| Modalität | Anzahl | Beispiel-Tools |
|----------|-------|---------------|
| **Bild** | 107 | Größe ändern, zuschneiden, komprimieren, konvertieren, Hintergrund entfernen, hochskalieren, OCR, Wasserzeichen, Collage, kolorieren, GIF-Tools, Format-Vorlagen |
| **Video** | 57 | Trimmen, zuschneiden, komprimieren, konvertieren, zusammenführen, Audio extrahieren, Auto-Untertitel, Video zu GIF, Größe ändern, stabilisieren, Format-Vorlagen |
| **Audio** | 27 | Trimmen, zusammenführen, konvertieren, normalisieren, Rauschunterdrückung, transkribieren, Tonhöhenverschiebung, Ein-/Ausblenden, Klingelton-Ersteller, Format-Vorlagen |
| **PDF / Dokument** | 29 | Zusammenführen, teilen, komprimieren, OCR, Wasserzeichen, schwärzen, Word zu PDF, Excel zu PDF, drehen, schützen, reparieren |
| **Dateien** | 23 | CSV zu JSON, JSON zu XML, CSVs zusammenführen, CSV teilen, ZIP erstellen, ZIP entpacken, Diagramm-Ersteller, YAML/JSON |

### Pipelines {#pipelines}

Verkette Tools zu mehrstufigen Workflows und wende sie auf ein Bild oder einen ganzen Stapel an:

1. Öffne **Pipelines** in der Seitenleiste.
2. Füge Schritte hinzu (beliebiges Tool, beliebige Einstellungen).
3. Führe sie auf einer einzelnen Datei aus - oder auf einem ganzen Stapel auf einmal.
4. Speichere die Pipeline zur späteren Wiederverwendung.

Pipelines erlauben standardmäßig 20 Schritte. Setze `MAX_PIPELINE_STEPS=0`, um das Limit unbegrenzt zu machen.

### Datei-Bibliothek {#file-library}

Jede von dir verarbeitete Datei kann in deiner **Dateien**-Bibliothek gespeichert werden. SnapOtter verfolgt die vollständige Versionshistorie, sodass du jeden Verarbeitungsschritt vom ursprünglichen Upload bis zur finalen Ausgabe nachvollziehen kannst.

Das Speichern ist explizit: Ergebnisse, die du in der Bibliothek speicherst, bleiben erhalten, bis du sie löschst, während Ergebnisse, die du verarbeitest und ungespeichert lässt, nach 72 Stunden automatisch entfernt werden (konfigurierbar über `FILE_MAX_AGE_HOURS`).

### REST-API & API-Schlüssel {#rest-api-api-keys}

Jedes Tool ist über HTTP zugänglich:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generiere API-Schlüssel unter **Einstellungen → API-Schlüssel**. Siehe die [REST-API-Referenz](/de/api/rest) für alle Endpunkte oder besuche [http://localhost:1349/api/docs](http://localhost:1349/api/docs) für die interaktive Referenz.

### Mehrbenutzer & Teams {#multi-user-teams}

Aktiviere mehrere Benutzer mit rollenbasierter Zugriffskontrolle:

- **Admin**: voller Zugriff - Benutzer, Teams, Einstellungen, alle Dateien/Pipelines/API-Schlüssel verwalten
- **Benutzer**: Tools nutzen, eigene Dateien/Pipelines/API-Schlüssel verwalten

Erstelle Teams unter **Einstellungen → Teams**, um Benutzer zu gruppieren.

Setze `AUTH_ENABLED=true` (oder `false` für Einzelbenutzer/Eigennutzung ohne Login).
