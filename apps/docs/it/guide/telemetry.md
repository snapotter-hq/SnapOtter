---
description: "Quali dati di utilizzo anonimi raccoglie SnapOtter, quando vengono inviati e come disattivare le analisi di prodotto a livello di istanza."
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: d46b0e9f5f56
i18n_hash_version: 2
---

# Cosa raccoglie SnapOtter {#what-snapotter-collects}

Le analisi di prodotto anonime sono attive per impostazione predefinita e vengono impostate per l'intera istanza da un amministratore. Disattivale in Impostazioni > Sistema > Privacy.

## Eventi che inviamo (quando abilitati) {#events-we-send-when-enabled}

- tool_used: id dello strumento, stato, durata, categoria, se è uno strumento AI, un codice di errore in caso di fallimento.
- pipeline_executed: numero di passaggi, id degli strumenti, flag batch, numero di file, durata, stato.
- ai_bundle_action: id del bundle, azione, durata.
- Utilizzo del frontend: quali pagine degli strumenti vengono aperte, file aggiunti (solo conteggi), strumento avviato, download, salvataggi, ricerca (solo numero di risultati), elaborazione batch.
- Report sui crash: tipo di errore, un messaggio di errore oscurato (senza nomi di file, percorsi, email e valori tra virgolette), uno stack sorgente con i nomi base dei file e, per gli strumenti AI, un traceback Python con solo i nomi base dei file.

## Cosa non raccogliamo mai {#what-we-never-collect}

- Nomi o percorsi dei file
- Contenuti dei file
- Testo dell'output OCR
- Metadati delle immagini (EXIF)
- Testo estratto dai documenti
- La tua identità di account

Come qualsiasi server, PostHog vede l'indirizzo IP da cui arriva ogni richiesta. Il nostro progetto PostHog lo scarta invece di memorizzarlo, e gli eventi inviati dal server di SnapOtter stesso trasmettono un valore segnaposto al suo posto.

## Avvisi di aggiornamento {#update-notices}

Finché l'analisi è attiva, il server chiede a PostHog ogni qualche ora qual è la versione più recente di SnapOtter, usando l'ID anonimo dell'istanza e la sua versione. Quando esiste una versione più recente, gli amministratori vedono un avviso con un link alle note di rilascio. Se lo chiudi, resta nascosto fino alla versione successiva. Non viene installato né scaricato nulla al posto tuo e, con l'analisi disattivata, il server non lo chiede mai.

## Come disattivarle {#turning-it-off}

Admin: Impostazioni > Sistema > Privacy, disattiva "Analisi di prodotto anonime". Si interrompe immediatamente, a livello di istanza. Per compilare un'immagine che non può mai emettere dati, imposta il build arg `SNAPOTTER_ANALYTICS=off`.

Per avviare una nuova istanza con l'analisi già disattivata, aggiungi `SNAPOTTER_ANALYTICS_DEFAULT=off` all'ambiente del server prima del suo primo avvio. Con Docker Compose, inseriscilo sotto `environment:` del servizio dell'app, perché impostarlo solo in `.env` non lo fa arrivare al container.
