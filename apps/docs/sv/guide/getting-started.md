---
description: "Installera SnapOtter med Docker i ett enda kommando. Inkluderar Docker Compose-konfiguration, byggande från källkod och en fullständig funktionsöversikt."
i18n_source_hash: 8040133a6982
i18n_provenance: machine
i18n_output_hash: 2dc08df1543e
i18n_hash_version: 2
---

# Kom igång {#getting-started}

::: tip Prova innan du installerar
Utforska hela gränssnittet på [demo.snapotter.com](https://demo.snapotter.com) - ingen registrering eller installation krävs.
:::

## Snabbstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Denna enda behållare kör allt den behöver: utan `DATABASE_URL`-uppsättning startar den sin egen PostgreSQL och Redis på loopback-gränssnittet (inbäddat läge) och behåller all data i `SnapOtter-data`-volymen. Det är det snabbaste sättet att prova SnapOtter eller självvärd på ett homelab. För produktion, använd [kanoniska Docker Compose-stacken](#docker-compose), som håller PostgreSQL och Redis i sina egna behållare. Inbäddat läge körs som root (standard) och stängs av automatiskt så snart du ställer in `DATABASE_URL`.

Installerar du på en Raspberry Pi, en gammal bärbar dator eller en liten VPS? Se [Resurssnåla installationer](/sv/guide/low-resource) för en anpassad genomgång och vad du kan förvänta dig av begränsad hårdvara.

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

Kräver [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Faller tillbaka till CPU automatiskt när CUDA inte är tillgänglig. Intel/AMD iGPU-acceleration genom VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens idag. Se [Docker Tags](/sv/guide/docker-tags) för riktmärken. Om AI-verktyg körs på CPU trots `--gpus all`, se [Verifiera GPU-acceleration](/sv/guide/deployment#verify-gpu-acceleration).
:::

::: details Även på GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Båda registren publicerar samma avbildning vid varje utgåva.
:::

## Docker Compose {#docker-compose}

Använd produktionsfilen som underhålls och testas med varje release istället för att kopiera ett förkortat Compose-exempel från den här sidan:

```bash
install -d -m 700 snapotter && cd snapotter
curl --proto '=https' --tlsv1.2 -fsSLo docker-compose.yml \
  https://raw.githubusercontent.com/snapotter-hq/SnapOtter/v2.1.0/docker/docker-compose.yml

# Keep generated service credentials out of shell history and world-readable files.
umask 077
POSTGRES_PASSWORD="$(openssl rand -hex 32)"
REDIS_PASSWORD="$(openssl rand -hex 32)"
printf 'POSTGRES_PASSWORD=%s\nREDIS_PASSWORD=%s\n' \
  "$POSTGRES_PASSWORD" "$REDIS_PASSWORD" > .env

docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d --no-build
```

Den kanoniska [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.1.0/docker/docker-compose.yml) inkluderar alla fyra körtidsvolymer, hälsokontroller, resursgränser, hållbar Redis-konfiguration, fästa databas/cache-bilder och den aktuella behållarhärdningen. Ändra standardlösenordet för administratören direkt efter första inloggningen. För en reproducerbar distribution, fäst SnapOtter-applikationsbilden till releasetaggen eller sammanfattningen du verifierade istället för att följa `latest`.

Se [Configuration](/sv/guide/configuration) för alla miljövariabler och [Security & Hardening](/sv/guide/security) för hemligheter, nätverkspolicy och säkerhetskopieringsvägledning.

## Bygg från källkod {#build-from-source}

**Förutsättningar:** Node.js 22.22+, pnpm 9+, Docker (för Postgres + Redis), Python 3.11+ (för AI-funktioner), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1351](http://localhost:1351)
- Backend: [http://localhost:13490](http://localhost:13490)

## Vad du kan göra {#what-you-can-do}

### Filbearbetning (200+ verktyg) {#file-processing-200-tools}

| Modalitet | Antal | Exempelverktyg |
|----------|-------|---------------|
| **Bild** | 107 | Ändra storlek, beskär, komprimera, konvertera, ta bort bakgrund, uppskala, OCR, vattenmärke, collage, färglägg, GIF-verktyg, formatförinställningar |
| **Video** | 57 | Klipp, beskär, komprimera, konvertera, slå samman, extrahera ljud, autotextning, video till GIF, ändra storlek, stabilisera, formatförinställningar |
| **Ljud** | 27 | Klipp, slå samman, konvertera, normalisera, brusreducering, transkribera, tonhöjdsskift, tona, ringsignalsskapare, formatförinställningar |
| **PDF / dokument** | 29 | Slå samman, dela, komprimera, OCR, vattenmärke, redigera bort, Word till PDF, Excel till PDF, rotera, skydda, reparera |
| **Filer** | 23 | CSV till JSON, JSON till XML, slå samman CSV-filer, dela CSV, skapa ZIP, extrahera ZIP, diagramskapare, YAML/JSON |

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
