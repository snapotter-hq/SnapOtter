---
description: "Schema del database PostgreSQL, tabelle, migrazioni e procedure di backup per SnapOtter."
i18n_source_hash: a68264552836
i18n_provenance: machine
i18n_output_hash: fdef77ac4a47
i18n_hash_version: 2
---

# Database {#database}

SnapOtter usa PostgreSQL 17 con [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) per la persistenza dei dati. Lo schema è definito in `apps/api/src/db/schema.ts`.

La connessione è configurata tramite la variabile d'ambiente `DATABASE_URL` (predefinita `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose, il container Postgres memorizza i suoi dati nel volume denominato `SnapOtter-pgdata`.

## Tabelle {#tables}

### users {#users}

Memorizza gli account utente. Creata automaticamente al primo avvio da `DEFAULT_USERNAME` e `DEFAULT_PASSWORD`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `username` | varchar | Univoco, obbligatorio |
| `passwordHash` | varchar | Hash scrypt |
| `role` | varchar | `admin`, `editor` o `user` |
| `mustChangePassword` | boolean | Flag di reimpostazione forzata della password |
| `createdAt` | timestamp | Data di creazione |
| `updatedAt` | timestamp | Data dell'ultimo aggiornamento |

### sessions {#sessions}

Sessioni di login attive. Ogni riga associa un token di sessione a un utente.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | varchar | Chiave primaria (token di sessione) |
| `userId` | uuid | Chiave esterna verso `users.id` |
| `expiresAt` | timestamp | Data di scadenza |
| `createdAt` | timestamp | Data di creazione |

### teams {#teams}

Gruppi per organizzare gli utenti. Gli amministratori possono assegnare gli utenti ai team.

| Colonna | Tipo | Descrizione |
|--------|------|-------------|
| `id` | uuid | Chiave primaria |
| `name` | varchar (univoco, max 50 caratteri) | Nome del team |
| `createdAt` | timestamp | Data di creazione |

### api_keys {#api-keys}

Chiavi API per l'accesso programmatico. La chiave grezza viene mostrata una sola volta alla creazione; viene memorizzato solo l'hash.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `userId` | uuid | Chiave esterna verso `users.id` |
| `keyHash` | varchar | Hash scrypt della chiave |
| `name` | varchar | Etichetta fornita dall'utente |
| `createdAt` | timestamp | Data di creazione |
| `lastUsedAt` | timestamp | Aggiornata a ogni richiesta autenticata |

Le chiavi hanno il prefisso `si_` seguito da 96 caratteri esadecimali (48 byte casuali).

### pipelines {#pipelines}

Catene di strumenti salvate che gli utenti creano nell'interfaccia.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `name` | varchar | Nome della pipeline |
| `description` | varchar | Descrizione facoltativa |
| `steps` | jsonb | Array di oggetti `{ toolId, settings }` |
| `createdAt` | timestamp | Data di creazione |

### user_files {#user-files}

Libreria di file persistente. Per impostazione predefinita, una modifica salvata viene inserita come riga radice indipendente ("salva come nuovo": `version` 1, `parentId` null, così l'originale resta elencato), oppure come versione collegata al genitore quando sovrascrivi l'originale (`parentId` impostato, `version` incrementata, sostituendolo). La colonna `toolChain` registra gli strumenti applicati.

| Colonna | Tipo | Descrizione |
|--------|------|-------------|
| `id` | uuid | Chiave primaria |
| `userId` | uuid | FK verso users (CASCADE DELETE) |
| `originalName` | varchar | Nome del file di caricamento originale |
| `storedName` | varchar | Nome del file su disco |
| `mimeType` | varchar | Tipo MIME |
| `size` | integer | Dimensione del file in byte |
| `width` | integer | Larghezza dell'immagine in px |
| `height` | integer | Altezza dell'immagine in px |
| `version` | integer | Numero di versione (1 = originale) |
| `parentId` | uuid o null | FK verso user_files (versione genitore) |
| `toolChain` | jsonb | ID degli strumenti applicati in ordine per produrre questa versione |
| `createdAt` | timestamp | Data di creazione |

### jobs {#jobs}

Traccia i job di elaborazione per la segnalazione dell'avanzamento e la pulizia.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `type` | varchar | Identificatore dello strumento o della pipeline |
| `status` | varchar | `queued`, `processing`, `completed` o `failed` |
| `progress` | real | Frazione 0.0-1.0 |
| `inputFiles` | jsonb | Array dei percorsi dei file di input |
| `outputPath` | varchar | Percorso del file risultato |
| `settings` | jsonb | Impostazioni dello strumento utilizzate |
| `error` | varchar | Messaggio di errore in caso di fallimento |
| `createdAt` | timestamp | Data di creazione |
| `completedAt` | timestamp | Data di completamento |

### settings {#settings}

Archivio chiave-valore per le impostazioni a livello di server che gli amministratori possono modificare dall'interfaccia.

| Colonna | Tipo | Note |
|---|---|---|
| `key` | varchar | Chiave primaria |
| `value` | varchar | Valore dell'impostazione |
| `updatedAt` | timestamp | Data dell'ultimo aggiornamento |

### roles {#roles}

Ruoli personalizzati con permessi granulari.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `name` | varchar | Nome univoco del ruolo |
| `description` | varchar | Descrizione facoltativa |
| `permissions` | jsonb | Array di stringhe di permesso |
| `createdAt` | timestamp | Data di creazione |

### audit_log {#audit-log}

Registro delle azioni rilevanti per la sicurezza.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `userId` | uuid | FK verso users |
| `action` | varchar | Tipo di azione |
| `details` | jsonb | Dati specifici dell'azione |
| `createdAt` | timestamp | Data dell'azione |

### user_preferences {#user-preferences}

Stato dell'interfaccia per singolo utente, indicizzato per nome della preferenza. Conserva gli strumenti fissati della pagina iniziale, scritti tramite `PUT /api/v1/preferences`.

| Colonna | Tipo | Note |
|---|---|---|
| `userId` | text | FK verso users, con eliminazione a cascata. Chiave primaria insieme a `key` |
| `key` | text | Nome della preferenza. Chiave primaria insieme a `userId` |
| `value` | jsonb | Contenuto della preferenza |
| `updatedAt` | timestamp | Ultima scrittura |

## Migrazioni {#migrations}

Drizzle gestisce le migrazioni dello schema. I file di migrazione risiedono in `apps/api/drizzle/`. Durante lo sviluppo:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In produzione, le migrazioni in sospeso vengono applicate automaticamente all'avvio.

## Backup e ripristino {#backup-and-restore}

Il database relazionale si trova nel volume `SnapOtter-pgdata` del contenitore Postgres, non nel volume `/data` dell'app.

**Backup logico con convalida (consigliato)**

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

Questo dump del database non contiene oggetti di libreria salvati in `/data/files` o lo stato BullMQ durevole in Redis. Effettuare il backup e il ripristino di quelli con la procedura coordinata in [Sicurezza e rafforzamento](/it/guide/security#backup-and-recovery).

**Istantanea del volume freddo**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Non copiare una directory di dati PostgreSQL live con `tar`. Componi i prefissi dei nomi dei volumi in base al progetto, quindi risolvi gli ID dei volumi montati da `docker inspect` o dalla tua piattaforma di archiviazione anziché assumere l'etichetta letterale `SnapOtter-pgdata`.

### Migrazione dalla 1.x (SQLite) {#migrating-from-1-x-sqlite}

L'aggiornamento da SnapOtter 1.x ha una guida dedicata: vedi [Aggiornamento dalla 1.x alla 2.0](./upgrading). In breve, riutilizza il tuo volume `/data` esistente e la 2.0 rileva e importa automaticamente `/data/snapotter.db` al primo avvio (oppure imposta `SQLITE_MIGRATE_PATH` per puntarvi esplicitamente). Esegui prima il backup dell'intero volume `/data`, non solo di `snapotter.db`: la 1.x usa la modalità WAL di SQLite, quindi un container arrestato lascia spesso la maggior parte dei suoi dati in `snapotter.db-wal` accanto a un `snapotter.db` quasi vuoto.
