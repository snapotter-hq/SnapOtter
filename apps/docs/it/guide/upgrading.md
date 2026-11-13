---
i18n_source_hash: 959cca5c298c
i18n_provenance: machine
i18n_output_hash: 00b55d8ab0a5
i18n_hash_version: 2
---
# Aggiornamento dalla 1.x alla 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x conservava tutto in un singolo file SQLite e girava come un unico container. SnapOtter 2.0 usa PostgreSQL e Redis. Questa guida spiega come migrare un'installazione 1.x alla 2.0 senza perdere dati.

In breve: riutilizzi il Suo volume `/data` esistente, e la 2.0 importa automaticamente il Suo database 1.x al primo avvio. Utenti, file salvati, impostazioni, chiavi API e pipeline vengono trasferiti. Il vecchio database non viene mai modificato, quindi è sempre possibile tornare indietro.

::: tip Una nota per i nostri utenti della 1.x
Molti di voi si fidano di SnapOtter fin dal primo giorno, e il vostro feedback ha dato forma a questa release. La 2.0 cambia molto sotto il cofano, e questa guida esiste perché il passaggio non Le faccia perdere nulla a cui tiene. I Suoi account, file, impostazioni, chiavi API e pipeline vengono trasferiti, e il vecchio database non viene mai toccato. Grazie per aver fatto l'aggiornamento con noi.
:::

## Prima di iniziare: esegua il backup dell'intero volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Lo faccia sempre per primo, ogni volta. Esegua il backup dell'**intero** volume `/data`, non solo del file `snapotter.db`.

Ecco perché è importante. La 1.x esegue SQLite in modalità WAL, quindi un container 1.x fermato lascia di norma la maggior parte dei dati confermati in `snapotter.db-wal` accanto a un `snapotter.db` quasi vuoto. Copiare solo `snapotter.db` cattura un database vuoto e perde silenziosamente tutto. Il volume contiene insieme `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` e la Sua directory `files/`, e devono viaggiare come un unico insieme.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Aggiorni prima alla 1.17.2 {#upgrade-to-1-17-2-first}

Aggiorni la Sua installazione 1.x all'ultima release 1.x (1.17.2) prima di passare alla 2.0. In questo modo la 1.x esegue le proprie migrazioni finali dello schema, e la 2.0 importa da uno schema noto e completo. Non è supportato l'aggiornamento diretto da una 1.x più vecchia alla 2.0.

## Verifichi il nome del Suo volume {#check-your-volume-name}

L'importatore vede i Suoi dati solo se lo stack 2.0 monta lo stesso volume usato dall'installazione 1.x. I nomi dei volumi Docker distinguono tra maiuscole e minuscole, e i vecchi snippet del README usavano `snapotter-data` in minuscolo mentre i file Compose usano `SnapOtter-data`. Verifichi quale ha:

```bash
docker volume ls | grep -i snapotter
```

Usi esattamente quel nome nella Sua configurazione 2.0.

## Percorso A: container singolo (il più rapido) {#path-a-single-container-quickest}

Se esegue SnapOtter con un singolo `docker run`, continui a farlo. La 2.0 avvia PostgreSQL e Redis incorporati all'interno del container quando non imposta `DATABASE_URL` o `REDIS_URL`, e rileva e importa automaticamente `/data/snapotter.db` al primo avvio.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Controlli nei log una riga simile a:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Tutto qui. Acceda con le Sue credenziali esistenti.

## Percorso B: Compose (consigliato per la produzione) {#path-b-compose-recommended-for-production}

Lo stack Compose 2.0 esegue tre servizi (app, Postgres, Redis). Riutilizzi il Suo volume `/data` 1.x per il servizio app. L'app rileva automaticamente `/data/snapotter.db` e lo importa in Postgres al primo avvio.

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

Se preferisce puntare esplicitamente al vecchio database, imposti `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Un percorso esplicito ha sempre la precedenza sul rilevamento automatico.

## Anteprima dell'importazione (facoltativa) {#preview-the-import-first-optional}

Per vedere esattamente cosa verrebbe importato senza scrivere nulla, esegua una prova a secco sul file del database:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Stampa il numero di righe per tabella, quanti file della libreria salvata ha trovato su disco e gli eventuali stati dei job che normalizzerà. Non richiede un Postgres in esecuzione.

## Cosa viene trasferito e cosa no {#what-carries-over-and-what-does-not}

Trasferiti:

- Gli utenti e la possibilità di accedere. Gli hash delle password restano invariati, quindi funzionano lo stesso nome utente e la stessa password.
- Team, impostazioni (inclusa l'identità della Sua istanza), ruoli, chiavi API (continuano a funzionare) e pipeline salvate.
- I record della cronologia dei job.
- La Sua libreria di file salvati, sia i record sia i file veri e propri, perché `/data/files` viene preservato sul volume.

Non trasferiti:

- Le sessioni di login. Tutti accedono una volta dopo l'aggiornamento. Le credenziali restano invariate, quindi basta un solo nuovo accesso, nient'altro.
- I file di input e output dei vecchi job di elaborazione. Risiedevano in un workspace temporaneo e per progetto non esistono più. I record della cronologia dei job restano.
- I flag di consenso alle analytics per singolo utente della 1.x, che non hanno equivalente nella 2.0 (nella 2.0 le analytics sono un'impostazione a livello di istanza).

## Disattivare l'importazione {#turning-the-import-off}

Se desidera deliberatamente un database nuovo anche se sul volume è presente un `snapotter.db`, imposti `SQLITE_MIGRATE_PATH=off`.

## Se nell'istanza 2.0 sono già presenti dati {#if-you-already-have-data-in-the-2-0-instance}

L'importatore viene eseguito solo su un database vuoto. Se ha avviato la 2.0 da zero (creando dati) e ha poi montato un vecchio `snapotter.db`, la 2.0 lo rileverà ma non lo importerà, perché l'unione di due dataset può provocare collisioni di ID. Vedrà un avviso nei log. Per importare i dati 1.x serve un'istanza vuota:

- Se l'istanza 2.0 contiene solo l'amministratore predefinito (non l'ha davvero usata), fermi lo stack, rimuova il volume Postgres (`SnapOtter-pgdata`) e riavvii con il vecchio `/data` presente. Verrà importato senza problemi. Questo cancella solo i dati Postgres usa e getta, non il Suo database 1.x.
- Se l'istanza 2.0 contiene dati reali che desidera conservare, i due dataset non possono essere uniti automaticamente. Esporti ciò che Le serve e importi i dati 1.x in una distribuzione nuova e separata.

## Tornare indietro {#rolling-back}

L'aggiornamento non modifica né elimina mai il Suo `snapotter.db` 1.x. Se deve tornare alla 1.x, ridistribuisca l'immagine 1.x sullo stesso volume. Tutto ciò che ha creato nella 2.0 dopo l'aggiornamento risiede in Postgres e non sarebbe nel database 1.x, quindi torni indietro tempestivamente se intende farlo.
