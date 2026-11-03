---
description: "Installera SnapOtter med Docker med ett enda kommando. Omfattar installation med Docker Compose, bygge från källkod och en fullständig funktionsöversikt."
i18n_source_hash: aa8428189808
i18n_provenance: machine
i18n_output_hash: e3e4308e188a
i18n_hash_version: 2
---

# Kom igång {#getting-started}

::: tip Prova före installation
Utforska hela gränssnittet på [demo.snapotter.com](https://demo.snapotter.com), ingen registrering eller installation krävs.
:::

## Snabbstart {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Den här enda containern kör allt den behöver: utan `DATABASE_URL` startar den sin egen PostgreSQL och Redis på loopback-gränssnittet (inbäddat läge) och lagrar all data i volymen `SnapOtter-data`. Det är det snabbaste sättet att testa SnapOtter eller drifta det själv på ett hemmalabb. I produktion används den [kanoniska Docker Compose-stacken](#docker-compose), som håller PostgreSQL och Redis i egna containrar. Inbäddat läge körs som root (standard) och stängs av automatiskt så snart du anger `DATABASE_URL`.

Installerar du på en Raspberry Pi, en gammal bärbar dator eller en liten VPS? Se [Miljöer med små resurser](/sv/guide/low-resource) för en anpassad genomgång och vad du kan förvänta dig av begränsad hårdvara.

Du ombeds byta lösenord vid första inloggningen.

::: tip Anonym produktanalys
SnapOtter innehåller anonym produktanalys som standard. Du stänger av den genom att öppna **Settings → System → Privacy** och stänga av **Anonymous Product Analytics**. Den slutar omedelbart för hela instansen.

Du kan också ange miljövariabeln `SNAPOTTER_TELEMETRY=0` (`false` och `off` fungerar också) för att stänga av all telemetri för instansen utan ombyggnad.

Felövervakningen drivs av [Sentry](https://sentry.io), som sponsrar SnapOtter genom sitt program för öppen källkod.

Mer information om vad som samlas in finns i [Vad SnapOtter samlar in](/sv/guide/telemetry).
:::

::: tip NVIDIA CUDA-acceleration
Lägg till `--gpus all` för CUDA-accelererad bakgrundsborttagning, uppskalning, ansiktsförbättring och restaurering på NVIDIA. OCR förblir CPU-baserad och fungerar i samma avbild med eller utan GPU-åtkomst:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Kräver [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Faller automatiskt tillbaka till CPU när CUDA inte är tillgängligt. Acceleration med Intel/AMD iGPU via VA-API, Quick Sync eller OpenCL stöds inte för AI-inferens i dagsläget. Se [Docker-taggar](/sv/guide/docker-tags) för benchmarks. Om AI-verktygen körs på CPU trots `--gpus all`, se [Verifiera GPU-acceleration](/sv/guide/deployment#verify-gpu-acceleration).
:::

::: details Finns även på GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Båda registren publicerar samma avbild vid varje utgåva.
:::

## Docker Compose {#docker-compose}

Använd produktionsfilen som underhålls och testas för varje utgåva i stället för att kopiera ett förkortat Compose-exempel från den här sidan:

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

Den kanoniska [`docker/docker-compose.yml`](https://github.com/snapotter-hq/SnapOtter/blob/v2.3.0/docker/docker-compose.yml) omfattar alla fyra körtidsvolymer, hälsokontroller, resursgränser, beständig Redis-konfiguration, låsta databas- och cache-avbilder samt den aktuella containerhärdningen. Byt standardlösenordet för administratören direkt efter första inloggningen. För en reproducerbar driftsättning, lås SnapOtter-appavbilden till den utgåvetagg eller det digest du har verifierat i stället för att följa `latest`.

Se [Konfiguration](/sv/guide/configuration) för alla miljövariabler och [Säkerhet och härdning](/sv/guide/security) för hemligheter, nätverkspolicy och vägledning om säkerhetskopiering.

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
| **Bild** | 112 | Ändra storlek, Beskär, Komprimera, Konvertera, Ta bort bakgrund, Skala upp, OCR, Vattenstämpel, Collage, Färglägg, GIF-verktyg, formatförinställningar |
| **Video** | 57 | Klipp, Beskär, Komprimera, Konvertera, Slå ihop, Extrahera ljud, Automatiska undertexter, Video till GIF, Ändra storlek, Stabilisera, formatförinställningar |
| **Ljud** | 27 | Klipp, Slå ihop, Konvertera, Normalisera, Brusreducering, Transkribera, Tonhöjdsförskjutning, Tona, Ringsignalsskapare, formatförinställningar |
| **PDF / Dokument** | 35 | Slå ihop, Dela, Komprimera, OCR, Vattenstämpel, Maskera, Word till PDF, Excel till PDF, Rotera, Skydda, Reparera |
| **Filer** | 23 | CSV till JSON, JSON till XML, Slå ihop CSV, Dela CSV, Skapa ZIP, Extrahera ZIP, Diagramskapare, YAML/JSON |

### Pipelines {#pipelines}

Kedja ihop verktyg till arbetsflöden i flera steg och tillämpa dem på en bild eller en hel batch:

1. Öppna **Pipelines** i sidofältet.
2. Lägg till steg (valfritt verktyg, valfria inställningar).
3. Kör på en enskild fil eller på en hel batch på en gång.
4. Spara pipelinen för att återanvända den senare.

Pipelines tillåter 20 steg som standard. Ange `MAX_PIPELINE_STEPS=0` för att göra gränsen obegränsad.

### Filbibliotek {#file-library}

Varje fil du bearbetar kan sparas i ditt **Files**-bibliotek. SnapOtter håller reda på hela versionshistoriken så att du kan följa varje bearbetningssteg från den ursprungliga uppladdningen till det slutliga resultatet.

Sparandet är uttryckligt: resultat som du sparar i biblioteket behålls tills du raderar dem, medan resultat som du bearbetar och lämnar osparade rensas automatiskt efter 72 timmar (kan konfigureras via `FILE_MAX_AGE_HOURS`).

### REST API och API-nycklar {#rest-api-api-keys}

Varje verktyg är tillgängligt via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Skapa API-nycklar under **Settings → API Keys**. Se [REST API-referensen](/sv/api/rest) för alla slutpunkter, eller besök [http://localhost:1349/api/docs](http://localhost:1349/api/docs) för den interaktiva referensen.

### Flera användare och team {#multi-user-teams}

Aktivera flera användare med rollbaserad åtkomstkontroll:

- **Admin**: full åtkomst, hantera användare, team, inställningar och alla filer, pipelines och API-nycklar
- **User**: använda verktyg och hantera egna filer, pipelines och API-nycklar

Skapa team under **Settings → Teams** för att gruppera användare.

Ange `AUTH_ENABLED=true` (eller `false` för en enskild användare/eget bruk utan inloggning).

## Använd det från mobilen {#use-it-from-your-phone}

SnapOtter fungerar i mobila webbläsare och du kan installera det som en app. Öppna din instans på telefonen och gör sedan så här:

- **iPhone / iPad (Safari):** tryck på Dela och sedan **Lägg till på hemskärmen**.
- **Android (Chrome):** öppna webbläsarmenyn och tryck på **Installera app**.

Den installerade appen öppnas i ett eget fönster, direkt till din instans.

En hake: webbläsare erbjuder bara installationsfrågan över HTTPS. En vanlig HTTP-adress på ditt lokala nätverk fungerar fortfarande bra i en webbläsarflik. För en riktig installation, placera instansen bakom en omvänd proxy med certifikat (se [driftsättningsguiden](/sv/guide/deployment)).

På telefoner och surfplattor visar bildverktygen en knapp **Ta foto** bredvid uppladdningsknappen. Fotografera ett kvitto eller en whiteboard så hamnar bilden direkt i verktyget.
