---
description: "PostgreSQL-databaseschema, tabellen, migraties en back-upprocedures voor SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 27326c05301a
i18n_hash_version: 2
---

# Database {#database}

SnapOtter gebruikt PostgreSQL 17 met [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) voor gegevensopslag. Het schema is gedefinieerd in `apps/api/src/db/schema.ts`.

De verbinding wordt geconfigureerd via de omgevingsvariabele `DATABASE_URL` (standaard `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose slaat de Postgres-container zijn gegevens op in het benoemde volume `SnapOtter-pgdata`. Verzoeken worden afgehandeld onder een rol die alleen rijen kan lezen en schrijven, zoals hieronder onder [Rollen met minimale rechten](#least-privilege-roles) wordt beschreven.

## Tabellen {#tables}

### users {#users}

Slaat gebruikersaccounts op. Wordt bij de eerste start automatisch aangemaakt op basis van `DEFAULT_USERNAME` en `DEFAULT_PASSWORD`.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `username` | varchar | Uniek, verplicht |
| `passwordHash` | varchar | scrypt-hash |
| `role` | varchar | `admin`, `editor` of `user` |
| `mustChangePassword` | boolean | Vlag voor verplichte wachtwoordreset |
| `createdAt` | timestamp | Aanmaaktijd |
| `updatedAt` | timestamp | Tijd van laatste wijziging |

### sessions {#sessions}

Actieve loginsessies. Elke rij koppelt een sessietoken aan een gebruiker.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | varchar | Primaire sleutel (sessietoken) |
| `userId` | uuid | Foreign key naar `users.id` |
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

API-sleutels voor programmatische toegang. De ruwe sleutel wordt eenmalig bij het aanmaken getoond; alleen de hash wordt opgeslagen.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `userId` | uuid | Foreign key naar `users.id` |
| `keyHash` | varchar | scrypt-hash van de sleutel |
| `name` | varchar | Door de gebruiker opgegeven label |
| `createdAt` | timestamp | Aanmaaktijd |
| `lastUsedAt` | timestamp | Wordt bij elk geauthenticeerd verzoek bijgewerkt |

Sleutels beginnen met het voorvoegsel `si_` gevolgd door 96 hexadecimale tekens (48 willekeurige bytes).

### pipelines {#pipelines}

Opgeslagen toolketens die gebruikers in de interface maken.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `name` | varchar | Pipelinenaam |
| `description` | varchar | Optionele beschrijving |
| `steps` | jsonb | Array van `{ toolId, settings }`-objecten |
| `createdAt` | timestamp | Aanmaaktijd |

### user_files {#user-files}

Permanente bestandenbibliotheek. Een opgeslagen bewerking wordt standaard ingevoegd als een onafhankelijke hoofdrij ("opslaan als nieuw": `version` 1, `parentId` null, zodat het origineel zichtbaar blijft), of als een aan de bovenliggende versie gekoppelde versie wanneer u het origineel overschrijft (`parentId` ingesteld, `version` verhoogd, waardoor het origineel wordt vervangen). De kolom `toolChain` legt de toegepaste tools vast.

| Kolom | Type | Beschrijving |
|--------|------|-------------|
| `id` | uuid | Primaire sleutel |
| `userId` | uuid | FK naar users (CASCADE DELETE) |
| `originalName` | varchar | Oorspronkelijke bestandsnaam van de upload |
| `storedName` | varchar | Bestandsnaam op schijf |
| `mimeType` | varchar | MIME-type |
| `size` | integer | Bestandsgrootte in bytes |
| `width` | integer | Afbeeldingsbreedte in px |
| `height` | integer | Afbeeldingshoogte in px |
| `version` | integer | Versienummer (1 = origineel) |
| `parentId` | uuid of null | FK naar user_files (bovenliggende versie) |
| `toolChain` | jsonb | Tool-ID's in de volgorde waarin ze zijn toegepast om deze versie te maken |
| `createdAt` | timestamp | Aanmaaktijd |

### jobs {#jobs}

Houdt verwerkingsjobs bij voor voortgangsrapportage en opschoning.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `type` | varchar | Identificatie van tool of pipeline |
| `status` | varchar | `queued`, `processing`, `completed` of `failed` |
| `progress` | real | Fractie van 0.0 tot 1.0 |
| `inputFiles` | jsonb | Array van invoerbestandspaden |
| `outputPath` | varchar | Pad naar het resultaatbestand |
| `settings` | jsonb | Gebruikte toolinstellingen |
| `error` | varchar | Foutmelding bij mislukken |
| `createdAt` | timestamp | Aanmaaktijd |
| `completedAt` | timestamp | Voltooiingstijd |

### settings {#settings}

Sleutel-waardeopslag voor serverbrede instellingen die beheerders in de interface kunnen wijzigen.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `key` | varchar | Primaire sleutel |
| `value` | varchar | Waarde van de instelling |
| `updatedAt` | timestamp | Tijd van laatste wijziging |

### roles {#roles}

Aangepaste rollen met fijnmazige rechten.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `name` | varchar | Unieke rolnaam |
| `description` | varchar | Optionele beschrijving |
| `permissions` | jsonb | Array van rechtenstrings |
| `createdAt` | timestamp | Aanmaaktijd |

### audit_log {#audit-log}

Log van beveiligingsrelevante acties.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `id` | uuid | Primaire sleutel |
| `userId` | uuid | FK naar users |
| `action` | varchar | Actietype |
| `details` | jsonb | Actiespecifieke gegevens |
| `createdAt` | timestamp | Tijdstip van de actie |

### user_preferences {#user-preferences}

UI-status per gebruiker, geïndexeerd op voorkeursnaam. Ondersteunt de vastgezette tools van het dashboard via `PUT /api/v1/preferences`.

| Kolom | Type | Opmerkingen |
|---|---|---|
| `userId` | text | FK naar users, cascade bij verwijderen. Primaire sleutel samen met `key` |
| `key` | text | Voorkeursnaam. Primaire sleutel samen met `userId` |
| `value` | jsonb | Inhoud van de voorkeur |
| `updatedAt` | timestamp | Laatste schrijfactie |

## Migraties {#migrations}

Drizzle beheert schemamigraties. Migratiebestanden staan in `apps/api/drizzle/`. Tijdens de ontwikkeling:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In productie worden openstaande migraties bij het opstarten automatisch toegepast.

## Rollen met minimale rechten {#least-privilege-roles}

Twee rollen, twee taken. `DATABASE_URL` handelt verzoeken af en heeft `SELECT`, `INSERT`, `UPDATE` en `DELETE` op de tabellen van de app, plus `USAGE` en `SELECT` op de bijbehorende sequences. Dat is de volledige lijst. De rol kan geen tabel aanmaken of verwijderen, geen extensie installeren, geen `TRUNCATE` uitvoeren, `pg_authid` niet lezen, geen database aanmaken, geen rol wijzigen en het schema `drizzle`, waar de migratiegeschiedenis staat, niet aanraken.

`DATABASE_MIGRATION_URL` is de bevoorrechte rol. Deze voert migraties uit en verleent rechten aan de runtimerol tijdens het opstarten, en wordt gesloten voordat één verzoek wordt afgehandeld.

De scheiding wordt geleverd met SnapOtter 2.3.0. Vanaf die release zijn de Compose-bestanden in de repository en de all-in-one-image zo ingericht, bestaande installaties inbegrepen: bij het opstarten maakt SnapOtter de runtimerol aan als die ontbreekt, verleent de rechten, migreert en past de rechten daarna toe op tabellen die er al waren. Voor het upgraden is geen handmatige SQL nodig.

De 2.2.0-image leest alleen de runtimeverbindingsreeks en maakt de tweede rol nooit aan. Geeft u hem de gesplitste configuratie, dan komt hij nooit op: het applicatielog toont dat wachtwoordauthenticatie voor die rol mislukt, en het Postgres-log meldt dat de rol niet bestaat. Upgrade de image naar 2.3.0 of later voordat u een Compose-bestand naar de gesplitste configuratie omzet.

Laat u `DATABASE_MIGRATION_URL` leeg, dan draait SnapOtter met één rol, waarbij `DATABASE_URL` beide taken uitvoert, precies zoals vóór de scheiding. Dat is een ondersteunde configuratie, geen verouderde. Het is het juiste antwoord op beheerde Postgres, waar het aanmaken van rollen vaak niet aan u is.

### Externe en beheerde Postgres {#external-and-managed-postgres}

Op RDS, Supabase, Cloud SQL of een cluster dat u zelf beheert, is de scheiding optioneel. Maak de runtimerol eenmalig aan:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Geef SnapOtter vervolgens beide verbindingsreeksen, gericht op dezelfde host, poort en database:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Daar houdt het op. SnapOtter past de rechten zelf toe en past ze na elke migratie opnieuw toe, zodat een tabel die in een toekomstige release wordt toegevoegd is gedekt zonder dat iemand er SQL voor hoeft uit te voeren.

De rol in `DATABASE_MIGRATION_URL` moet eigenaar zijn van de SnapOtter-tabellen, omdat alleen de eigenaar van een tabel er rechten op kan verlenen. Op een bestaande installatie is dat de rol waaronder u SnapOtter tot nu toe draait, niet een nieuwe rol die speciaal hiervoor is aangemaakt. Wijst u naar een nieuwe rol die niets bezit, dan mislukt het opstarten met een foutmelding die precies dit zegt. Ook heeft de rol `CREATEROLE` nodig om de runtimerol aan te maken en te onderhouden, en het recht om het schema `drizzle` aan te maken.

Gebruikt u dezelfde rol in beide URL's, dan is de scheiding uitgeschakeld en meldt SnapOtter dat in het log in plaats van te doen alsof. Biedt uw provider geen rol die zowel eigenaar van de tabellen kan zijn als `CREATEROLE` kan hebben, draai dan met één rol.

### Waarom het superuser-bit ongemoeid wordt gelaten {#why-the-superuser-bit-is-left-alone}

SnapOtter verwijdert nooit zelf `SUPERUSER` van een rol. Op een installatie die vóór de scheiding is gemaakt, is `snapotter` de enige superuser van het cluster, en degraderen zou het cluster zonder superuser achterlaten, alleen herstelbaar via de single-usermodus met de server gestopt. In plaats daarvan biedt het verplaatsen van de langlopende verbinding naar de beperkte rol de bescherming. De superuser staat slechts enkele seconden tijdens het opstarten op de lijn en is daarna weg.

Nieuwe all-in-one-installaties hebben dat probleem nooit. Ze krijgen drie rollen: `postgres` (bootstrap-superuser, afwezig in elke verbindingsreeks die SnapOtter gebruikt), `snapotter` (`NOSUPERUSER`, bezit de gegevens, verbindt alleen bij het opstarten) en `snapotter_app` (alleen rijen, handelt verzoeken af).

Om een oudere `snapotter` toch te degraderen, maakt u eerst een tweede superuser aan en logt u daarmee in om te bevestigen dat het werkt. Daarna `ALTER ROLE snapotter NOSUPERUSER`.

## Back-up en herstel {#backup-and-restore}

De relationele database staat in het volume `SnapOtter-pgdata` van de Postgres-container, niet in het volume `/data` van de app.

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

Beide commando's verbinden als `snapotter`, de eigenaar, en dat moet zo blijven. De runtimerol kan het schema `drizzle` niet zien, dus een dump die als die rol is gemaakt, zou onvolledig zijn. `--no-owner` laat herstelde objecten eigendom zijn van degene die het herstel uitvoert, dus uitvoeren als de eigenaar plaatst het eigendom waar de rechten het verwachten. Een kanttekening bij een nieuw cluster: `pg_dump` bevat de rechten maar niet de rollen die ze noemen, dus maak `snapotter_app` aan vóór het herstellen, anders stopt `--exit-on-error` bij de eerste `GRANT`. SnapOtter past de rechten bij de volgende start hoe dan ook opnieuw toe.

Deze databasedump bevat geen opgeslagen bibliotheekobjecten in `/data/files` en geen duurzame BullMQ-status in Redis. Maak daarvan een back-up en herstel ze met de gecoördineerde procedure in [Beveiliging en hardening](/ja/guide/security#backup-and-recovery).

**Koude volume-snapshot**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Kopieer een draaiende PostgreSQL-gegevensmap niet met `tar`. Compose voegt een projectvoorvoegsel toe aan volumenamen, dus bepaal de gemounte volume-ID's via `docker inspect` of uw opslagplatform in plaats van uit te gaan van het letterlijke label `SnapOtter-pgdata`.

### Migreren vanaf 1.x (SQLite) {#migrating-from-1-x-sqlite}

Upgraden vanaf SnapOtter 1.x heeft een eigen handleiding: zie [Upgraden van 1.x naar 2.0](./upgrading). Kort gezegd: hergebruik uw bestaande volume `/data` en 2.0 detecteert `/data/snapotter.db` automatisch en importeert het bij de eerste start (of stel `SQLITE_MIGRATE_PATH` in om er expliciet naar te verwijzen). Maak eerst een back-up van het hele volume `/data`, niet alleen van `snapotter.db`: 1.x gebruikt de WAL-modus van SQLite, dus een gestopte container laat vaak het grootste deel van zijn gegevens achter in `snapotter.db-wal` naast een bijna lege `snapotter.db`.
