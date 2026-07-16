---
description: "SnapOtter mit Docker in einem einzigen Befehl installieren. Enthält Docker-Compose-Einrichtung, Bauen aus dem Quellcode und eine vollständige Funktionsübersicht."
i18n_output_hash: 14356fc91e39
i18n_source_hash: 68bf7f60b68d
i18n_provenance: human
---

# Erste Schritte {#getting-started}

::: tip Vor dem Installieren ausprobieren
Erkunde die vollständige Oberfläche unter [demo.snapotter.com](https://demo.snapotter.com) - keine Anmeldung oder Installation erforderlich.
:::

## Schnellstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Dieser einzelne Container führt alles aus, was er benötigt: Ohne gesetztes `DATABASE_URL` startet er sein eigenes PostgreSQL und Redis auf der Loopback-Schnittstelle (Embedded-Modus) und hält alle Daten im `SnapOtter-data`-Volume. Es ist der schnellste Weg, SnapOtter auszuprobieren oder in einem Homelab selbst zu hosten. Für die Produktion führe den [Docker-Compose](#docker-compose)-Stack unten aus, der PostgreSQL und Redis in ihren eigenen Containern hält. Der Embedded-Modus läuft als root (der Standard) und schaltet sich automatisch aus, sobald du `DATABASE_URL` setzt.

Du installierst auf einem Raspberry Pi, einem alten Laptop oder einem kleinen VPS? Siehe [Ressourcenarme Setups](/de/guide/low-resource) für eine abgestimmte Schritt-für-Schritt-Anleitung und was dich auf eingeschränkter Hardware erwartet.

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

Erfordert das [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Fällt automatisch auf die CPU zurück, wenn CUDA nicht verfügbar ist. Intel/AMD-iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird für KI-Inferenz derzeit nicht unterstützt. Siehe [Docker-Tags](/de/guide/docker-tags) für Benchmarks.
:::

::: details Auch auf GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide Registries veröffentlichen bei jedem Release dasselbe Image.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Siehe [Konfiguration](/de/guide/configuration) für alle Umgebungsvariablen.

## Aus dem Quellcode bauen {#build-from-source}

**Voraussetzungen:** Node.js 22+, pnpm 9+, Docker (für Postgres + Redis), Python 3.10+ (für KI-Funktionen), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Was du tun kannst {#what-you-can-do}

### Dateiverarbeitung (200+ Tools) {#file-processing-200-tools}

| Modalität | Anzahl | Beispiel-Tools |
|----------|-------|---------------|
| **Bild** | 105 | Größe ändern, zuschneiden, komprimieren, konvertieren, Hintergrund entfernen, hochskalieren, OCR, Wasserzeichen, Collage, kolorieren, GIF-Tools, Format-Vorlagen |
| **Video** | 57 | Trimmen, zuschneiden, komprimieren, konvertieren, zusammenführen, Audio extrahieren, Auto-Untertitel, Video zu GIF, Größe ändern, stabilisieren, Format-Vorlagen |
| **Audio** | 27 | Trimmen, zusammenführen, konvertieren, normalisieren, Rauschunterdrückung, transkribieren, Tonhöhenverschiebung, Ein-/Ausblenden, Klingelton-Ersteller, Format-Vorlagen |
| **PDF / Dokument** | 42 | Zusammenführen, teilen, komprimieren, OCR, Wasserzeichen, schwärzen, Word zu PDF, Excel zu PDF, drehen, schützen, reparieren |
| **Dateien** | 10 | CSV zu JSON, JSON zu XML, CSVs zusammenführen, CSV teilen, ZIP erstellen, ZIP entpacken, Diagramm-Ersteller, YAML/JSON |

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
