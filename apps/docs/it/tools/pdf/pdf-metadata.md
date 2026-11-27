---
description: "Leggi e scrivi i metadati di un documento PDF."
i18n_source_hash: 11de4f7991e4
i18n_provenance: machine
i18n_output_hash: 33b7e1b62f73
i18n_hash_version: 2
---

# Metadati PDF {#pdf-metadata}

Leggi e aggiorna i campi dei metadati di un documento PDF come titolo, autore, oggetto e parole chiave, oppure rimuovi del tutto i metadati del documento. Quando non vengono fornite impostazioni, i metadati esistenti vengono restituiti senza modifiche.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-metadata`

Accetta dati di form multipart con un file PDF e un campo JSON opzionale `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | No | - | Titolo del documento (max 500 caratteri) |
| author | string | No | - | Autore del documento (max 500 caratteri) |
| subject | string | No | - | Oggetto del documento (max 500 caratteri) |
| keywords | string | No | - | Parole chiave del documento (max 500 caratteri) |
| stripAll | boolean | No | false | Rimuove l'intero dizionario Info (date, Creator, Producer, chiavi personalizzate), ogni stream XMP (documento, pagine, immagini) e tutti i dati applicativi PieceInfo, poi scrive i campi eventualmente indicati sopra |
| removeAttachments | boolean | No | false | Rimuove anche i file incorporati: l'elenco degli allegati del documento, le annotazioni di file allegato e i file associati (`/AF`). Richiede `stripAll` |

Tutti i parametri sono opzionali. I campi omessi restano invariati, a meno che non sia impostato `stripAll`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F 'settings={"title": "Q2 Report", "author": "Finance Team"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.pdf",
  "originalSize": 245000,
  "processedSize": 245200,
  "metadata": {
    "title": "Q2 Report",
    "author": "Finance Team",
    "subject": "",
    "keywords": ""
  }
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Questo è uno strumento veloce (sincrono) che restituisce direttamente il risultato.
- Il campo `metadata` nella risposta contiene i metadati risultanti dopo eventuali aggiornamenti.
- Per leggere i metadati senza modificarli, ometti il campo `settings` o invia un oggetto vuoto.
- Ogni campo dei metadati è limitato a 500 caratteri.
- Con `stripAll`, la risposta contiene anche `stripped`: le chiavi Info rimosse (`removed`), se lo stream XMP del documento è stato rimosso (`xmpRemoved`), il livello PDF/A dichiarato dall'input (`pdfa`, oppure `null`), quanti stream XMP sono stati tolti da pagine, immagini e altri oggetti (`objectXmpRemoved`), quanti dizionari PieceInfo sono stati rimossi (`pieceInfoRemoved`) e quanti file incorporati sono stati rimossi (`attachmentsRemoved`, sempre `0` senza `removeAttachments`). Rimuovere l'XMP compromette la conformità PDF/A.
- `stripAll` da solo mantiene gli allegati dei file incorporati, perché rimuoverli cambia il contenuto del documento. Aggiungi `removeAttachments` per eliminare anche quelli. Questo rimuove l'XML allegato dalle e-fatture ZUGFeRD e Factur-X e compromette la conformità PDF/A-3.
- Inviare `removeAttachments` senza `stripAll` restituisce 400.
