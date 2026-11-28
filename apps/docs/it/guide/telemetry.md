---
description: "Quali dati di utilizzo anonimi raccoglie SnapOtter, quando vengono inviati, che sono attivi per impostazione predefinita e come un amministratore disattiva le analisi di prodotto per l'intera istanza."
i18n_source_hash: 22d89115c8e5
i18n_provenance: machine
i18n_output_hash: 71d0d5e12537
i18n_hash_version: 2
---

# Cosa raccoglie SnapOtter {#what-snapotter-collects}

Anonymous Product Analytics è attivo per impostazione predefinita su ogni istanza, senza richiesta al primo avvio. Un amministratore può disattivarlo per l'intera istanza in Settings > System > Privacy, e questo interrompe tutto il traffico di analisi verso PostHog e Sentry.

Quando le analisi sono attive, SnapOtter invia a PostHog quali strumenti e pipeline vengono eseguiti, quanto durano, se vanno a buon fine, i codici di errore e il numero di file, insieme all'ID anonimo dell'istanza, alla sua versione, all'architettura della CPU, al sistema operativo, al tipo di installazione e alla presenza o meno di una GPU. Le segnalazioni di arresto anomalo vanno a Sentry senza nomi di file, percorsi, indirizzi e-mail e valori tra virgolette. Non invia mai i tuoi file, i loro nomi o percorsi, il loro contenuto, l'output dell'OCR o il testo estratto, i metadati delle immagini o l'identità del tuo account. PostHog e Sentry sono gli unici due destinatari, e con le analisi disattivate non viene inviato nulla a nessuno dei due.

## Eventi che inviamo (se attivo) {#events-we-send-when-enabled}

- tool_used: id dello strumento, stato, durata, categoria, se è uno strumento AI, un codice di errore in caso di fallimento e il nome del passaggio per uno strumento che segnala una fase a sé (il passaggio di analisi di Passport Photo).
- pipeline_executed: numero di passaggi, id degli strumenti, flag batch, numero di file, durata, stato.
- ai_bundle_action: id del bundle, azione (`install_started`, `installed`, `install_failed`, `uninstalled`, `reset_environment` o `imported`), durata e, se l'installazione non riesce, una categoria di errore da un elenco fisso (`oom`, `network`, `disk`, `checksum`, `cpu_unsupported`, `timeout` o `other`). L'output del programma di installazione, i percorsi e i messaggi di errore non vengono mai inviati.
- Utilizzo del frontend: quali pagine degli strumenti vengono aperte, file aggiunti (solo conteggi), strumento avviato, download, salvataggi, ricerca (solo numero di risultati), elaborazione batch.
- Report sui crash: tipo di errore, un messaggio di errore oscurato (senza nomi di file, percorsi, email e valori tra virgolette), uno stack sorgente con i nomi base dei file e, per gli strumenti AI, un traceback Python con solo i nomi base dei file.

## Cosa non raccogliamo mai {#what-we-never-collect}

- Nomi o percorsi dei file
- Contenuto dei file
- Testo prodotto dall'OCR
- Metadati delle immagini (EXIF)
- Testo estratto dai documenti
- L'identità del tuo account

PostHog vede l'indirizzo IP da cui proviene ogni richiesta, come qualsiasi server. Il nostro progetto PostHog lo scarta invece di memorizzarlo, e gli eventi del server di SnapOtter inviano un segnaposto al suo posto.

## Avvisi di aggiornamento {#update-notices}

Finché le analisi sono attive, il server chiede a PostHog ogni poche ore qual è la versione più recente di SnapOtter, usando l'ID anonimo dell'istanza e la sua versione. Quando esiste una versione più recente, gli amministratori vedono un avviso con un link alle note di rilascio. Se lo chiudi, resta nascosto fino alla versione successiva. Non viene installato né scaricato nulla al tuo posto e, con le analisi disattivate, il server non chiede mai nulla.

## Come disattivarlo {#turning-it-off}

Amministratori: Settings > System > Privacy, disattiva "Anonymous Product Analytics". L'invio si interrompe subito, per l'intera istanza, e non viene più inviato nulla a PostHog o Sentry. Per creare un'immagine che non possa mai inviare dati, imposta l'argomento di build `SNAPOTTER_ANALYTICS=off`. `SNAPOTTER_TELEMETRY=off` nell'ambiente del server ha lo stesso effetto in fase di esecuzione, senza ricompilare.

Per avviare una nuova istanza con le analisi già disattivate, aggiungi `SNAPOTTER_ANALYTICS_DEFAULT=off` all'ambiente del server prima del primo avvio. Con Docker Compose, inseriscilo sotto `environment:` del servizio dell'app, perché impostarlo solo in `.env` non raggiunge il container.
