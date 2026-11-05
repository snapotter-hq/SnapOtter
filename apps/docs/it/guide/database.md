---
description: "Schema del database PostgreSQL, tabelle, migrazioni e procedure di backup per SnapOtter."
i18n_source_hash: 2150213f21da
i18n_provenance: machine
i18n_output_hash: 44948d8e5a29
i18n_hash_version: 2
---

# Database {#database}

SnapOtter usa PostgreSQL 17 con [Drizzle ORM](https://orm.drizzle.team/) (pg-core / node-postgres) per la persistenza dei dati. Lo schema è definito in `apps/api/src/db/schema.ts`.

La connessione si configura tramite la variabile d'ambiente `DATABASE_URL` (valore predefinito `postgres://snapotter:snapotter@postgres:5432/snapotter`). In Docker Compose, il container Postgres salva i dati nel volume con nome `SnapOtter-pgdata`. Le richieste vengono servite con un ruolo che può solo leggere e scrivere righe, come descritto più sotto in [Ruoli a privilegi minimi](#least-privilege-roles).

## Tabelle {#tables}

### users {#users}

Memorizza gli account utente. Creati automaticamente al primo avvio a partire da `DEFAULT_USERNAME` e `DEFAULT_PASSWORD`.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `username` | varchar | Univoco, obbligatorio |
| `passwordHash` | varchar | Hash scrypt |
| `role` | varchar | `admin`, `editor` oppure `user` |
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

Chiavi API per l'accesso programmatico. La chiave in chiaro viene mostrata una sola volta alla creazione; viene memorizzato solo l'hash.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `userId` | uuid | Chiave esterna verso `users.id` |
| `keyHash` | varchar | Hash scrypt della chiave |
| `name` | varchar | Etichetta indicata dall'utente |
| `createdAt` | timestamp | Data di creazione |
| `lastUsedAt` | timestamp | Aggiornato a ogni richiesta autenticata |

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

Libreria di file persistente. Una modifica salvata viene inserita per impostazione predefinita come riga radice indipendente ("salva come nuovo": `version` 1, `parentId` null, così l'originale resta nell'elenco), oppure come versione collegata al genitore quando sovrascrive l'originale (`parentId` impostato, `version` incrementato, con sostituzione dell'originale). La colonna `toolChain` registra gli strumenti applicati.

| Colonna | Tipo | Descrizione |
|--------|------|-------------|
| `id` | uuid | Chiave primaria |
| `userId` | uuid | FK verso users (CASCADE DELETE) |
| `originalName` | varchar | Nome del file originale caricato |
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

Tiene traccia dei job di elaborazione per la segnalazione dell'avanzamento e la pulizia.

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | Chiave primaria |
| `type` | varchar | Identificativo dello strumento o della pipeline |
| `status` | varchar | `queued`, `processing`, `completed` oppure `failed` |
| `progress` | real | Frazione da 0.0 a 1.0 |
| `inputFiles` | jsonb | Array dei percorsi dei file di input |
| `outputPath` | varchar | Percorso del file risultato |
| `settings` | jsonb | Impostazioni dello strumento usate |
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
| `createdAt` | timestamp | Ora dell'azione |

### user_preferences {#user-preferences}

Stato dell'interfaccia per singolo utente, indicizzato per nome della preferenza. Alimenta gli strumenti aggiunti ai preferiti della dashboard tramite `PUT /api/v1/preferences`.

| Colonna | Tipo | Note |
|---|---|---|
| `userId` | text | FK verso users, eliminazione a cascata. Chiave primaria insieme a `key` |
| `key` | text | Nome della preferenza. Chiave primaria insieme a `userId` |
| `value` | jsonb | Contenuto della preferenza |
| `updatedAt` | timestamp | Ultima scrittura |

## Migrazioni {#migrations}

Drizzle gestisce le migrazioni dello schema. I file di migrazione si trovano in `apps/api/drizzle/`. Durante lo sviluppo:

```bash
cd apps/api
npx drizzle-kit generate   # generate a migration from schema changes
npx drizzle-kit migrate    # apply pending migrations
```

In produzione, le migrazioni in sospeso vengono applicate automaticamente all'avvio.

## Ruoli a privilegi minimi {#least-privilege-roles}

Due ruoli, due compiti. `DATABASE_URL` serve le richieste e dispone di `SELECT`, `INSERT`, `UPDATE`, `DELETE` sulle tabelle dell'app, più `USAGE` e `SELECT` sulle relative sequenze. Questo è l'elenco completo. Non può creare o eliminare una tabella, installare un'estensione, `TRUNCATE`, leggere `pg_authid`, creare un database, modificare un ruolo, né toccare lo schema `drizzle` in cui risiede la cronologia delle migrazioni.

`DATABASE_MIGRATION_URL` è il ruolo privilegiato. Esegue le migrazioni e concede i privilegi al ruolo di runtime durante l'avvio, poi si chiude prima che venga servita una sola richiesta.

La separazione è disponibile con SnapOtter 2.3.0. Da quella versione i file Compose nel repository e l'immagine all-in-one sono configurati in questo modo, comprese le installazioni esistenti: all'avvio SnapOtter crea il ruolo di runtime se manca, gli concede i privilegi, esegue le migrazioni, poi estende i privilegi alle tabelle già presenti. L'aggiornamento non richiede alcun SQL manuale.

L'immagine 2.2.0 legge solo la stringa di connessione di runtime e non crea mai il secondo ruolo, quindi se le fornisce la configurazione separata non si avvia mai: il log dell'app mostra l'autenticazione con password non riuscita per quel ruolo, e il log di Postgres dice che il ruolo non esiste. Aggiorni l'immagine alla 2.3.0 o successiva prima di passare un file Compose alla configurazione separata.

Lasciando `DATABASE_MIGRATION_URL` vuoto, si funziona con un solo ruolo, e `DATABASE_URL` svolge entrambi i compiti esattamente come prima della separazione. È una configurazione supportata, non deprecata. È la scelta giusta su Postgres gestito, dove creare ruoli spesso non è nelle Sue possibilità.

### Postgres esterno e gestito {#external-and-managed-postgres}

Su RDS, Supabase, Cloud SQL o qualsiasi cluster gestito da Lei, la separazione è facoltativa. Crei il ruolo di runtime una volta sola:

```sql
CREATE ROLE snapotter_app LOGIN PASSWORD 'choose-a-strong-password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
```

Poi fornisca a SnapOtter entrambe le stringhe di connessione, puntate allo stesso host, porta e database:

```bash
DATABASE_URL=postgres://snapotter_app:choose-a-strong-password@db.example.com:5432/snapotter
DATABASE_MIGRATION_URL=postgres://snapotter:the-owner-password@db.example.com:5432/snapotter
```

Si fermi qui. SnapOtter applica da sé i privilegi e li riapplica dopo ogni migrazione, quindi una tabella aggiunta da una versione futura è coperta senza che nessuno debba eseguire SQL.

Il ruolo in `DATABASE_MIGRATION_URL` deve essere il proprietario delle tabelle di SnapOtter, perché solo il proprietario di una tabella può concedere privilegi su di essa. In un'installazione esistente significa il ruolo con cui ha finora eseguito SnapOtter, non uno nuovo creato allo scopo. Se lo punta a un ruolo nuovo che non possiede nulla, l'avvio fallisce con un errore che dice esattamente questo. Serve anche `CREATEROLE` per creare e mantenere il ruolo di runtime, e il diritto di creare lo schema `drizzle`.

Se indica lo stesso ruolo in entrambi gli URL, la separazione è disattivata e SnapOtter lo segnala nel log invece di far finta di niente. Se il Suo provider non offre alcun ruolo che possa sia possedere le tabelle sia avere `CREATEROLE`, usi un solo ruolo.

### Perché il bit di superuser non viene toccato {#why-the-superuser-bit-is-left-alone}

SnapOtter non rimuove mai da sé `SUPERUSER` a un ruolo. In un'installazione creata prima della separazione, `snapotter` è l'unico superuser del cluster, e declassarlo lascerebbe il cluster senza nessuno, con un ripristino possibile solo tramite la modalità single-user a server fermo. La protezione si ottiene invece spostando la connessione di lunga durata sul ruolo ristretto. Il superuser è presente sulla connessione per i pochi secondi dell'avvio e poi scompare.

Le nuove installazioni all-in-one non hanno mai questo problema. Ottengono tre ruoli: `postgres` (superuser di bootstrap, assente da ogni stringa di connessione usata da SnapOtter), `snapotter` (`NOSUPERUSER`, possiede i dati, si connette solo all'avvio) e `snapotter_app` (solo righe, serve le richieste).

Per declassare comunque un `snapotter` più vecchio, crei prima un secondo superuser e acceda con esso per verificare che funzioni. Poi `ALTER ROLE snapotter NOSUPERUSER`.

## Backup e ripristino {#backup-and-restore}

Il database relazionale risiede nel volume `SnapOtter-pgdata` del container Postgres, non nel volume `/data` dell'app.

**Backup logico con validazione (consigliato)**

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

Entrambi i comandi si connettono come `snapotter`, il proprietario, e dovrebbero continuare a farlo. Il ruolo di runtime non vede lo schema `drizzle`, quindi un dump eseguito con quel ruolo risulterebbe incompleto. `--no-owner` lascia gli oggetti ripristinati di proprietà di chi esegue il ripristino, quindi eseguirlo come proprietario colloca la proprietà dove i privilegi se la aspettano. Un'avvertenza su un cluster nuovo: `pg_dump` contiene i privilegi ma non i ruoli a cui si riferiscono, quindi crei `snapotter_app` prima del ripristino, altrimenti `--exit-on-error` si ferma al primo `GRANT`. SnapOtter riapplica comunque i privilegi al successivo avvio.

Questo dump del database non contiene gli oggetti di libreria salvati in `/data/files` né lo stato durevole di BullMQ in Redis. Ne faccia il backup e il ripristino con la procedura coordinata descritta in [Sicurezza e hardening](/it/guide/security#backup-and-recovery).

**Snapshot del volume a freddo**

```bash
# Stop every service first, then use your storage platform to snapshot the
# PostgreSQL, app-data, and Redis volumes as one crash-consistent set.
docker compose -f docker/docker-compose.yml stop
```

Non copi una directory dati di PostgreSQL in funzione con `tar`. Compose antepone il nome del progetto ai nomi dei volumi, quindi ricavi gli ID dei volumi montati da `docker inspect` o dalla Sua piattaforma di storage invece di dare per scontata l'etichetta letterale `SnapOtter-pgdata`.

### Migrazione dalla 1.x (SQLite) {#migrating-from-1-x-sqlite}

L'aggiornamento da SnapOtter 1.x ha una guida dedicata: vedere [Aggiornamento dalla 1.x alla 2.0](./upgrading). In breve, riutilizzi il Suo volume `/data` esistente e la 2.0 rileva e importa automaticamente `/data/snapotter.db` al primo avvio (oppure imposti `SQLITE_MIGRATE_PATH` per indicarlo esplicitamente). Faccia prima il backup dell'intero volume `/data`, non solo di `snapotter.db`: la 1.x usa SQLite in modalità WAL, quindi un container fermo spesso lascia la maggior parte dei dati in `snapotter.db-wal` accanto a un `snapotter.db` quasi vuoto.
