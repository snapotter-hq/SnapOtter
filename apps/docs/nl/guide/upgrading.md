---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 9e23f36db12d
i18n_hash_version: 2
---
# Upgraden van 1.x naar 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x sloeg alles op in één SQLite-bestand en draaide als één container. SnapOtter 2.0 gebruikt PostgreSQL en Redis. Deze handleiding beschrijft hoe u een 1.x-installatie naar 2.0 verplaatst zonder data te verliezen.

De korte versie: hergebruik uw bestaande volume `/data`, en 2.0 importeert uw 1.x-database automatisch bij de eerste start. Uw gebruikers, opgeslagen bestanden, instellingen, API-sleutels en pipelines worden overgenomen. De oude database wordt nooit gewijzigd, dus u kunt altijd terugdraaien.

::: tip Een opmerking voor onze 1.x-gebruikers
Velen van u vertrouwen SnapOtter al vanaf dag één, en uw feedback heeft deze release gevormd. 2.0 verandert veel onder de motorkap, en deze handleiding bestaat zodat de overstap u niets kost wat u belangrijk vindt. Uw accounts, bestanden, instellingen, API-sleutels en pipelines worden overgenomen, en uw oude database wordt nooit aangeraakt. Bedankt dat u met ons meegaat naar de nieuwe versie.
:::

## Voordat u begint: maak een back-up van het hele volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Doe dit altijd eerst. Maak een back-up van het **volledige** volume `/data`, niet alleen van het bestand `snapotter.db`.

Dit is waarom het ertoe doet. 1.x draait SQLite in WAL-modus, dus een gestopte 1.x-container laat het merendeel van zijn vastgelegde data doorgaans achter in `snapotter.db-wal` naast een bijna lege `snapotter.db`. Wie alleen `snapotter.db` kopieert, legt een lege database vast en verliest stilzwijgend alles. Het volume bevat `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` en uw map `files/` samen, en ze moeten als geheel worden meegenomen.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Upgrade eerst naar 1.17.2 {#upgrade-to-1-17-2-first}

Upgrade uw 1.x-installatie naar de nieuwste 1.x-release (1.17.2) voordat u naar 2.0 overstapt. Daarmee kan 1.x zijn eigen laatste schemamigraties uitvoeren, zodat 2.0 importeert vanuit een bekend, compleet schema. Rechtstreeks upgraden van een oudere 1.x naar 2.0 wordt niet ondersteund.

## Controleer de naam van uw volume {#check-your-volume-name}

De importer ziet uw data alleen als de 2.0-stack hetzelfde volume koppelt als uw 1.x-installatie gebruikte. Namen van Docker-volumes zijn hoofdlettergevoelig, en oudere README-fragmenten gebruikten een `snapotter-data` in kleine letters, terwijl de Compose-bestanden `SnapOtter-data` gebruiken. Controleer welke u hebt:

```bash
docker volume ls | grep -i snapotter
```

Gebruik exact die naam in uw 2.0-configuratie.

## Pad A: enkele container (snelst) {#path-a-single-container-quickest}

Als u SnapOtter draait met één `docker run`, blijf dat dan doen. 2.0 start een embedded PostgreSQL en Redis binnen de container wanneer u `DATABASE_URL` of `REDIS_URL` niet instelt, en detecteert en importeert `/data/snapotter.db` automatisch bij de eerste start.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Let in de logs op een regel zoals:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Dat is alles. Meld u aan met uw bestaande inloggegevens.

## Pad B: Compose (aanbevolen voor productie) {#path-b-compose-recommended-for-production}

De 2.0 Compose-stack draait drie services (app, Postgres, Redis). Hergebruik uw 1.x-volume `/data` voor de app-service. De app detecteert `/data/snapotter.db` automatisch en importeert het bij de eerste start in Postgres.

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

Wilt u liever expliciet naar de oude database verwijzen, stel dan `SQLITE_MIGRATE_PATH=/data/snapotter.db` in. Een expliciet pad wint altijd van automatische detectie.

## Bekijk de import eerst (optioneel) {#preview-the-import-first-optional}

Om precies te zien wat er zou worden geïmporteerd zonder iets te schrijven, voert u een dry run uit op uw databasebestand:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Het toont het aantal rijen per tabel, hoeveel opgeslagen bibliotheekbestanden het op schijf heeft gevonden en welke jobstatussen het zal normaliseren. Er is geen draaiende Postgres voor nodig.

## Wat wordt overgenomen en wat niet {#what-carries-over-and-what-does-not}

Overgenomen:

- Gebruikers, en de mogelijkheid om aan te melden. Wachtwoordhashes blijven ongewijzigd, dus dezelfde gebruikersnaam en hetzelfde wachtwoord werken.
- Teams, instellingen (inclusief de identiteit van uw instantie), rollen, API-sleutels (ze blijven werken) en opgeslagen pipelines.
- Records van de jobgeschiedenis.
- Uw bibliotheek met opgeslagen bestanden, zowel de records als de eigenlijke bestanden, omdat `/data/files` op het volume behouden blijft.

Niet overgenomen:

- Aanmeldsessies. Iedereen meldt zich na de upgrade eenmaal opnieuw aan. De inloggegevens blijven ongewijzigd, dus het is één keer opnieuw aanmelden, meer niet.
- De invoer- en uitvoerbestanden van oude verwerkingsjobs. Die stonden in een tijdelijke werkruimte en zijn bewust verdwenen. De records van de jobgeschiedenis blijven bestaan.
- Toestemmingsvlaggen voor analyse per gebruiker uit 1.x, die in 2.0 geen equivalent hebben (analyse in 2.0 is een instelling op instantieniveau).

## De import uitschakelen {#turning-the-import-off}

Als u bewust een verse database wilt, ook al staat er een `snapotter.db` op het volume, stel dan `SQLITE_MIGRATE_PATH=off` in.

## Als u al data in de 2.0-instantie hebt {#if-you-already-have-data-in-the-2-0-instance}

De importer draait alleen in een lege database. Als u 2.0 vers hebt gestart (en data hebt aangemaakt) en later een oude `snapotter.db` hebt gekoppeld, detecteert 2.0 die wel maar importeert niet, omdat het samenvoegen van twee datasets kan leiden tot botsende ID's. U ziet een waarschuwing in de logs. Om de 1.x-data te importeren hebt u een lege instantie nodig:

- Als de 2.0-instantie alleen de standaardbeheerder bevat (u hebt hem nog niet echt gebruikt), stopt u de stack, verwijdert u het Postgres-volume (`SnapOtter-pgdata`) en start u opnieuw op met de oude `/data` aanwezig. De import verloopt dan schoon. Dit wist alleen de wegwerp-Postgres-data, niet uw 1.x-database.
- Als de 2.0-instantie echte data bevat die u wilt behouden, kunnen de twee datasets niet automatisch worden samengevoegd. Exporteer wat u nodig hebt en importeer de 1.x-data in een aparte verse implementatie.

## Terugdraaien {#rolling-back}

De upgrade wijzigt of verwijdert uw 1.x-`snapotter.db` nooit. Als u terug wilt naar 1.x, implementeert u de 1.x-image opnieuw op hetzelfde volume. Alles wat u na de upgrade in 2.0 hebt aangemaakt staat in Postgres en zit niet in de 1.x-database, dus draai snel terug als u dat van plan bent.
