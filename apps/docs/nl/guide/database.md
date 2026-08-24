---
description: "PostgreSQL-databaseschema, tabellen, migraties en back-upprocedures voor SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: 0c2305505e16
i18n_hash_version: 2
---

# Database {#database}

SnapOtter gebruikt PostgreSQL 17 met [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) voor gegevensopslag. Het schema is gedefinieerd in `apps/api/src/db/schema.ts`.

De verbinding wordt geconfigureerd via de omgevingsvariabele `DATABASE_URL` (standaard `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose slaat de Postgres-container zijn gegevens op in het benoemde volume `SnapOtter-pgdata`. Verzoeken worden afgehandeld door een rol die alleen rijen kan lezen en schrijven, wat hieronder wordt behandeld onder [Rollen met minimale rechten](#least-privilege-roles).

## Tabellen {#tables}

### users {#users}

Slaat gebruikersaccounts op. Wordt bij de eerste run automatisch aangemaakt op basis van `DEFAULT_USERNAME` en `DEFAULT_PASSWORD`.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `username` | varchar | Uniek, vereist |
| `passwordHash` | varchar | scrypt-hash |
| `role` | varchar | `admin`, `editor` of `user` |
| `mustChangePassword` | boolean | Vlag voor geforceerde wachtwoordreset |
| `createdAt` | timestamp | Aanmaaktijd |
| `updatedAt` | timestamp | Tijd van laatste update |

### sessions {#sessions}

Actieve aanmeldsessies. Elke rij koppelt een sessietoken aan een gebruiker.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | varchar | Primaire sleutel (sessietoken) |
| `userId` | uuid | Vreemde sleutel naar `users.id` |
| `expiresAt` | timestamp | Vervaltijd |
| `createdAt` | timestamp | Aanmaaktijd |

### teams {#teams}

Groepen om gebruikers te organiseren. Beheerders kunnen gebruikers aan teams toewijzen.

| Kolom | Type | Beschrijving |
|--------|------|-------------|
| `id` | uuid | Primaire sleutel |
| `name` | varchar (uniek, max. 50 tekens) | Teamnaam |
| `createdAt` | timestamp | Aanmaaktijd |

### api_keys {#api-keys}

API-sleutels voor programmatische toegang. De onbewerkte sleutel wordt eenmalig getoond bij aanmaken; alleen de hash wordt opgeslagen.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `userId` | uuid | Vreemde sleutel naar `users.id` |
| `keyHash` | varchar | scrypt-hash van de sleutel |
| `name` | varchar | Door de gebruiker opgegeven label |
| `createdAt` | timestamp | Aanmaaktijd |
| `lastUsedAt` | timestamp | Bijgewerkt bij elk geauthenticeerd verzoek |

Sleutels beginnen met het voorvoegsel `si_` gevolgd door 96 hexadecimale tekens (48 willekeurige bytes).

### pipelines {#pipelines}

Opgeslagen toolketens die gebruikers in de UI aanmaken.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `name` | varchar | Pipelinenaam |
| `description` | varchar | Optionele beschrijving |
| `steps` | jsonb | Array van `{ toolId, settings }`-objecten |
| `createdAt` | timestamp | Aanmaaktijd |

### user_files {#user-files}

Persistente bestandsbibliotheek. Een opgeslagen bewerking wordt standaard als een onafhankelijke root-rij ingevoegd ("opslaan als nieuw": `version` 1, `parentId` null, zodat het origineel in de lijst blijft staan), of als een aan de bovenliggende rij gekoppelde versie wanneer je het origineel overschrijft (`parentId` ingesteld, `version` opgehoogd, waarmee het wordt vervangen). De kolom `toolChain` registreert welke tools zijn toegepast.

| Kolom | Type | Beschrijving |
|--------|------|-------------|
| `id` | uuid | Primaire sleutel |
| `userId` | uuid | FK naar users (CASCADE DELETE) |
| `originalName` | varchar | Oorspronkelijke bestandsnaam bij upload |
| `storedName` | varchar | Bestandsnaam op schijf |
| `mimeType` | varchar | MIME-type |
| `size` | integer | Bestandsgrootte in bytes |
| `width` | integer | Breedte van de afbeelding in px |
| `height` | integer | Hoogte van de afbeelding in px |
| `version` | integer | Versienummer (1 = origineel) |
| `parentId` | uuid of null | FK naar user_files (bovenliggende versie) |
| `toolChain` | jsonb | Tool-ID's die op volgorde zijn toegepast om deze versie te maken |
| `createdAt` | timestamp | Aanmaaktijd |

### jobs {#jobs}

Volgt verwerkingsjobs voor voortgangsrapportage en opschoning.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `type` | varchar | Tool- of pipeline-identifier |
| `status` | varchar | `queued`, `processing`, `completed` of `failed` |
| `progress` | real | Fractie van 0.0-1.0 |
| `inputFiles` | jsonb | Array van invoerbestandspaden |
| `outputPath` | varchar | Pad naar het resultaatbestand |
| `settings` | jsonb | Gebruikte toolinstellingen |
| `error` | varchar | Foutmelding bij mislukken |
| `createdAt` | timestamp | Aanmaaktijd |
| `completedAt` | timestamp | Voltooiingstijd |

### settings {#settings}

Sleutel-waardeopslag voor serverbrede instellingen die beheerders vanuit de UI kunnen wijzigen.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `key` | varchar | Primaire sleutel |
| `value` | varchar | Instellingswaarde |
| `updatedAt` | timestamp | Tijd van laatste update |

### roles {#roles}

Aangepaste rollen met granulaire rechten.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `name` | varchar | Unieke rolnaam |
| `description` | varchar | Optionele beschrijving |
| `permissions` | jsonb | Array van rechtenstrings |
| `createdAt` | timestamp | Aanmaaktijd |

### audit_log {#audit-log}

Logboek van beveiligingsrelevante acties.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `userId` | uuid | FK naar users |
| `action` | varchar | Actietype |
| `details` | jsonb | Actiespecifieke gegevens |
| `createdAt` | timestamp | Tijd van de actie |

### user_preferences {#user-preferences}

UI-status per gebruiker, gesleuteld op voorkeursnaam. Bewaart de vastgezette tools van de startpagina, die via `PUT /api/v1/preferences` worden geschreven.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `userId` | text | FK naar users, cascaderend verwijderen. Samen met `key` de primaire sleutel |
| `key` | text | Naam van de voorkeur. Samen met `userId` de primaire sleutel |
| `value` | jsonb | Inhoud van de voorkeur |
| `updatedAt` | timestamp | Laatste schrijfactie |

## Migraties {#migrations}

Drizzle verzorgt schemamigraties. Migratiebestanden staan in `apps/api/drizzle/`. Tijdens ontwikkeling:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In productie worden openstaande migraties automatisch toegepast bij het opstarten.

## Rollen met minimale rechten {#least-privilege-roles}

Twee rollen, twee taken. `DATABASE_URL` handelt verzoeken af en heeft `SELECT`, `INSERT`, `UPDATE`, `DELETE` op de tabellen van de app, plus `USAGE` en `SELECT` op hun sequences. Dat is de hele lijst. De rol kan geen tabel aanmaken of verwijderen, geen extensie installeren, geen `TRUNCATE` uitvoeren, `pg_authid` niet lezen, geen database aanmaken, geen rol wijzigen en niet aan het `drizzle`-schema komen, waar de migratiegeschiedenis staat.

`DATABASE_MIGRATION_URL` is de bevoorrechte rol. Die voert migraties uit en kent tijdens het opstarten rechten toe aan de runtime-rol, en sluit daarna af voordat er ook maar één verzoek wordt afgehandeld.

Compose en de alles-in-één-image zijn al zo ingericht, bestaande installaties inbegrepen. Bij het opstarten maakt SnapOtter de runtime-rol aan als die ontbreekt, kent de rechten toe, voert de migraties uit en trekt de rechten daarna door naar tabellen die er al stonden. Upgraden vergt geen handmatige SQL.

Laat je `DATABASE_MIGRATION_URL` leeg, dan draait alles op één rol en doet `DATABASE_URL` beide taken, precies zoals vóór de splitsing. Dat is een ondersteunde configuratie en geen verouderde. Op beheerde Postgres is het vaak het juiste antwoord, want daar mag je meestal zelf geen rollen aanmaken.

### Externe en beheerde Postgres {#external-and-managed-postgres}

Op RDS, Supabase, Cloud SQL of een cluster dat je zelf draait, is de splitsing optioneel. Maak de runtime-rol eenmalig aan:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Geef SnapOtter vervolgens beide verbindingsstrings, gericht op dezelfde host, poort en database:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Meer is niet nodig. SnapOtter kent de rechten zelf toe en doet dat na elke migratie opnieuw, zodat een tabel die in een toekomstige release bij komt gedekt is zonder dat iemand daar SQL voor hoeft te draaien.

De rol in `DATABASE_MIGRATION_URL` moet eigenaar zijn van de SnapOtter-tabellen, want alleen de eigenaar van een tabel kan er rechten op toekennen. Op een bestaande installatie is dat de rol waaronder je SnapOtter al draait, niet een verse rol die je er speciaal voor aanmaakt. Wijs je een nieuwe rol aan die nergens eigenaar van is, dan mislukt het opstarten met precies die foutmelding. De rol heeft ook `CREATEROLE` nodig om de runtime-rol aan te maken en te onderhouden, plus het recht om het `drizzle`-schema aan te maken.

Noem je in beide URL's dezelfde rol, dan is de splitsing uit, en SnapOtter meldt dat in het log in plaats van te doen alsof. Geeft je provider je geen rol die zowel eigenaar van de tabellen kan zijn als `CREATEROLE` kan hebben, draai dan op één rol.

### Waarom het superuser-bit ongemoeid blijft {#why-the-superuser-bit-is-left-alone}

SnapOtter haalt nooit uit zichzelf `SUPERUSER` bij een rol weg. Op een installatie die van vóór de splitsing dateert, is `snapotter` de enige superuser van het cluster, en degraderen zou het cluster er zonder achterlaten, alleen nog te herstellen via de single-user-modus met een gestopte server. De bescherming komt in plaats daarvan van het verplaatsen van de langlopende verbinding naar de beperkte rol. De superuser zit de paar seconden van het opstarten op de lijn en is daarna weg.

Nieuwe alles-in-één-installaties hebben dat probleem nooit. Die krijgen drie rollen: `postgres` (bootstrap-superuser, komt in geen enkele verbindingsstring van SnapOtter voor), `snapotter` (`NOSUPERUSER`, eigenaar van de gegevens, verbindt alleen bij het opstarten) en `snapotter_app` (alleen rijen, handelt verzoeken af).

Wil je een oudere `snapotter` toch degraderen, maak dan eerst een tweede superuser aan en log daarmee in om te bevestigen dat die werkt. Voer daarna `ALTER ROLE snapotter NOSUPERUSER` uit.

## Back-up en herstel {#backup-and-restore}

De relationele database bevindt zich in het `SnapOtter-pgdata`-volume van de Postgres-container, niet in het `/data`-volume van de app.

**Logische back-up met validatie (aanbevolen)**

```bash
# Dump into PostgreSQL's portable custom archive format
docker exec SnapOtter-postgres \
  pg_dump --format=custom --no-owner -U snapotter snapotter > snapotter.dump
test -s snapotter.dump
docker exec -i SnapOtter-postgres pg_restore --list < snapotter.dump >/dev/null

# Restore into a fresh/disposable target first and fail on the first SQL error
docker exec -i SnapOtter-postgres \
  pg_restore --exit-on-error --clean --if-exists --no-owner \
  -U snapotter -d snapotter < snapotter.dump
```

Beide commando's verbinden als `snapotter`, de eigenaar, en dat moet zo blijven. De runtime-rol kan het `drizzle`-schema niet zien, dus een dump die onder die rol wordt gemaakt komt er onvolledig uit. `--no-owner` laat herstelde objecten in eigendom van degene die het herstel uitvoert, dus door het als eigenaar te draaien komt het eigendom te liggen waar de rechten het verwachten. Eén valkuil op een vers cluster: `pg_dump` neemt de rechten wel mee, maar niet de rollen waar ze naar verwijzen, dus maak `snapotter_app` aan vóór het herstellen, anders stopt `--exit-on-error` bij de eerste `GRANT`. SnapOtter kent de rechten hoe dan ook opnieuw toe bij de volgende keer opstarten.

Deze databasedump bevat geen opgeslagen bibliotheekobjecten in `/data/files` of de duurzame BullMQ-status in Redis. Maak een back-up en herstel deze met de gecoördineerde procedure in [Beveiliging en verharding](/nl/guide/security#backup-and-recovery).

**Koude volumemomentopname**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Kopieer geen live PostgreSQL-gegevensmap met `tar`. Stel volumenamen voor voorvoegsels samen per project, dus los de gekoppelde volume-ID's van `docker inspect` of uw opslagplatform op in plaats van het letterlijke label `SnapOtter-pgdata` aan te nemen.

### Migreren vanaf 1.x (SQLite) {#migrating-from-1-x-sqlite}

Upgraden vanaf SnapOtter 1.x heeft een eigen gids: zie [Upgraden van 1.x naar 2.0](./upgrading). Kort gezegd: hergebruik je bestaande `/data`-volume, en 2.0 detecteert en importeert `/data/snapotter.db` automatisch bij de eerste keer opstarten (of stel `SQLITE_MIGRATE_PATH` in om er expliciet naar te verwijzen). Maak eerst een back-up van het volledige `/data`-volume, niet alleen van `snapotter.db`: 1.x gebruikt de SQLite WAL-modus, dus een gestopte container laat vaak het grootste deel van zijn gegevens in `snapotter.db-wal` staan naast een bijna leeg `snapotter.db`.
