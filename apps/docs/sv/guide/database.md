---
description: "PostgreSQL-databasschema, tabeller, migrationer och säkerhetskopieringsprocedurer för SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: a6882b6004eb
i18n_hash_version: 2
---

# Databas {#database}

SnapOtter använder PostgreSQL 17 med [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) för datapersistens. Schemat definieras i `apps/api/src/db/schema.ts`.

Anslutningen konfigureras via miljövariabeln `DATABASE_URL` (standard `postgres://snapotter:snapotter@postgres:5432/snapotter`). I Docker Compose lagrar Postgres-containern sina data i den namngivna volymen `SnapOtter-pgdata`. Förfrågningar betjänas via en roll som bara kan läsa och skriva rader, vilket beskrivs under [Roller med minsta möjliga behörighet](#least-privilege-roles) nedan.

## Tabeller {#tables}

### users {#users}

Lagrar användarkonton. Skapas automatiskt vid första körningen från `DEFAULT_USERNAME` och `DEFAULT_PASSWORD`.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `username` | varchar | Unik, obligatorisk |
| `passwordHash` | varchar | scrypt-hash |
| `role` | varchar | `admin`, `editor` eller `user` |
| `mustChangePassword` | boolean | Flagga för framtvingad lösenordsåterställning |
| `createdAt` | timestamp | Skapandetidpunkt |
| `updatedAt` | timestamp | Senaste uppdateringstidpunkt |

### sessions {#sessions}

Aktiva inloggningssessioner. Varje rad knyter en sessionstoken till en användare.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | varchar | Primärnyckel (sessionstoken) |
| `userId` | uuid | Främmande nyckel till `users.id` |
| `expiresAt` | timestamp | Utgångstidpunkt |
| `createdAt` | timestamp | Skapandetidpunkt |

### teams {#teams}

Grupper för att organisera användare. Administratörer kan tilldela användare till team.

| Kolumn | Typ | Beskrivning |
|--------|------|-------------|
| `id` | uuid | Primärnyckel |
| `name` | varchar (unik, max 50 tecken) | Teamnamn |
| `createdAt` | timestamp | Skapandetidpunkt |

### api_keys {#api-keys}

API-nycklar för programmatisk åtkomst. Den råa nyckeln visas en gång vid skapandet; endast hashen lagras.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `userId` | uuid | Främmande nyckel till `users.id` |
| `keyHash` | varchar | scrypt-hash av nyckeln |
| `name` | varchar | Användarangiven etikett |
| `createdAt` | timestamp | Skapandetidpunkt |
| `lastUsedAt` | timestamp | Uppdateras vid varje autentiserad begäran |

Nycklar prefixas med `si_` följt av 96 hex-tecken (48 slumpmässiga byte).

### pipelines {#pipelines}

Sparade verktygskedjor som användare skapar i användargränssnittet.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `name` | varchar | Pipeline-namn |
| `description` | varchar | Valfri beskrivning |
| `steps` | jsonb | Array av `{ toolId, settings }`-objekt |
| `createdAt` | timestamp | Skapandetidpunkt |

### user_files {#user-files}

Beständigt filbibliotek. En sparad ändring infogas som standard som en oberoende rotrad ("spara som ny": `version` 1, `parentId` null, så originalet ligger kvar i listan), eller som en förälderlänkad version när du skriver över originalet (`parentId` satt, `version` uppräknad, vilket ersätter det). Kolumnen `toolChain` registrerar vilka verktyg som tillämpades.

| Kolumn | Typ | Beskrivning |
|--------|------|-------------|
| `id` | uuid | Primärnyckel |
| `userId` | uuid | FK till users (CASCADE DELETE) |
| `originalName` | varchar | Ursprungligt uppladdningsfilnamn |
| `storedName` | varchar | Filnamn på disk |
| `mimeType` | varchar | MIME-typ |
| `size` | integer | Filstorlek i byte |
| `width` | integer | Bildbredd i px |
| `height` | integer | Bildhöjd i px |
| `version` | integer | Versionsnummer (1 = original) |
| `parentId` | uuid eller null | FK till user_files (förälderversion) |
| `toolChain` | jsonb | Verktygs-ID:n tillämpade i ordning för att producera den här versionen |
| `createdAt` | timestamp | Skapandetidpunkt |

### jobs {#jobs}

Spårar bearbetningsjobb för framstegsrapportering och rensning.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `type` | varchar | Identifierare för verktyg eller pipeline |
| `status` | varchar | `queued`, `processing`, `completed` eller `failed` |
| `progress` | real | 0.0-1.0 andel |
| `inputFiles` | jsonb | Array av sökvägar till indatafiler |
| `outputPath` | varchar | Sökväg till resultatfilen |
| `settings` | jsonb | Använda verktygsinställningar |
| `error` | varchar | Felmeddelande om det misslyckades |
| `createdAt` | timestamp | Skapandetidpunkt |
| `completedAt` | timestamp | Slutförandetidpunkt |

### settings {#settings}

Nyckel-värde-lager för serveromfattande inställningar som administratörer kan ändra från användargränssnittet.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `key` | varchar | Primärnyckel |
| `value` | varchar | Inställningsvärde |
| `updatedAt` | timestamp | Senaste uppdateringstidpunkt |

### roles {#roles}

Anpassade roller med granulära behörigheter.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `name` | varchar | Unikt rollnamn |
| `description` | varchar | Valfri beskrivning |
| `permissions` | jsonb | Array av behörighetssträngar |
| `createdAt` | timestamp | Skapandetidpunkt |

### audit_log {#audit-log}

Logg över säkerhetsrelevanta åtgärder.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `id` | uuid | Primärnyckel |
| `userId` | uuid | FK till users |
| `action` | varchar | Åtgärdstyp |
| `details` | jsonb | Åtgärdsspecifika data |
| `createdAt` | timestamp | Åtgärdstidpunkt |

### user_preferences {#user-preferences}

Gränssnittstillstånd per användare, nycklat på inställningens namn. Lagrar startsidans fästa verktyg, som skrivs via `PUT /api/v1/preferences`.

| Kolumn | Typ | Anmärkningar |
|---|---|---|
| `userId` | text | FK till users, kaskaderande borttagning. Primärnyckel tillsammans med `key` |
| `key` | text | Inställningens namn. Primärnyckel tillsammans med `userId` |
| `value` | jsonb | Inställningens innehåll |
| `updatedAt` | timestamp | Senaste skrivning |

## Migrationer {#migrations}

Drizzle sköter schemamigrationer. Migrationsfiler ligger i `apps/api/drizzle/`. Under utveckling:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

I produktion tillämpas väntande migrationer automatiskt vid uppstart.

## Roller med minsta möjliga behörighet {#least-privilege-roles}

Två roller, två uppgifter. `DATABASE_URL` betjänar förfrågningar och har `SELECT`, `INSERT`, `UPDATE`, `DELETE` på appens tabeller plus `USAGE` och `SELECT` på deras sekvenser. Det är hela listan. Den kan inte skapa eller ta bort en tabell, installera ett tillägg, köra `TRUNCATE`, läsa `pg_authid`, skapa en databas, ändra en roll eller röra schemat `drizzle` där migrationshistoriken ligger.

`DATABASE_MIGRATION_URL` är den privilegierade. Den kör migrationer och ger körningsrollen dess behörigheter under uppstarten, och stängs sedan innan en enda förfrågan har betjänats.

Compose och allt-i-ett-avbildningen är redan kopplade på det här sättet, befintliga installationer inräknade. Vid uppstart skapar SnapOtter körningsrollen om den saknas, ger den behörigheter, migrerar och lägger sedan ut behörigheterna på tabeller som redan fanns. Uppgraderingen kräver ingen manuell SQL.

Om du lämnar `DATABASE_MIGRATION_URL` tom körs allt med en enda roll, där `DATABASE_URL` sköter båda uppgifterna precis som före uppdelningen. Det är en konfiguration som stöds, inte en föråldrad. Det är rätt svar på hanterad Postgres, där det ofta inte är du som får skapa roller.

### Extern och hanterad Postgres {#external-and-managed-postgres}

På RDS, Supabase, Cloud SQL eller vilket kluster du än driver själv är uppdelningen frivillig. Skapa körningsrollen en gång:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Lämna sedan över båda anslutningssträngarna till SnapOtter, riktade mot samma värd, port och databas:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Stanna där. SnapOtter tillämpar behörigheterna själv och tillämpar dem på nytt efter varje migration, så en tabell som läggs till i en framtida version täcks in utan att någon behöver köra SQL för den.

Rollen i `DATABASE_MIGRATION_URL` måste äga SnapOtter-tabellerna, eftersom bara en tabells ägare kan ge behörigheter på den. I en befintlig installation betyder det den roll som du hittills har kört SnapOtter som, inte en ny roll skapad för ändamålet. Pekar du den mot en ny roll som inte äger något misslyckas uppstarten med ett fel som säger precis detta. Den behöver också `CREATEROLE` för att skapa och underhålla körningsrollen, samt rätten att skapa schemat `drizzle`.

Anger du samma roll i båda URL:erna är uppdelningen avstängd, och SnapOtter skriver det i loggen i stället för att låtsas om något annat. Om din leverantör inte ger dig någon roll som både kan äga tabellerna och ha `CREATEROLE`, kör med en enda roll.

### Varför superanvändarflaggan lämnas orörd {#why-the-superuser-bit-is-left-alone}

SnapOtter tar aldrig bort `SUPERUSER` från en roll på egen hand. I en installation som skapades före uppdelningen är `snapotter` klustrets enda superanvändare, och att degradera den skulle lämna klustret helt utan, något som bara går att rädda i enanvändarläge med servern stoppad. Det som ger skyddet i stället är att den långlivade anslutningen flyttas till den begränsade rollen. Superanvändaren är uppkopplad under uppstartens få sekunder och sedan borta.

Nya allt-i-ett-installationer har aldrig det problemet. De får tre roller: `postgres` (superanvändare för bootstrap, saknas i varje anslutningssträng som SnapOtter använder), `snapotter` (`NOSUPERUSER`, äger data, ansluter bara vid uppstart) och `snapotter_app` (bara rader, betjänar förfrågningar).

Vill du ändå degradera en äldre `snapotter`, skapa först en andra superanvändare och logga in som den för att bekräfta att den fungerar. Kör sedan `ALTER ROLE snapotter NOSUPERUSER`.

## Säkerhetskopiera och återställa {#backup-and-restore}

Relationsdatabasen finns i Postgres-behållarens `SnapOtter-pgdata`-volym, inte appens `/data`-volym.

**Logisk säkerhetskopiering med validering (rekommenderas)**

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

Båda kommandona ansluter som `snapotter`, ägaren, och bör fortsätta göra det. Körningsrollen kan inte se schemat `drizzle`, så en dump tagen som den rollen blir ofullständig. `--no-owner` gör att återställda objekt ägs av den som kör återställningen, så om du kör den som ägaren hamnar ägarskapet där behörigheterna förväntar sig det. En hake i ett nytt kluster: `pg_dump` tar med behörigheterna men inte rollerna de nämner, så skapa `snapotter_app` innan du återställer, annars stannar `--exit-on-error` vid första `GRANT`. SnapOtter tillämpar behörigheterna på nytt vid nästa uppstart oavsett.

Denna databasdump innehåller inte sparade biblioteksobjekt i `/data/files` eller hållbart BullMQ-tillstånd i Redis. Säkerhetskopiera och återställ dem med den samordnade proceduren i [Säkerhet och härdning](/sv/guide/security#backup-and-recovery).

**Önblicksbild av kall volym**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Kopiera inte en live PostgreSQL-datakatalog med `tar`. Komponera prefix volymnamn efter projekt, så lös de monterade volym-ID:n från `docker inspect` eller din lagringsplattform istället för att anta den bokstavliga etiketten `SnapOtter-pgdata`.

### Migrera från 1.x (SQLite) {#migrating-from-1-x-sqlite}

Uppgradering från SnapOtter 1.x har sin egen guide: se [Uppgradera från 1.x till 2.0](./upgrading). Kort sagt, återanvänd din befintliga `/data`-volym så upptäcker och importerar 2.0 automatiskt `/data/snapotter.db` vid första uppstarten (eller ställ in `SQLITE_MIGRATE_PATH` för att peka på den explicit). Säkerhetskopiera hela `/data`-volymen först, inte bara `snapotter.db`: 1.x använder SQLite WAL-läge, så en stoppad container lämnar ofta det mesta av sina data i `snapotter.db-wal` bredvid en nästan tom `snapotter.db`.
