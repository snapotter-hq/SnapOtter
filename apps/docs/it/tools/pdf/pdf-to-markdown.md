---
description: "Converti un PDF in Markdown, mantenendo titoli, elenchi e tabelle dove il PDF li contiene."
i18n_source_hash: 93a7fdc45eae
i18n_provenance: machine
i18n_output_hash: 9195c2997c74
i18n_hash_version: 2
---

# PDF in Markdown {#pdf-to-markdown}

Trasforma un PDF in un file Markdown che puoi inserire in una wiki, in un sito statico o in una pipeline LLM.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-markdown`

Accetta dati di form multipart con un file PDF.

## Parameters {#parameters}

Questo strumento non ha parametri configurabili. Carica un PDF e ricevi un file `.md`.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-markdown \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/report.md",
  "originalSize": 520000,
  "processedSize": 14300,
  "chars": 14300
}
```

Un PDF di grandi dimensioni può richiedere più tempo della finestra sincrona. In tal caso l'API risponde `202` con un `jobId`, e puoi seguire l'avanzamento su `/api/v1/jobs/{jobId}/progress`.

## Cosa viene mantenuto {#what-gets-kept}

Un PDF memorizza testo posizionato, non struttura, quindi il convertitore la deduce:

- **Titoli.** Le righe brevi con dimensione nettamente maggiore del corpo del testo diventano titoli da `#` a `######`, ordinati per dimensione sull'intero documento.
- **Elenchi.** Le righe che iniziano con un punto elenco o un numero diventano voci di elenco.
- **Grassetto, corsivo e link.** Mantenuti nel testo. Sopravvivono solo i link `http`, `https` e `mailto`.
- **Tabelle.** Le tabelle disegnate con linee di riga diventano tabelle Markdown. Le tabelle impaginate solo con gli spazi di solito vengono rese come paragrafi semplici.

Le immagini vengono scartate. I layout a più colonne e i design di pagina insoliti sono gestiti al meglio possibile, quindi controlla il risultato prima di farci affidamento.

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Il campo `chars` nella risposta è la lunghezza dell'output Markdown.
- Un PDF scansionato non ha un livello di testo da convertire. Lo strumento lo rifiuta con `422` e il codice `NO_TEXT_LAYER` invece di restituire un file vuoto. Usa lo strumento [OCR PDF](./ocr-pdf) per questi file.
- Per il percorso inverso, [Markdown to PDF](../files/markdown-to-pdf), [Markdown to DOCX](../files/markdown-to-docx) e [Markdown to HTML](../files/markdown-to-html) leggono file `.md`.
