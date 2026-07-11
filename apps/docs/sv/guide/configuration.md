---
description: "Alla SnapOtter-miljövariabler med standardvärden. Konfigurera autentisering, lagring, AI-modeller, analys med mera."
i18n_source_hash: 8e9e9ca2840c
i18n_provenance: human
i18n_output_hash: 891cb14c17a5
---

# Konfiguration {#configuration}

All konfiguration görs via miljövariabler. Varje variabel har ett vettigt standardvärde, så SnapOtter fungerar direkt utan att någon av dem sätts.

## Miljövariabler {#environment-variables}

### Server {#server}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PORT` | `1349` | Port som servern lyssnar på. |
| `RATE_LIMIT_PER_MIN` | `1000` | Maximalt antal förfrågningar per minut per IP. Sätt till 0 för att inaktivera hastighetsbegränsning. |
| `CORS_ORIGIN` | (tom) | Kommaseparerade tillåtna ursprung för CORS, eller tom för endast samma ursprung. |
| `LOG_LEVEL` | `info` | Loggutförlighet. En av: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |
| `TRUST_PROXY` | `true` | Lita på `X-Forwarded-For`-huvuden från en omvänd proxy. Sätt till `false` om du inte är bakom en proxy. |

### Autentisering {#authentication}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `AUTH_ENABLED` | `false` | Sätt till `true` för att kräva inloggning. Docker-avbildningen har som standard `true`. |
| `DEFAULT_USERNAME` | `admin` | Användarnamn för det initiala admin-kontot. Används endast vid första körningen. |
| `DEFAULT_PASSWORD` | `admin` | Lösenord för det initiala admin-kontot. Ändra detta efter första inloggningen. |
| `MAX_USERS` | `0` (obegränsat) | Maximalt antal registrerade användarkonton. Sätt till 0 för obegränsat. |
| `SESSION_DURATION_HOURS` | `168` | Livslängd för inloggningssession i timmar (standard är 7 dagar). |
| `SKIP_MUST_CHANGE_PASSWORD` | - | Sätt till valfritt icke-tomt värde för att kringgå den tvingade uppmaningen om lösenordsbyte vid första inloggningen |

### Lagring {#storage}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `STORAGE_MODE` | `local` | `local` eller `s3`. S3/MinIO kräver en licens med funktionen s3_storage. |
| `DATABASE_URL` | `postgres://snapotter:snapotter@postgres:5432/snapotter` | PostgreSQL-anslutningssträng. |
| `REDIS_URL` | `redis://redis:6379` | Redis-anslutningssträng (används för BullMQ-jobbköer). |
| `WORKSPACE_PATH` | `./tmp/workspace` | Katalog för tillfälliga filer under bearbetning. Rensas automatiskt. |
| `FILES_STORAGE_PATH` | `./data/files` | Katalog för beständiga användarfiler (uppladdade bilder, sparade resultat). |

### Inbäddat läge {#embedded-mode}

Kör avbildningen utan `DATABASE_URL` och utan `REDIS_URL` så startar den sin egen PostgreSQL 17 och Redis inuti containern, bundna till loopback, med all data på `/data`-volymen. Detta återställer `docker run`-upplevelsen med ett enda kommando för snabbstart, homelab och uppgraderingar från 1.x. Det är en bekvämlighetsväg, inte en produktionsdistribution: för produktion, kör Compose-stacken med 3 containrar med separat PostgreSQL och Redis. Inbäddat läge kräver att containern körs som root och är inkompatibelt med körtider med godtyckligt UID (OpenShift, Kubernetes `runAsNonRoot`); använd Compose där.

| Variabel | Standard | Beskrivning |
|---|---|---|
| `EMBEDDED` | `auto` | Aktiveras automatiskt när både `DATABASE_URL` och `REDIS_URL` är osatta. Sätt till `0` för att inaktivera det (appen misslyckas då snabbt om ingen extern `DATABASE_URL`/`REDIS_URL` är satt, i stället för att tyst starta en databas i containern). |
| `REDIS_MAXMEMORY` | `512mb` | Minnestak för den inbäddade Redis (endast inbäddat läge). Sänk det på minnesbegränsade värdar som en Raspberry Pi. |

Uppgradering från 1.x: lägg din gamla `snapotter.db` på `/data/snapotter.db` i volymen så importerar inbäddat läge den till den inbäddade PostgreSQL vid första start. Importen körs en gång; senare starter hoppar över den.

Telemetrinotering: inbäddat läge ärver avbildningens analysstandard som all annan konfiguration. Den publicerade avbildningen levereras med analys på; bygg med `--build-arg SNAPOTTER_ANALYTICS=off`, eller använd admin-opt-out i appen, för att inaktivera det.

### Bearbetningsgränser {#processing-limits}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `MAX_UPLOAD_SIZE_MB` | `100` | Maximal filstorlek per uppladdning i megabyte. Sätt till 0 för obegränsat. |
| `MAX_BATCH_SIZE` | `100` | Maximalt antal filer i en enda batchförfrågan. Sätt till 0 för obegränsat. |
| `CONCURRENT_JOBS` | `0` (auto) | Antal batchjobb som körs parallellt. Sätt till 0 för att detektera automatiskt baserat på tillgängliga CPU-kärnor. |
| `MAX_MEGAPIXELS` | `0` (obegränsat) | Maximal bildupplösning tillåten i megapixlar. Sätt till 0 för obegränsat. |
| `MAX_WORKER_THREADS` | `0` (auto) | Maximalt antal worker-trådar för bildbehandling. Sätt till 0 för att detektera automatiskt baserat på tillgängliga CPU-kärnor. |
| `PROCESSING_TIMEOUT_S` | `0` (ingen gräns) | Maximal bearbetningstid per förfrågan i sekunder. Sätt till 0 för ingen timeout. |
| `MAX_PIPELINE_STEPS` | `20` | Maximalt antal steg i en pipeline. Sätt till 0 för ingen gräns. |
| `MAX_CANVAS_PIXELS` | `0` (ingen gräns) | Maximal arbetsytestorlek i pixlar för utdatabilder. Sätt till 0 för ingen gräns. |
| `MAX_SVG_SIZE_MB` | `0` (obegränsat) | Maximal SVG-filstorlek i megabyte. Sätt till 0 för obegränsat. |
| `MAX_SPLIT_GRID` | `100` | Maximal rutnätsdimension för verktyget för bilddelning. |
| `MAX_PDF_PAGES` | `0` (obegränsat) | Maximalt antal PDF-sidor för PDF-till-bild-konvertering. Sätt till 0 för obegränsat. |

### Rensning {#cleanup}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `FILE_MAX_AGE_HOURS` | `72` | Hur länge osparade bearbetningsresultat (råa uppladdningar och verktygsutdata) behålls innan automatisk radering. Filer du uttryckligen sparar till Files-biblioteket påverkas inte och består tills du raderar dem. |
| `CLEANUP_INTERVAL_MINUTES` | `60` | Hur ofta rensningsjobbet körs. |

### Utseende {#appearance}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `DEFAULT_THEME` | `light` | Standardtema för nya sessioner. `light` eller `dark`. |
| `DEFAULT_LOCALE` | `en` | Standardgränssnittsspråk. |
| `DEFAULT_TOOL_VIEW` | `sidebar` | Standardverktygslayout. `sidebar` eller `fullscreen`. |

### Docker-behörigheter {#docker-permissions}

| Variabel | Standard | Beskrivning |
|---|---|---|
| `PUID` | `999` | Kör containerprocessen som detta UID. Sätt till att matcha din värdanvändare för bind-monteringar (`id -u`). |
| `PGID` | `999` | Kör containerprocessen som detta GID. Sätt till att matcha din värdgrupp för bind-monteringar (`id -g`). |

## Docker-exempel {#docker-example}

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

## Volymer {#volumes}

Docker Compose-stacken använder fyra volymer:

- `/data` (app) - AI-modeller, Python-venv och användarfiler. Montera denna för att behålla uppladdade filer och installerade AI-paket över omstarter.
- `/tmp/workspace` (app) - Tillfällig lagring för filer som bearbetas. Denna kan vara flyktig, men att montera den undviker att fylla upp containerns skrivbara lager.
- `SnapOtter-pgdata` (postgres) - PostgreSQL-datakatalog. Denna innehåller alla relationsdata (användare, inställningar, pipelines, jobb, revisionslogg). Säkerhetskopiera via `pg_dump` eller volymögonblicksbild.
- `SnapOtter-redisdata` (redis) - Redis append-only-fil för beständiga jobbköer.
