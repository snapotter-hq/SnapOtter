---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: 37eca3f2f461
---
# Upgraden van 1.x naar 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x sloeg alles op in één enkel SQLite-bestand en draaide als één container. SnapOtter 2.0 gebruikt PostgreSQL en Redis. Deze gids leidt je door het verplaatsen van een 1.x-installatie naar 2.0 zonder gegevensverlies.

De korte versie: hergebruik je bestaande `/data`-volume, en 2.0 importeert je 1.x-database automatisch bij de eerste boot. Je gebruikers, opgeslagen bestanden, instellingen, API-sleutels en pipelines gaan mee. De oude database wordt nooit gewijzigd, zodat je altijd kunt terugrollen.

::: tip Een opmerking voor onze 1.x-gebruikers
Velen van jullie vertrouwen SnapOtter sinds dag één, en jullie feedback heeft deze release vormgegeven. 2.0 verandert veel onder de motorkap, en deze gids bestaat zodat de overstap je niets kost wat je belangrijk vindt. Je accounts, bestanden, instellingen, API-sleutels en pipelines gaan mee, en je oude database wordt nooit aangeraakt. Bedankt dat je met ons upgradet.
:::

## Voordat je begint: maak een back-up van het hele `/data`-volume {#before-you-start-back-up-the-whole-data-volume}

Doe dit eerst, elke keer. Maak een back-up van het **hele** `/data`-volume, niet alleen van het `snapotter.db`-bestand.

Dit is waarom het belangrijk is. 1.x draait SQLite in WAL-modus, dus een gestopte 1.x-container laat routinematig het grootste deel van zijn vastgelegde gegevens achter in `snapotter.db-wal` naast een bijna-lege `snapotter.db`. Als je alleen `snapotter.db` kopieert, leg je een lege database vast en verlies je stilzwijgend alles. Het volume draagt `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` en je `files/`-directory samen, en ze moeten als één geheel meereizen.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Upgrade eerst naar 1.17.2 {#upgrade-to-1-17-2-first}

Upgrade je 1.x-installatie naar de nieuwste 1.x-release (1.17.2) voordat je naar 2.0 gaat. Zo kan 1.x zijn eigen laatste schemamigraties uitvoeren, zodat 2.0 importeert vanuit een bekend, volledig schema. Rechtstreeks upgraden van een ouder 1.x naar 2.0 wordt niet ondersteund.

## Controleer je volumenaam {#check-your-volume-name}

De importer ziet je gegevens alleen als de 2.0-stack hetzelfde volume mount dat je 1.x-installatie gebruikte. Docker-volumenamen zijn hoofdlettergevoelig, en oudere README-fragmenten gebruikten een kleine letter `snapotter-data` terwijl de Compose-bestanden `SnapOtter-data` gebruiken. Bevestig welke je hebt:

```bash
docker volume ls | grep -i snapotter
```

Gebruik precies die naam in je 2.0-configuratie.

## Pad A: enkele container (snelst) {#path-a-single-container-quickest}

Als je SnapOtter met een enkele `docker run` draait, blijf dat dan doen. 2.0 boot een ingebedde PostgreSQL en Redis binnen de container wanneer je `DATABASE_URL` of `REDIS_URL` niet instelt, en het detecteert en importeert `/data/snapotter.db` automatisch bij de eerste boot.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Houd de logs in de gaten voor een regel als:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Dat is het. Meld je aan met je bestaande inloggegevens.

## Pad B: Compose (aanbevolen voor productie) {#path-b-compose-recommended-for-production}

De 2.0-Compose-stack draait drie services (app, Postgres, Redis). Hergebruik je 1.x `/data`-volume voor de app-service. De app detecteert `/data/snapotter.db` automatisch en importeert het bij de eerste boot in Postgres.

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

Als je liever expliciet naar de oude database wijst, stel dan `SQLITE_MIGRATE_PATH=/data/snapotter.db` in. Een expliciet pad wint altijd van automatische detectie.

## Bekijk de import eerst als voorbeeld (optioneel) {#preview-the-import-first-optional}

Om precies te zien wat er zou worden geïmporteerd zonder iets te schrijven, voer je een dry run uit tegen je databasebestand:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Het drukt de rijaantallen per tabel af, hoeveel opgeslagen bibliotheekbestanden het op schijf heeft gevonden, en eventuele taakstatussen die het zal normaliseren. Er is geen draaiende Postgres voor nodig.

## Wat gaat mee, en wat niet {#what-carries-over-and-what-does-not}

Gaat mee:

- Gebruikers, en de mogelijkheid om in te loggen. Wachtwoord-hashes zijn ongewijzigd, dus dezelfde gebruikersnaam en hetzelfde wachtwoord werken.
- Teams, instellingen (inclusief je instantie-identiteit), rollen, API-sleutels (die blijven werken) en opgeslagen pipelines.
- Records van de taakgeschiedenis.
- Je bibliotheek met opgeslagen bestanden, zowel de records als de daadwerkelijke bestanden, omdat `/data/files` op het volume behouden blijft.

Gaat niet mee:

- Aanmeldsessies. Iedereen meldt zich één keer aan na de upgrade. Inloggegevens zijn ongewijzigd, dus het is één keer opnieuw inloggen, meer niet.
- De invoer- en uitvoerbestanden van oude verwerkingstaken. Die stonden in een tijdelijke werkruimte en zijn opzettelijk verdwenen. De records van de taakgeschiedenis blijven.
- Analytics-toestemmingsvlaggen per gebruiker uit 1.x, die geen 2.0-equivalent hebben (2.0-analytics is een instelling op instantieniveau).

## De import uitschakelen {#turning-the-import-off}

Als je bewust een verse database wilt hoewel er een `snapotter.db` op het volume aanwezig is, stel dan `SQLITE_MIGRATE_PATH=off` in.

## Als je al gegevens in de 2.0-instantie hebt {#if-you-already-have-data-in-the-2-0-instance}

De importer draait alleen in een lege database. Als je 2.0 vers hebt gestart (gegevens aangemaakt) en later een oude `snapotter.db` hebt gemount, detecteert 2.0 die wel maar importeert die niet, omdat het samenvoegen van twee datasets kan botsen op ID's. Je ziet een waarschuwing in de logs. Om de 1.x-gegevens te importeren heb je een lege instantie nodig:

- Als de 2.0-instantie alleen de standaardbeheerder bevat (je hebt hem niet echt gebruikt), stop dan de stack, verwijder het Postgres-volume (`SnapOtter-pgdata`) en boot opnieuw met de oude `/data` aanwezig. Het importeert dan schoon. Dit wist alleen de wegwerpbare Postgres-gegevens, niet je 1.x-database.
- Als de 2.0-instantie echte gegevens bevat die je wilt behouden, kunnen de twee datasets niet automatisch worden samengevoegd. Exporteer wat je nodig hebt en importeer de 1.x-gegevens in een aparte, verse deployment.

## Terugrollen {#rolling-back}

De upgrade wijzigt of verwijdert je 1.x `snapotter.db` nooit. Als je terug moet naar 1.x, deploy dan de 1.x-image opnieuw tegen hetzelfde volume. Alles wat je na de upgrade in 2.0 hebt aangemaakt, staat in Postgres en zou niet in de 1.x-database staan, dus rol snel terug als je dat gaat doen.
