---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 62fc62c57431
i18n_hash_version: 2
---
# Uppgradera från 1.x till 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x lagrade allt i en enda SQLite-fil och kördes som en container. SnapOtter 2.0 använder PostgreSQL och Redis. Den här guiden går igenom hur du flyttar en 1.x-installation till 2.0 utan att förlora data.

Kort version: återanvänd din befintliga volym `/data`, så importerar 2.0 din 1.x-databas automatiskt vid första uppstarten. Dina användare, sparade filer, inställningar, API-nycklar och pipelines följer med. Den gamla databasen ändras aldrig, så du kan alltid gå tillbaka.

::: tip Ett meddelande till våra 1.x-användare
Många av er har litat på SnapOtter sedan dag ett, och er feedback har format den här utgåvan. 2.0 ändrar mycket under huven, och den här guiden finns för att flytten inte ska kosta dig något du bryr dig om. Dina konton, filer, inställningar, API-nycklar och pipelines följer med, och din gamla databas rörs aldrig. Tack för att du uppgraderar med oss.
:::

## Innan du börjar: säkerhetskopiera hela volymen `/data` {#before-you-start-back-up-the-whole-data-volume}

Gör detta först, varje gång. Säkerhetskopiera **hela** volymen `/data`, inte bara filen `snapotter.db`.

Så här ligger det till. 1.x kör SQLite i WAL-läge, så en stoppad 1.x-container lämnar rutinmässigt största delen av sina committade data i `snapotter.db-wal` bredvid en nästan tom `snapotter.db`. Om du bara kopierar `snapotter.db` får du en tom databas och förlorar allt utan att märka det. Volymen innehåller `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` och din katalog `files/` tillsammans, och de måste hanteras som en uppsättning.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Uppgradera först till 1.17.2 {#upgrade-to-1-17-2-first}

Uppgradera din 1.x-installation till den senaste 1.x-utgåvan (1.17.2) innan du går över till 2.0. Då kan 1.x köra sina egna sista schemamigreringar, så att 2.0 importerar från ett känt, komplett schema. Att uppgradera från en äldre 1.x direkt till 2.0 stöds inte.

## Kontrollera volymens namn {#check-your-volume-name}

Importören ser bara dina data om 2.0-stacken monterar samma volym som din 1.x-installation använde. Dockers volymnamn är skiftlägeskänsliga, och äldre README-utdrag använde gemener i `snapotter-data` medan Compose-filerna använder `SnapOtter-data`. Bekräfta vilken du har:

```bash
docker volume ls | grep -i snapotter
```

Använd exakt det namnet i din 2.0-konfiguration.

## Väg A: en enda container (snabbast) {#path-a-single-container-quickest}

Om du kör SnapOtter med en enda `docker run`, fortsätt med det. 2.0 startar en inbäddad PostgreSQL och Redis inuti containern när du inte anger `DATABASE_URL` eller `REDIS_URL`, och identifierar och importerar `/data/snapotter.db` automatiskt vid första uppstarten.

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

Compose-stacken för 2.0 kör tre tjänster (app, Postgres, Redis). Återanvänd din 1.x-volym `/data` för apptjänsten. Appen identifierar `/data/snapotter.db` automatiskt och importerar den till Postgres vid första uppstarten.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Om du hellre pekar ut den gamla databasen uttryckligen, ange `SQLITE_MIGRATE_PATH=/data/snapotter.db`. En uttrycklig sökväg har alltid företräde framför autodetekteringen.

## Förhandsgranska importen först (valfritt) {#preview-the-import-first-optional}

För att se exakt vad som skulle importeras utan att skriva något, kör en testkörning mot din databasfil:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Den skriver ut radantal per tabell, hur många filer från det sparade biblioteket den hittade på disk och vilka jobbstatusar den kommer att normalisera. Den behöver ingen körande Postgres.

## Vad som följer med och vad som inte gör det {#what-carries-over-and-what-does-not}

Följer med:

- Användare och möjligheten att logga in. Lösenordshashar är oförändrade, så samma användarnamn och lösenord fungerar.
- Team, inställningar (inklusive din instansidentitet), roller, API-nycklar (de fortsätter fungera) och sparade pipelines.
- Jobbhistorik.
- Ditt bibliotek med sparade filer, både posterna och själva filerna, eftersom `/data/files` bevaras på volymen.

Följer inte med:

- Inloggningssessioner. Alla loggar in en gång efter uppgraderingen. Inloggningsuppgifterna är oförändrade, så det blir en enda ny inloggning, inget mer.
- In- och utdatafilerna från gamla bearbetningsjobb. De låg i en tillfällig arbetsyta och är borta med avsikt. Jobbhistoriken finns kvar.
- Samtyckesflaggor för analys per användare från 1.x, som saknar motsvarighet i 2.0 (analys i 2.0 är en inställning på instansnivå).

## Stänga av importen {#turning-the-import-off}

Om du medvetet vill ha en ny databas trots att en `snapotter.db` finns på volymen, ange `SQLITE_MIGRATE_PATH=off`.

## Om du redan har data i 2.0-instansen {#if-you-already-have-data-in-the-2-0-instance}

Importören körs bara mot en tom databas. Om du startade 2.0 på nytt (och skapade data) och sedan monterade en gammal `snapotter.db`, upptäcker 2.0 den men importerar inte, eftersom en sammanslagning av två datamängder kan ge ID-kollisioner. Du ser en varning i loggarna. För att importera 1.x-datan behöver du en tom instans:

- Om 2.0-instansen bara innehåller standardadministratören (du har inte riktigt använt den), stoppa stacken, ta bort Postgres-volymen (`SnapOtter-pgdata`) och starta om med den gamla `/data` på plats. Den importeras då rent. Det rensar bara de tillfälliga Postgres-data, inte din 1.x-databas.
- Om 2.0-instansen innehåller riktiga data som du vill behålla kan de två datamängderna inte slås ihop automatiskt. Exportera det du behöver och importera 1.x-datan i en separat ny driftsättning.

## Gå tillbaka {#rolling-back}

Uppgraderingen ändrar eller raderar aldrig din 1.x-`snapotter.db`. Om du behöver gå tillbaka till 1.x, driftsätt 1.x-avbilden på nytt mot samma volym. Allt du skapade i 2.0 efter uppgraderingen ligger i Postgres och finns inte i 1.x-databasen, så gå tillbaka snabbt om du ska göra det.
