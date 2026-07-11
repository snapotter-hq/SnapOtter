---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 20c023477630
---
# Uppgradera från 1.x till 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x lagrade allt i en enda SQLite-fil och kördes som en container. SnapOtter 2.0 använder PostgreSQL och Redis. Den här guiden går igenom hur du flyttar en 1.x-installation till 2.0 utan att förlora data.

Den korta versionen: återanvänd din befintliga `/data`-volym, så importerar 2.0 din 1.x-databas automatiskt vid första uppstart. Dina användare, sparade filer, inställningar, API-nycklar och pipelines följer med. Den gamla databasen ändras aldrig, så du kan alltid rulla tillbaka.

::: tip En anmärkning till våra 1.x-användare
Många av er har litat på SnapOtter sedan dag ett, och er återkoppling har format den här releasen. 2.0 ändrar mycket under huven, och den här guiden finns till för att flytten inte ska kosta er något ni bryr er om. Era konton, filer, inställningar, API-nycklar och pipelines följer med, och er gamla databas rörs aldrig. Tack för att ni uppgraderar med oss.
:::

## Innan du börjar: säkerhetskopiera hela `/data`-volymen {#before-you-start-back-up-the-whole-data-volume}

Gör detta först, varje gång. Säkerhetskopiera **hela** `/data`-volymen, inte bara `snapotter.db`-filen.

Här är varför det spelar roll. 1.x kör SQLite i WAL-läge, så en stoppad 1.x-container lämnar rutinmässigt det mesta av sin committade data i `snapotter.db-wal` bredvid en nästan tom `snapotter.db`. Att bara kopiera `snapotter.db` fångar en tom databas och förlorar tyst allt. Volymen bär `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` och din `files/`-katalog tillsammans, och de måste flyttas som en enhet.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Uppgradera till 1.17.2 först {#upgrade-to-1-17-2-first}

Uppgradera din 1.x-installation till den senaste 1.x-releasen (1.17.2) innan du flyttar till 2.0. Det låter 1.x köra sina egna sista schemamigreringar, så att 2.0 importerar från ett känt, komplett schema. Att uppgradera från en äldre 1.x direkt till 2.0 stöds inte.

## Kontrollera ditt volymnamn {#check-your-volume-name}

Importören ser bara din data om 2.0-stacken monterar samma volym som din 1.x-installation använde. Docker-volymnamn är skiftlägeskänsliga, och äldre README-utdrag använde en gemen `snapotter-data` medan Compose-filerna använder `SnapOtter-data`. Bekräfta vilken du har:

```bash
docker volume ls | grep -i snapotter
```

Använd exakt det namnet i din 2.0-konfiguration.

## Väg A: en container (snabbast) {#path-a-single-container-quickest}

Om du kör SnapOtter med en enda `docker run`, fortsätt med det. 2.0 startar en inbäddad PostgreSQL och Redis inuti containern när du inte anger `DATABASE_URL` eller `REDIS_URL`, och den identifierar och importerar automatiskt `/data/snapotter.db` vid första uppstart.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Håll utkik i loggarna efter en rad som:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Det var allt. Logga in med dina befintliga inloggningsuppgifter.

## Väg B: Compose (rekommenderas för produktion) {#path-b-compose-recommended-for-production}

2.0-Compose-stacken kör tre tjänster (app, Postgres, Redis). Återanvänd din 1.x `/data`-volym för app-tjänsten. Appen identifierar automatiskt `/data/snapotter.db` och importerar den till Postgres vid första uppstart.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Om du hellre vill peka på den gamla databasen explicit, ange `SQLITE_MIGRATE_PATH=/data/snapotter.db`. En explicit sökväg vinner alltid över automatisk identifiering.

## Förhandsgranska importen först (valfritt) {#preview-the-import-first-optional}

För att se exakt vad som skulle importeras utan att skriva något, kör en torrkörning mot din databasfil:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Den skriver ut radantalet per tabell, hur många sparade biblioteksfiler den hittade på disk, och alla jobbstatusar den kommer att normalisera. Den behöver ingen körande Postgres.

## Vad som följer med, och vad som inte gör det {#what-carries-over-and-what-does-not}

Följer med:

- Användare, och möjligheten att logga in. Lösenordshasharna är oförändrade, så samma användarnamn och lösenord fungerar.
- Team, inställningar (inklusive din instansidentitet), roller, API-nycklar (de fortsätter fungera) och sparade pipelines.
- Jobbhistorikposter.
- Ditt sparade filbibliotek, både posterna och de faktiska filerna, eftersom `/data/files` bevaras på volymen.

Följer inte med:

- Inloggningssessioner. Alla loggar in en gång efter uppgraderingen. Inloggningsuppgifterna är oförändrade, så det är en enda ny inloggning, inget mer.
- In- och utdatafilerna från gamla bearbetningsjobb. De låg i en tillfällig arbetsyta och är borta enligt design. Jobbhistorikposterna finns kvar.
- Analyssamtyckesflaggor per användare från 1.x, som inte har någon motsvarighet i 2.0 (2.0-analys är en inställning på instansnivå).

## Stänga av importen {#turning-the-import-off}

Om du medvetet vill ha en ny databas trots att en `snapotter.db` finns på volymen, ange `SQLITE_MIGRATE_PATH=off`.

## Om du redan har data i 2.0-instansen {#if-you-already-have-data-in-the-2-0-instance}

Importören körs bara mot en tom databas. Om du startade 2.0 från början (skapade data) och senare monterade en gammal `snapotter.db`, kommer 2.0 att identifiera den men inte importera, eftersom en sammanslagning av två dataset kan kollidera på ID:n. Du kommer att se en varning i loggarna. För att importera 1.x-datan behöver du en tom instans:

- Om 2.0-instansen bara innehåller standardadministratören (du har egentligen inte använt den), stoppa stacken, ta bort Postgres-volymen (`SnapOtter-pgdata`) och starta igen med den gamla `/data` närvarande. Den importerar rent. Detta raderar bara den slängbara Postgres-datan, inte din 1.x-databas.
- Om 2.0-instansen innehåller riktig data du vill behålla kan de två dataseten inte slås samman automatiskt. Exportera det du behöver och importera 1.x-datan till en separat, ny distribution.

## Rulla tillbaka {#rolling-back}

Uppgraderingen ändrar eller raderar aldrig din 1.x `snapotter.db`. Om du behöver gå tillbaka till 1.x, distribuera om 1.x-avbildningen mot samma volym. Allt du skapade i 2.0 efter uppgraderingen finns i Postgres och skulle inte finnas i 1.x-databasen, så rulla tillbaka snabbt om du tänker göra det.
