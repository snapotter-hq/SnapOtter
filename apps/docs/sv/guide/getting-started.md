---
description: "Installera SnapOtter med Docker i ett enda kommando. Inkluderar konfiguration av Docker Compose, bygge från källkod och en fullständig funktionsöversikt."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 53bb73800b80
---

# Kom igång {#getting-started}

::: tip Prova innan du installerar
Utforska hela gränssnittet på [demo.snapotter.com](https://demo.snapotter.com) - ingen registrering eller installation krävs.
:::

## Snabbstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Denna enda container kör allt den behöver: utan att `DATABASE_URL` är satt startar den sin egen PostgreSQL och Redis på loopback-gränssnittet (inbäddat läge) och håller all data i volymen `SnapOtter-data`. Det är det snabbaste sättet att prova SnapOtter eller köra självhostat i ett homelab. För produktion kör du [Docker Compose](#docker-compose)-stacken nedan, som håller PostgreSQL och Redis i sina egna containrar. Inbäddat läge körs som root (standard) och stängs av automatiskt så snart du sätter `DATABASE_URL`.

Du kommer att bli ombedd att byta lösenord vid första inloggningen.

::: tip Anonym produktanalys
SnapOtter inkluderar anonym produktanalys som standard. För att stänga av den öppnar du **Inställningar → System → Integritet** och slår av **Anonym produktanalys**. Den stoppar omedelbart för hela instansen.

För detaljer om vad som samlas in, se [Vad SnapOtter samlar in](/sv/guide/telemetry).
:::

::: tip NVIDIA CUDA-acceleration
Lägg till `--gpus all` för NVIDIA CUDA-accelererad bakgrundsborttagning, uppskalning, OCR, ansiktsförbättring och restaurering:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Kräver [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Faller automatiskt tillbaka till CPU när CUDA inte är tillgängligt. Acceleration med Intel/AMD iGPU via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dag. Se [Docker-taggar](/sv/guide/docker-tags) för benchmarks.
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

### Filbearbetning (241 verktyg) {#file-processing-241-tools}

| Modalitet | Antal | Exempel på verktyg |
|----------|-------|---------------|
| **Bild** | 105 | Ändra storlek, Beskär, Komprimera, Konvertera, Ta bort bakgrund, Uppskala, OCR, Vattenstämpel, Collage, Färglägg, GIF-verktyg, formatförval |
| **Video** | 57 | Klipp, Beskär, Komprimera, Konvertera, Slå samman, Extrahera ljud, Automatiska undertexter, Video till GIF, Ändra storlek, Stabilisera, formatförval |
| **Ljud** | 27 | Klipp, Slå samman, Konvertera, Normalisera, Brusreducering, Transkribera, Tonhöjdsändring, Toning, Ringsignalskapare, formatförval |
| **PDF / Dokument** | 42 | Slå samman, Dela, Komprimera, OCR, Vattenstämpel, Redigera bort, Word till PDF, Excel till PDF, Rotera, Skydda, Reparera |
| **Filer** | 10 | CSV till JSON, JSON till XML, Slå samman CSV-filer, Dela CSV, Skapa ZIP, Extrahera ZIP, Diagramskapare, YAML/JSON |

### Pipelines {#pipelines}

Kedja samman verktyg till flerstegsarbetsflöden och tillämpa dem på en bild eller en hel batch:

1. Öppna **Pipelines** i sidofältet.
2. Lägg till steg (valfritt verktyg, valfria inställningar).
3. Kör på en enskild fil - eller en hel batch på en gång.
4. Spara pipelinen för senare återanvändning.

Pipelines tillåter 20 steg som standard. Sätt `MAX_PIPELINE_STEPS=0` för att göra gränsen obegränsad.

### Filbibliotek {#file-library}

Varje fil du bearbetar kan sparas till ditt **Filer**-bibliotek. SnapOtter spårar hela versionshistoriken så att du kan följa varje bearbetningssteg från den ursprungliga uppladdningen till den slutliga utdatan.

Sparande är uttryckligt: resultat du sparar till biblioteket behålls tills du raderar dem, medan resultat du bearbetar och lämnar osparade rensas automatiskt efter 72 timmar (konfigurerbart via `FILE_MAX_AGE_HOURS`).

### REST API och API-nycklar {#rest-api-api-keys}

Varje verktyg är åtkomligt via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Generera API-nycklar under **Inställningar → API-nycklar**. Se [REST API-referensen](/sv/api/rest) för alla slutpunkter, eller besök [http://localhost:1349/api/docs](http://localhost:1349/api/docs) för den interaktiva referensen.

### Fleranvändare och team {#multi-user-teams}

Aktivera flera användare med rollbaserad åtkomstkontroll:

- **Admin**: full åtkomst - hantera användare, team, inställningar, alla filer/pipelines/API-nycklar
- **Användare**: använd verktyg, hantera egna filer/pipelines/API-nycklar

Skapa team under **Inställningar → Team** för att gruppera användare.

Sätt `AUTH_ENABLED=true` (eller `false` för enanvändare/eget bruk utan inloggning).
