---
description: "Quali dati di utilizzo anonimi raccoglie SnapOtter, quando vengono inviati e come disattivare le analisi di prodotto a livello di istanza."
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: c04dcf2bd071
---

# Cosa raccoglie SnapOtter {#what-snapotter-collects}

Le analisi di prodotto anonime sono attive per impostazione predefinita e vengono impostate per l'intera istanza da un amministratore. Disattivale in Impostazioni > Sistema > Privacy.

## Eventi che inviamo (quando abilitati) {#events-we-send-when-enabled}

- tool_used: id dello strumento, stato, durata, categoria, se è uno strumento AI, un codice di errore in caso di fallimento.
- pipeline_executed: numero di passaggi, id degli strumenti, flag batch, numero di file, durata, stato.
- ai_bundle_action: id del bundle, azione, durata.
- Utilizzo del frontend: quali pagine degli strumenti vengono aperte, file aggiunti (solo conteggi), strumento avviato, download, salvataggi, ricerca (solo numero di risultati), elaborazione batch.
- Report sui crash: tipo di errore e uno stack sorgente con solo i nomi base dei file.

## Cosa non raccogliamo mai {#what-we-never-collect}

- Nomi o percorsi dei file
- Contenuti dei file
- Testo dell'output OCR
- Metadati delle immagini (EXIF)
- Testo estratto dai documenti
- Il tuo indirizzo IP o la tua identità di account

## Come disattivarle {#turning-it-off}

Admin: Impostazioni > Sistema > Privacy, disattiva "Analisi di prodotto anonime". Si interrompe immediatamente, a livello di istanza. Per compilare un'immagine che non può mai emettere dati, imposta il build arg `SNAPOTTER_ANALYTICS=off`.
