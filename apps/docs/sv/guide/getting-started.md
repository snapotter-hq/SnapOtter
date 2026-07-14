---
description: "Installera SnapOtter med Docker i ett enda kommando. Inkluderar Docker Compose-konfiguration, byggande från källkod och en fullständig funktionsöversikt."
i18n_output_hash: 4b247783a830
i18n_source_hash: 24724b5595b2
i18n_provenance: human
---

# Kom igång {#getting-started}

::: tip Prova innan du installerar
Utforska hela gränssnittet på [demo.snapotter.com](https://demo.snapotter.com) - ingen registrering eller installation krävs.
:::

## Snabbstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Denna enda container kör allt den behöver: utan `DATABASE_URL` angivet startar den sin egen PostgreSQL och Redis på loopback-gränssnittet (inbäddat läge) och håller all data i `SnapOtter-data`-volymen. Det är det snabbaste sättet att prova SnapOtter eller att själv hosta i ett hemmalabb. För produktion, kör [Docker Compose](#docker-compose)-stacken nedan, som håller PostgreSQL och Redis i sina egna containrar. Inbäddat läge körs som root (standardvärdet) och stängs av automatiskt så snart du anger `DATABASE_URL`.

Du kommer att ombes att ändra ditt lösenord vid första inloggningen.

::: tip Anonym produktanalys
SnapOtter innehåller anonym produktanalys som standard. För att stänga av den, öppna **Settings → System → Privacy** och stäng av **Anonymous Product Analytics**. Den stoppas omedelbart för hela instansen.

Du kan också ange miljövariabeln `SNAPOTTER_TELEMETRY=0` (`false` och `off` fungerar också) för att inaktivera all telemetri för instansen utan en ombyggnad.

Felövervakning drivs av [Sentry](https://sentry.io), som sponsrar SnapOtter genom sitt program för öppen källkod.

För detaljer om vad som samlas in, se [Vad SnapOtter samlar in](/sv/guide/telemetry).
:::

::: tip NVIDIA CUDA-acceleration
Lägg till `--gpus all` för NVIDIA CUDA-accelererad bakgrundsborttagning, uppskalning, ansiktsförbättring och restaurering. OCR förblir CPU-baserad och fungerar i samma bild med eller utan GPU-åtkomst:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Kräver [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Faller tillbaka till CPU automatiskt när CUDA inte är tillgängligt. Intel/AMD iGPU-acceleration via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dagsläget. Se [Docker-taggar](/sv/guide/docker-tags) för benchmarktester.
:::

::: details Även på GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Båda registren publicerar samma avbildning vid varje utgåva.
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

Se [Konfiguration](/sv/guide/configuration) för alla miljövariabler.

## Bygg från källkod {#build-from-source}

**Förutsättningar:** Node.js 22+, pnpm 9+, Docker (för Postgres + Redis), Python 3.10+ (för AI-funktioner), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## Vad du kan göra {#what-you-can-do}

### Filbearbetning (200+ verktyg) {#file-processing-200-tools}

| Modalitet | Antal | Exempelverktyg |
|----------|-------|---------------|
| **Bild** | 105 | Ändra storlek, beskär, komprimera, konvertera, ta bort bakgrund, uppskala, OCR, vattenmärke, collage, färglägg, GIF-verktyg, formatförinställningar |
| **Video** | 57 | Klipp, beskär, komprimera, konvertera, slå samman, extrahera ljud, autotextning, video till GIF, ändra storlek, stabilisera, formatförinställningar |
| **Ljud** | 27 | Klipp, slå samman, konvertera, normalisera, brusreducering, transkribera, tonhöjdsskift, tona, ringsignalsskapare, formatförinställningar |
| **PDF / dokument** | 42 | Slå samman, dela, komprimera, OCR, vattenmärke, redigera bort, Word till PDF, Excel till PDF, rotera, skydda, reparera |
| **Filer** | 10 | CSV till JSON, JSON till XML, slå samman CSV-filer, dela CSV, skapa ZIP, extrahera ZIP, diagramskapare, YAML/JSON |

### Pipelines {#pipelines}

Kedja ihop verktyg till arbetsflöden i flera steg och applicera dem på en bild eller en hel batch:

1. Öppna **Pipelines** i sidofältet.
2. Lägg till steg (valfritt verktyg, valfria inställningar).
3. Kör på en enda fil - eller en hel batch på en gång.
4. Spara pipelinen för senare återanvändning.

Pipelines tillåter 20 steg som standard. Ange `MAX_PIPELINE_STEPS=0` för att göra gränsen obegränsad.

### Filbibliotek {#file-library}

Varje fil du bearbetar kan sparas i ditt **Files**-bibliotek. SnapOtter spårar den fullständiga versionshistoriken så att du kan spåra varje bearbetningssteg från den ursprungliga uppladdningen till det slutliga resultatet.

Sparande är explicit: resultat som du sparar i biblioteket behålls tills du raderar dem, medan resultat som du bearbetar och lämnar osparade rensas automatiskt efter 72 timmar (konfigurerbart via `FILE_MAX_AGE_HOURS`).

### REST API och API-nycklar {#rest-api-api-keys}

Varje verktyg är tillgängligt via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generera API-nycklar under **Settings → API Keys**. Se [REST API-referensen](/sv/api/rest) för alla slutpunkter, eller besök [http://localhost:1349/api/docs](http://localhost:1349/api/docs) för den interaktiva referensen.

### Fleranvändare och team {#multi-user-teams}

Aktivera flera användare med rollbaserad åtkomstkontroll:

- **Admin**: fullständig åtkomst - hantera användare, team, inställningar, alla filer/pipelines/API-nycklar
- **User**: använd verktyg, hantera egna filer/pipelines/API-nycklar

Skapa team under **Settings → Teams** för att gruppera användare.

Ange `AUTH_ENABLED=true` (eller `false` för enanvändare/eget bruk utan inloggning).
