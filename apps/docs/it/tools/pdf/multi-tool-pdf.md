---
description: "Riordina, ruota, elimina pagine e prendi pagine da altri PDF in un editor o tramite l'API."
i18n_source_hash: 4eca29216d15
i18n_provenance: machine
i18n_output_hash: 5a8dc994bba5
i18n_hash_version: 2
---

# PDF Multi-Tool {#multi-tool-pdf}

Assembla un PDF da un piano di pagine esplicito: riordina, duplica, ruota o elimina pagine e prendi pagine da PDF aggiuntivi, tutto in un'unica richiesta.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/multi-tool-pdf`

Accetta dati di form multipart con uno o più file PDF e un campo JSON `settings`.
Sono supportati fino a 20 documenti di input e 1.200 pagine di output per richiesta.

## Parameters {#parameters}

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| items | array | Yes | Piano di pagine di output, in ordine di output. Ogni elemento è `{ "doc": <int>, "page": <int>, "rot": <90\|180\|270, optional> }`. `doc` indicizza i file caricati in ordine di caricamento (base 0); `page` è un numero di pagina base 1 in quel documento. |
| pageCounts | array | Yes | Numero reale di pagine di ogni documento caricato, nello stesso ordine. Una pagina del piano oltre il conteggio del suo documento viene rifiutata con 400. |

## Example Request {#example-request}

Prendi le pagine 3 e 1 del primo documento, poi le pagine 1 e 2 del secondo, ruotando la prima pagina di output di 90° in senso orario:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/multi-tool-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F "file=@extra.pdf" \
  -F 'settings={"items":[{"doc":0,"page":3,"rot":90},{"doc":0,"page":1},{"doc":1,"page":1},{"doc":1,"page":2}],"pageCounts":[3,2]}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document_multi-tool.pdf",
  "originalSize": 2450000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- La stessa pagina può apparire più volte in `items` per duplicarla.
- Le pagine assenti da `items` sono omesse dall'output.
- `rot` registra il nuovo orientamento di visualizzazione sulla pagina copiata (composto con qualsiasi rotazione esistente); il contenuto della pagina non viene modificato.
- La rotazione viene applicata per ogni copia di output, quindi i duplicati possono avere rotazioni diverse.
- L'output è un documento nuovo e piatto; segnalibri e metadati a livello di documento di origine non vengono conservati.
- L'elaborazione richiede il binario qpdf, incluso nell'immagine Docker ufficiale.
