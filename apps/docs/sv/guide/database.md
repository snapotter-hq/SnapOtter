---
description: "PostgreSQL-databasschema, tabeller, migrationer och säkerhetskopieringsprocedurer för SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: 0751b689f6eb
---

# Databas {#database}

SnapOtter använder PostgreSQL 17 med [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) för datapersistens. Schemat definieras i `apps/api/src/db/schema.ts`.

Anslutningen konfigureras via miljövariabeln `DATABASE_URL` (standard `postgres://snapotter:snapotter@postgres:5432/snapotter`). I Docker Compose lagrar Postgres-containern sina data i den namngivna volymen `SnapOtter-pgdata`.

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

Beständigt filbibliotek med spårning av versionskedjor. Varje bearbetningssteg som sparar ett resultat skapar en ny rad länkad till sin förälder via `parentId`, vilket bildar ett versionsträd.

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

## Migrationer {#migrations}

Drizzle sköter schemamigrationer. Migrationsfiler ligger i `apps/api/drizzle/`. Under utveckling:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

I produktion tillämpas väntande migrationer automatiskt vid uppstart.

## Säkerhetskopiering och återställning {#backup-and-restore}

Den relationella databasen ligger i Postgres-containerns `SnapOtter-pgdata`-volym, inte i appens `/data`-volym.

**Alternativ 1: pg_dump (rekommenderas)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Alternativ 2: Volymsnapshot**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migrera från 1.x (SQLite) {#migrating-from-1-x-sqlite}

Uppgradering från SnapOtter 1.x har sin egen guide: se [Uppgradera från 1.x till 2.0](./upgrading). Kort sagt, återanvänd din befintliga `/data`-volym så upptäcker och importerar 2.0 automatiskt `/data/snapotter.db` vid första uppstarten (eller ställ in `SQLITE_MIGRATE_PATH` för att peka på den explicit). Säkerhetskopiera hela `/data`-volymen först, inte bara `snapotter.db`: 1.x använder SQLite WAL-läge, så en stoppad container lämnar ofta det mesta av sina data i `snapotter.db-wal` bredvid en nästan tom `snapotter.db`.
