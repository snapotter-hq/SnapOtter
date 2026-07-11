---
description: "PostgreSQL-databaseschema, tabellen, migraties en back-upprocedures voor SnapOtter."
i18n_source_hash: b37398ae91a3
i18n_provenance: human
i18n_output_hash: e283a792e124
---

# Database {#database}

SnapOtter gebruikt PostgreSQL 17 met [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) voor gegevensopslag. Het schema is gedefinieerd in `apps/api/src/db/schema.ts`.

De verbinding wordt geconfigureerd via de omgevingsvariabele `DATABASE_URL` (standaard `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose slaat de Postgres-container zijn gegevens op in het benoemde volume `SnapOtter-pgdata`.

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

Persistente bestandsbibliotheek met versieketentracering. Elke verwerkingsstap die een resultaat opslaat, maakt een nieuwe rij aan die via `parentId` aan de bovenliggende rij wordt gekoppeld, wat een versieboom vormt.

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

## Migraties {#migrations}

Drizzle verzorgt schemamigraties. Migratiebestanden staan in `apps/api/drizzle/`. Tijdens ontwikkeling:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In productie worden openstaande migraties automatisch toegepast bij het opstarten.

## Back-up en herstel {#backup-and-restore}

De relationele database bevindt zich in het `SnapOtter-pgdata`-volume van de Postgres-container, niet in het `/data`-volume van de app.

**Optie 1: pg_dump (aanbevolen)**

```bash
# Dump the database while the stack is running
docker exec SnapOtter-postgres pg_dump -U snapotter snapotter > backup.sql

# Restore into a fresh database
cat backup.sql | docker exec -i SnapOtter-postgres psql -U snapotter snapotter
```

**Optie 2: Volume-snapshot**

```bash
# Stop the stack, then snapshot the pgdata volume
docker compose down
docker run --rm -v SnapOtter-pgdata:/data -v $(pwd)/backup:/backup \
  alpine tar czf /backup/snapotter-pgdata.tar.gz -C /data .
```

### Migreren vanaf 1.x (SQLite) {#migrating-from-1-x-sqlite}

Upgraden vanaf SnapOtter 1.x heeft een eigen gids: zie [Upgraden van 1.x naar 2.0](./upgrading). Kort gezegd: hergebruik je bestaande `/data`-volume, en 2.0 detecteert en importeert `/data/snapotter.db` automatisch bij de eerste keer opstarten (of stel `SQLITE_MIGRATE_PATH` in om er expliciet naar te verwijzen). Maak eerst een back-up van het volledige `/data`-volume, niet alleen van `snapotter.db`: 1.x gebruikt de SQLite WAL-modus, dus een gestopte container laat vaak het grootste deel van zijn gegevens in `snapotter.db-wal` staan naast een bijna leeg `snapotter.db`.
