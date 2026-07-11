---
i18n_source_hash: 9a6abf3fc8ae
i18n_provenance: human
i18n_output_hash: a33def8aedc5
---
# Aggiornamento da 1.x a 2.0 {#upgrading-from-1-x-to-2-0}

SnapOtter 1.x memorizzava tutto in un unico file SQLite e girava come un singolo container. SnapOtter 2.0 usa PostgreSQL e Redis. Questa guida illustra come spostare un'installazione 1.x su 2.0 senza perdere dati.

In breve: riutilizza il tuo volume `/data` esistente e la 2.0 importa automaticamente il tuo database 1.x al primo avvio. I tuoi utenti, i file salvati, le impostazioni, le chiavi API e le pipeline vengono trasferiti. Il vecchio database non viene mai modificato, quindi puoi sempre tornare indietro.

::: tip Una nota per i nostri utenti 1.x
Molti di voi si fidano di SnapOtter fin dal primo giorno e il vostro feedback ha dato forma a questa release. La 2.0 cambia molto sotto il cofano, e questa guida esiste affinché il passaggio non vi costi nulla di ciò a cui tenete. I vostri account, i file, le impostazioni, le chiavi API e le pipeline vengono trasferiti, e il vostro vecchio database non viene mai toccato. Grazie per aver aggiornato con noi.
:::

## Prima di iniziare: fai il backup dell'intero volume `/data` {#before-you-start-back-up-the-whole-data-volume}

Fai questo per primo, ogni volta. Esegui il backup dell'**intero** volume `/data`, non solo del file `snapotter.db`.

Ecco perché è importante. La 1.x esegue SQLite in modalità WAL, quindi un container 1.x arrestato lascia abitualmente la maggior parte dei suoi dati confermati in `snapotter.db-wal` accanto a un `snapotter.db` quasi vuoto. Copiare solo `snapotter.db` acquisisce un database vuoto e perde silenziosamente tutto. Il volume contiene insieme `snapotter.db`, `snapotter.db-wal`, `snapotter.db-shm` e la tua directory `files/`, e devono viaggiare come un insieme.

```bash
# Adjust the volume name to match yours (see "Check your volume name" below).
docker run --rm -v SnapOtter-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/snapotter-1x-data.tgz -C /data .
```

## Aggiorna prima alla 1.17.2 {#upgrade-to-1-17-2-first}

Aggiorna la tua installazione 1.x all'ultima release 1.x (1.17.2) prima di passare alla 2.0. Questo consente alla 1.x di eseguire le proprie migrazioni finali dello schema, così la 2.0 importa da uno schema noto e completo. L'aggiornamento da una 1.x più vecchia direttamente alla 2.0 non è supportato.

## Verifica il nome del tuo volume {#check-your-volume-name}

L'importatore vede i tuoi dati solo se lo stack 2.0 monta lo stesso volume usato dalla tua installazione 1.x. I nomi dei volumi Docker distinguono maiuscole e minuscole, e i vecchi frammenti del README usavano un `snapotter-data` minuscolo mentre i file Compose usano `SnapOtter-data`. Verifica quale dei due hai:

```bash
docker volume ls | grep -i snapotter
```

Usa esattamente quel nome nella tua configurazione 2.0.

## Percorso A: container singolo (il più rapido) {#path-a-single-container-quickest}

Se esegui SnapOtter con un singolo `docker run`, continua a farlo. La 2.0 avvia un PostgreSQL e un Redis incorporati all'interno del container quando non imposti `DATABASE_URL` o `REDIS_URL`, e rileva e importa automaticamente `/data/snapotter.db` al primo avvio.

```bash
docker run -d --name snapotter -p 1349:1349 \
  -v SnapOtter-data:/data \
  snapotter/snapotter:latest
```

Controlla nei log una riga come:

```
Imported 1.x SQLite database: {"tables":{"users":2,"teams":1,...},"blobs":{"present":1,"missing":0}}
```

Tutto qui. Accedi con le tue credenziali esistenti.

## Percorso B: Compose (consigliato per la produzione) {#path-b-compose-recommended-for-production}

Lo stack Compose 2.0 esegue tre servizi (app, Postgres, Redis). Riutilizza il tuo volume `/data` della 1.x per il servizio app. L'app rileva automaticamente `/data/snapotter.db` e lo importa in Postgres al primo avvio.

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    volumes:
      - SnapOtter-data:/data          # your existing 1.x volume
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://:snapotter@redis:6379
    # ...
```

Se preferisci puntare esplicitamente al vecchio database, imposta `SQLITE_MIGRATE_PATH=/data/snapotter.db`. Un percorso esplicito ha sempre la precedenza sul rilevamento automatico.

## Anteprima dell'importazione (opzionale) {#preview-the-import-first-optional}

Per vedere esattamente cosa verrebbe importato senza scrivere nulla, esegui una prova a vuoto sul tuo file di database:

```bash
pnpm --filter @snapotter/api migrate:sqlite -- /path/to/snapotter.db --dry-run
```

Stampa il conteggio delle righe per tabella, quanti file della libreria salvata ha trovato su disco e gli eventuali stati dei job che normalizzerà. Non ha bisogno di un Postgres in esecuzione.

## Cosa viene trasferito e cosa no {#what-carries-over-and-what-does-not}

Trasferito:

- Utenti e la possibilità di accedere. Gli hash delle password sono invariati, quindi lo stesso nome utente e password funzionano.
- Team, impostazioni (inclusa l'identità della tua istanza), ruoli, chiavi API (continuano a funzionare) e pipeline salvate.
- Record della cronologia dei job.
- La tua libreria di file salvati, sia i record sia i file effettivi, perché `/data/files` è preservata sul volume.

Non trasferito:

- Le sessioni di accesso. Tutti effettuano l'accesso una volta dopo l'aggiornamento. Le credenziali sono invariate, quindi è un singolo nuovo accesso, niente di più.
- I file di input e output dei vecchi job di elaborazione. Risiedevano in uno spazio di lavoro temporaneo e sono scomparsi per progettazione. I record della cronologia dei job rimangono.
- I flag di consenso agli analytics per singolo utente della 1.x, che non hanno equivalente nella 2.0 (gli analytics della 2.0 sono un'impostazione a livello di istanza).

## Disattivare l'importazione {#turning-the-import-off}

Se vuoi deliberatamente un database nuovo anche se sul volume è presente un `snapotter.db`, imposta `SQLITE_MIGRATE_PATH=off`.

## Se hai già dei dati nell'istanza 2.0 {#if-you-already-have-data-in-the-2-0-instance}

L'importatore viene eseguito solo su un database vuoto. Se hai avviato la 2.0 da zero (creando dati) e in seguito hai montato un vecchio `snapotter.db`, la 2.0 lo rileverà ma non lo importerà, perché la fusione di due dataset può creare conflitti sugli ID. Vedrai un avviso nei log. Per importare i dati 1.x ti serve un'istanza vuota:

- Se l'istanza 2.0 contiene solo l'amministratore predefinito (non l'hai davvero usata), ferma lo stack, rimuovi il volume Postgres (`SnapOtter-pgdata`) e riavvia con il vecchio `/data` presente. L'importazione avverrà in modo pulito. Questo cancella solo i dati Postgres usa e getta, non il tuo database 1.x.
- Se l'istanza 2.0 contiene dati reali che vuoi conservare, i due dataset non possono essere uniti automaticamente. Esporta ciò che ti serve e importa i dati 1.x in una distribuzione separata e nuova.

## Tornare indietro {#rolling-back}

L'aggiornamento non modifica né elimina mai il tuo `snapotter.db` della 1.x. Se hai bisogno di tornare alla 1.x, ridistribuisci l'immagine 1.x sullo stesso volume. Tutto ciò che hai creato nella 2.0 dopo l'aggiornamento risiede in Postgres e non sarebbe presente nel database 1.x, quindi torna indietro tempestivamente se hai intenzione di farlo.
