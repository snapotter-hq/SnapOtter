---
description: "Installieren Sie SnapOtter mit Docker in einem einzigen Befehl. Enthält Docker-Compose-Einrichtung, Bauen aus dem Quellcode und einen vollständigen Funktionsüberblick."
i18n_source_hash: d2366a2e051c
i18n_provenance: machine
i18n_output_hash: c4100bd7782b
---

# Erste Schritte {#getting-started}

::: tip Vor der Installation ausprobieren
Erkunden Sie die vollständige Benutzeroberfläche unter [demo.snapotter.com](https://demo.snapotter.com) - keine Registrierung oder Installation erforderlich.
:::

## Schnellstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Dieser einzelne Container führt alles Nötige aus: Ohne gesetztes `DATABASE_URL` startet er sein eigenes PostgreSQL und Redis auf der Loopback-Schnittstelle (eingebetteter Modus) und hält alle Daten im Volume `SnapOtter-data`. Es ist der schnellste Weg, SnapOtter auszuprobieren oder in einem Homelab selbst zu hosten. Für den Produktivbetrieb führen Sie den unten stehenden [Docker Compose](#docker-compose)-Stack aus, der PostgreSQL und Redis in ihren eigenen Containern belässt. Der eingebettete Modus läuft als root (die Voreinstellung) und schaltet sich automatisch ab, sobald Sie `DATABASE_URL` setzen.

Sie werden bei der ersten Anmeldung aufgefordert, Ihr Passwort zu ändern.

::: tip Anonyme Produktanalyse
SnapOtter enthält standardmäßig eine anonyme Produktanalyse. Um sie abzuschalten, öffnen Sie **Einstellungen → System → Datenschutz** und schalten **Anonyme Produktanalyse** aus. Sie stoppt sofort für die gesamte Instanz.

Einzelheiten zu den erfassten Daten finden Sie unter [Was SnapOtter erfasst](/de/guide/telemetry).
:::

::: tip NVIDIA-CUDA-Beschleunigung
Fügen Sie `--gpus all` hinzu für NVIDIA-CUDA-beschleunigte Hintergrundentfernung, Hochskalierung, OCR, Gesichtsverbesserung und Restaurierung:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Erfordert das [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Fällt automatisch auf die CPU zurück, wenn CUDA nicht verfügbar ist. Intel/AMD-iGPU-Beschleunigung über VA-API, Quick Sync oder OpenCL wird für die KI-Inferenz derzeit nicht unterstützt. Siehe [Docker-Tags](/de/guide/docker-tags) für Benchmarks.
:::

::: details Auch auf GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Beide Registries veröffentlichen bei jeder Version dasselbe Image.
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

## Was Sie tun können {#what-you-can-do}

### Dateiverarbeitung (241 Werkzeuge) {#file-processing-241-tools}

| Modalität | Anzahl | Beispielwerkzeuge |
|----------|-------|---------------|
| **Bild** | 105 | Größe ändern, Zuschneiden, Komprimieren, Konvertieren, Hintergrund entfernen, Hochskalieren, OCR, Wasserzeichen, Collage, Kolorieren, GIF-Werkzeuge, Formatvorlagen |
| **Video** | 57 | Trimmen, Zuschneiden, Komprimieren, Konvertieren, Zusammenführen, Audio extrahieren, Automatische Untertitel, Video zu GIF, Größe ändern, Stabilisieren, Formatvorlagen |
| **Audio** | 27 | Trimmen, Zusammenführen, Konvertieren, Normalisieren, Rauschunterdrückung, Transkribieren, Tonhöhe verschieben, Ein-/Ausblenden, Klingelton-Ersteller, Formatvorlagen |
| **PDF / Dokument** | 42 | Zusammenführen, Aufteilen, Komprimieren, OCR, Wasserzeichen, Schwärzen, Word zu PDF, Excel zu PDF, Drehen, Schützen, Reparieren |
| **Dateien** | 10 | CSV zu JSON, JSON zu XML, CSVs zusammenführen, CSV aufteilen, ZIP erstellen, ZIP extrahieren, Diagrammersteller, YAML/JSON |

### Pipelines {#pipelines}

Verketten Sie Werkzeuge zu mehrstufigen Arbeitsabläufen und wenden Sie sie auf ein Bild oder einen ganzen Stapel an:

1. Öffnen Sie **Pipelines** in der Seitenleiste.
2. Fügen Sie Schritte hinzu (beliebiges Werkzeug, beliebige Einstellungen).
3. Führen Sie sie auf einer einzelnen Datei aus - oder auf einem ganzen Stapel auf einmal.
4. Speichern Sie die Pipeline zur späteren Wiederverwendung.

Pipelines erlauben standardmäßig 20 Schritte. Setzen Sie `MAX_PIPELINE_STEPS=0`, um das Limit unbegrenzt zu machen.

### Dateibibliothek {#file-library}

Jede von Ihnen verarbeitete Datei kann in Ihrer **Dateien**-Bibliothek gespeichert werden. SnapOtter verfolgt den vollständigen Versionsverlauf, sodass Sie jeden Verarbeitungsschritt vom ursprünglichen Upload bis zur endgültigen Ausgabe nachvollziehen können.

Das Speichern ist explizit: In der Bibliothek gespeicherte Ergebnisse bleiben erhalten, bis Sie sie löschen, während Ergebnisse, die Sie verarbeiten und ungespeichert lassen, nach 72 Stunden automatisch entfernt werden (konfigurierbar über `FILE_MAX_AGE_HOURS`).

### REST-API & API-Schlüssel {#rest-api-api-keys}

Jedes Werkzeug ist über HTTP zugänglich:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generieren Sie API-Schlüssel unter **Einstellungen → API-Schlüssel**. Siehe die [REST-API-Referenz](/de/api/rest) für alle Endpunkte oder besuchen Sie [http://localhost:1349/api/docs](http://localhost:1349/api/docs) für die interaktive Referenz.

### Mehrbenutzer & Teams {#multi-user-teams}

Aktivieren Sie mehrere Benutzer mit rollenbasierter Zugriffssteuerung:

- **Admin**: voller Zugriff - Benutzer, Teams und Einstellungen verwalten, alle Dateien/Pipelines/API-Schlüssel
- **Benutzer**: Werkzeuge nutzen, eigene Dateien/Pipelines/API-Schlüssel verwalten

Erstellen Sie Teams unter **Einstellungen → Teams**, um Benutzer zu gruppieren.

Setzen Sie `AUTH_ENABLED=true` (oder `false` für den Einzelbenutzer-/Eigengebrauch ohne Anmeldung).
