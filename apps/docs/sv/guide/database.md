---
description: "Databasschema, tabeller, migreringar och säkerhetskopieringsrutiner för PostgreSQL i SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 91f79dd431c6
i18n_hash_version: 2
---

# Databas {#database}

SnapOtter använder PostgreSQL 17 med [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) för datalagring. Schemat definieras i `apps/api/src/db/schema.ts`.

Anslutningen konfigureras via miljövariabeln `DATABASE_URL` (standard `postgres://snapotter:snapotter@postgres:5432/snapotter`). I Docker Compose lagrar Postgres-containern sin data i den namngivna volymen `SnapOtter-pgdata`. Förfrågningar betjänas av en roll som bara kan läsa och skriva rader, vilket beskrivs under [Roller med lägst behörighet](#least-privilege-roles) nedan.

## Tabeller {#tables}

### users {#users}

Lagrar användarkonton. Skapas automatiskt vid första körningen från `DEFAULT_USERNAME` och `DEFAULT_PASSWORD`.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `username` | varchar | Unik, obligatorisk |
| `passwordHash` | varchar | scrypt-hash |
| `role` | varchar | `admin`, `editor` eller `user` |
| `mustChangePassword` | boolean | Flagga för tvingad lösenordsåterställning |
| `createdAt` | timestamp | Skapandetid |
| `updatedAt` | timestamp | Tidpunkt för senaste uppdatering |

### sessions {#sessions}

Aktiva inloggningssessioner. Varje rad kopplar en sessionstoken till en användare.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | varchar | Primärnyckel (sessionstoken) |
| `userId` | uuid | Främmande nyckel till `users.id` |
| `expiresAt` | timestamp | Utgångstid |
| `createdAt` | timestamp | Skapandetid |

### teams {#teams}

Grupper för att organisera användare. Administratörer kan tilldela användare till team.

| Kolumn | Typ | Beskrivning |
|--------|------|-------------|
| `id` | uuid | Primärnyckel |
| `name` | varchar (unik, högst 50 tecken) | Teamnamn |
| `createdAt` | timestamp | Skapandetid |

### api_keys {#api-keys}

API-nycklar för programmatisk åtkomst. Den råa nyckeln visas en gång vid skapandet; bara hashen lagras.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `userId` | uuid | Främmande nyckel till `users.id` |
| `keyHash` | varchar | scrypt-hash av nyckeln |
| `name` | varchar | Etikett angiven av användaren |
| `createdAt` | timestamp | Skapandetid |
| `lastUsedAt` | timestamp | Uppdateras vid varje autentiserad förfrågan |

Nycklar har prefixet `si_` följt av 96 hexadecimala tecken (48 slumpmässiga byte).

### pipelines {#pipelines}

Sparade verktygskedjor som användare skapar i gränssnittet.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `name` | varchar | Pipelinens namn |
| `description` | varchar | Valfri beskrivning |
| `steps` | jsonb | Array av `{ toolId, settings }`-objekt |
| `createdAt` | timestamp | Skapandetid |

### user_files {#user-files}

Permanent filbibliotek. En sparad redigering infogas som en oberoende rotrad som standard ("spara som ny": `version` 1, `parentId` null, så originalet förblir listat), eller som en version länkad till föräldern när du skriver över originalet (`parentId` satt, `version` ökat, vilket ersätter det). Kolumnen `toolChain` registrerar vilka verktyg som tillämpats.

| Kolumn | Typ | Beskrivning |
|--------|------|-------------|
| `id` | uuid | Primärnyckel |
| `userId` | uuid | FK till users (CASCADE DELETE) |
| `originalName` | varchar | Ursprungligt filnamn vid uppladdning |
| `storedName` | varchar | Filnamn på disk |
| `mimeType` | varchar | MIME-typ |
| `size` | integer | Filstorlek i byte |
| `width` | integer | Bildbredd i px |
| `height` | integer | Bildhöjd i px |
| `version` | integer | Versionsnummer (1 = original) |
| `parentId` | uuid eller null | FK till user_files (föräldraversion) |
| `toolChain` | jsonb | Verktygs-ID:n som tillämpats i ordning för att skapa denna version |
| `createdAt` | timestamp | Skapandetid |

### jobs {#jobs}

Spårar bearbetningsjobb för förloppsrapportering och rensning.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `type` | varchar | Identifierare för verktyg eller pipeline |
| `status` | varchar | `queued`, `processing`, `completed` eller `failed` |
| `progress` | real | Bråkdel 0.0-1.0 |
| `inputFiles` | jsonb | Array av sökvägar till indatafiler |
| `outputPath` | varchar | Sökväg till resultatfilen |
| `settings` | jsonb | Verktygsinställningar som användes |
| `error` | varchar | Felmeddelande om jobbet misslyckades |
| `createdAt` | timestamp | Skapandetid |
| `completedAt` | timestamp | Slutförandetid |

### settings {#settings}

Nyckel-värde-lager för serverövergripande inställningar som administratörer kan ändra i gränssnittet.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `key` | varchar | Primärnyckel |
| `value` | varchar | Inställningens värde |
| `updatedAt` | timestamp | Tidpunkt för senaste uppdatering |

### roles {#roles}

Anpassade roller med detaljerade behörigheter.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `name` | varchar | Unikt rollnamn |
| `description` | varchar | Valfri beskrivning |
| `permissions` | jsonb | Array av behörighetssträngar |
| `createdAt` | timestamp | Skapandetid |

### audit_log {#audit-log}

Logg över säkerhetsrelevanta åtgärder.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `userId` | uuid | FK till users |
| `action` | varchar | Åtgärdstyp |
| `details` | jsonb | Åtgärdsspecifik data |
| `createdAt` | timestamp | Åtgärdens tidpunkt |

### user_preferences {#user-preferences}

Gränssnittstillstånd per användare, nyckelat på inställningsnamn. Ligger bakom översiktens fästa verktyg via `PUT /api/v1/preferences`.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `userId` | text | FK till users, kaskaderar vid radering. Primärnyckel tillsammans med `key` |
| `key` | text | Inställningsnamn. Primärnyckel tillsammans med `userId` |
| `value` | jsonb | Inställningens innehåll |
| `updatedAt` | timestamp | Senaste skrivning |

## Migreringar {#migrations}

Drizzle hanterar schemamigreringar. Migreringsfiler finns i `apps/api/drizzle/`. Under utveckling:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

I produktion tillämpas väntande migreringar automatiskt vid start.

## Roller med lägst behörighet {#least-privilege-roles}

Två roller, två uppgifter. `DATABASE_URL` betjänar förfrågningar och har `SELECT`, `INSERT`, `UPDATE`, `DELETE` på appens tabeller samt `USAGE` och `SELECT` på deras sekvenser. Det är hela listan. Den kan inte skapa eller ta bort en tabell, installera ett tillägg, `TRUNCATE`, läsa `pg_authid`, skapa en databas, ändra en roll eller röra schemat `drizzle` där migreringshistoriken finns.

`DATABASE_MIGRATION_URL` är den privilegierade. Den kör migreringar och ger behörigheter till körningsrollen under uppstart, och stängs sedan innan någon enda förfrågan betjänas.

Uppdelningen levereras i SnapOtter 2.3.0. Från den versionen är Compose-filerna i repot och all-in-one-avbilden kopplade på det här sättet, även befintliga installationer: vid uppstart skapar SnapOtter körningsrollen om den saknas, ger den behörigheter, migrerar och för sedan över behörigheterna till tabeller som redan fanns. Uppgradering kräver ingen manuell SQL.

Avbilden 2.2.0 läser bara anslutningssträngen för körning och skapar aldrig den andra rollen, så ger du den uppdelningen kommer den aldrig upp: appens logg visar att lösenordsautentiseringen misslyckas för den rollen, och Postgres-loggen säger att rollen inte finns. Uppgradera avbilden till 2.3.0 eller senare innan du byter en Compose-fil till uppdelningen.

Om du lämnar `DATABASE_MIGRATION_URL` tom körs en enda roll, där `DATABASE_URL` gör båda jobben precis som före uppdelningen. Det är en konfiguration som stöds, inte en föråldrad. Det är rätt svar på hanterad Postgres, där det ofta inte är du som får skapa roller.

### Extern och hanterad Postgres {#external-and-managed-postgres}

På RDS, Supabase, Cloud SQL eller något kluster du kör själv är uppdelningen frivillig. Skapa körningsrollen en gång:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Ge sedan SnapOtter båda anslutningssträngarna, riktade mot samma värd, port och databas:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Mer behövs inte. SnapOtter tillämpar behörigheterna själv och tillämpar dem på nytt efter varje migrering, så en tabell som läggs till i en framtida version täcks utan att någon kör SQL för den.

Rollen i `DATABASE_MIGRATION_URL` måste äga SnapOtters tabeller, eftersom bara en tabells ägare kan ge behörigheter på den. På en befintlig installation betyder det rollen som du har kört SnapOtter som, inte en ny som skapats för ändamålet. Peka den mot en ny roll som inte äger något och uppstarten misslyckas med ett fel som säger just detta. Den behöver också `CREATEROLE` för att skapa och underhålla körningsrollen, samt rätten att skapa schemat `drizzle`.

Ange samma roll i båda URL:erna och uppdelningen är av, och SnapOtter säger det i loggen i stället för att låtsas något annat. Om din leverantör inte ger någon roll som både kan äga tabellerna och ha `CREATEROLE`, kör med en enda roll.

### Varför superuser-biten lämnas orörd {#why-the-superuser-bit-is-left-alone}

SnapOtter tar aldrig själv bort `SUPERUSER` från en roll. På en installation som skapades före uppdelningen är `snapotter` klustrets enda superuser, och att nedgradera den skulle lämna klustret utan någon, återställningsbart bara via enanvändarläge med servern stoppad. Att flytta den långlivade anslutningen till den begränsade rollen är det som ger skyddet i stället. Superusern finns på ledningen under de få sekunderna av uppstarten och är sedan borta.

Nya all-in-one-installationer har aldrig det problemet. De får tre roller: `postgres` (superuser för bootstrap, frånvarande i varje anslutningssträng som SnapOtter använder), `snapotter` (`NOSUPERUSER`, äger datan, ansluter bara vid uppstart) och `snapotter_app` (bara rader, betjänar förfrågningar).

För att ändå nedgradera en äldre `snapotter`, skapa först en andra superuser och logga in som den för att bekräfta att den fungerar. Därefter `ALTER ROLE snapotter NOSUPERUSER`.

## Säkerhetskopiering och återställning {#backup-and-restore}

Relationsdatabasen finns i Postgres-containerns volym `SnapOtter-pgdata`, inte i appens volym `/data`.

**Logisk säkerhetskopia med validering (rekommenderas)**

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

Båda kommandona ansluter som `snapotter`, ägaren, och bör fortsätta göra det. Körningsrollen kan inte se schemat `drizzle`, så en dump tagen som den rollen skulle bli ofullständig. `--no-owner` lämnar återställda objekt ägda av den som kör återställningen, så att köra den som ägaren lägger ägandet där behörigheterna förväntar sig det. En hake på ett nytt kluster: `pg_dump` innehåller behörigheterna men inte de roller de namnger, så skapa `snapotter_app` före återställningen, annars stoppar `--exit-on-error` vid det första `GRANT`. SnapOtter tillämpar behörigheterna på nytt vid nästa uppstart oavsett.

Denna databasdump innehåller inte sparade biblioteksobjekt i `/data/files` eller beständigt BullMQ-tillstånd i Redis. Säkerhetskopiera och återställ dem med den samordnade proceduren i [Säkerhet och härdning](/sv/guide/security#backup-and-recovery).

**Kall volymögonblicksbild**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Kopiera inte en körande PostgreSQL-datakatalog med `tar`. Compose lägger projektprefix på volymnamn, så ta reda på de monterade volym-ID:na från `docker inspect` eller din lagringsplattform i stället för att anta den bokstavliga etiketten `SnapOtter-pgdata`.

### Migrering från 1.x (SQLite) {#migrating-from-1-x-sqlite}

Uppgradering från SnapOtter 1.x har en egen guide: se [Uppgradera från 1.x till 2.0](./upgrading). Kort sagt, återanvänd din befintliga volym `/data` så detekterar och importerar 2.0 `/data/snapotter.db` automatiskt vid första uppstarten (eller ange `SQLITE_MIGRATE_PATH` för att peka ut den uttryckligen). Säkerhetskopiera hela volymen `/data` först, inte bara `snapotter.db`: 1.x använder SQLite WAL-läge, så en stoppad container lämnar ofta det mesta av sin data i `snapotter.db-wal` bredvid en nästan tom `snapotter.db`.
