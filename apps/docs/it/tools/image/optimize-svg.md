---
description: "Minimizza i file SVG con svgo e mantieni il risultato come SVG vettoriale, con controlli su precisione, passaggi multipli, metadati e formattazione."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: f08efca82cca
i18n_hash_version: 2
---

# Ottimizza SVG {#optimize-svg}

Riduci le dimensioni dei file SVG rimuovendo residui dell'editor, attributi ridondanti e cifre decimali in eccesso, poi scarica il risultato come SVG. A differenza di «Ottimizza per il web», l'output non viene mai rasterizzato.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Accetta dati di modulo multipart con un file `.svg` o `.svgz` e un campo JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| precision | number | No | `3` | Cifre decimali mantenute nei dati dei tracciati e nei numeri (da 0 a 8). Valori più bassi producono file più piccoli e curve leggermente meno fini. |
| multipass | boolean | No | `true` | Esegui l'ottimizzatore più volte finché l'output smette di ridursi |
| removeMetadata | boolean | No | `true` | Rimuovi commenti, `<metadata>`, `<desc>` e dati specifici dell'editor. Disattivalo per mantenerli. |
| pretty | boolean | No | `false` | Indenta l'output per renderlo leggibile invece di minimizzarlo su poche righe |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Notes {#notes}

- L'input deve essere un file SVG o SVGZ. Un'immagine raster viene rifiutata con `400` e il codice `IMAGE_UNDECODABLE`.
- L'input `.svgz` viene prima decompresso, e l'output è sempre un `.svg` semplice.
- L'SVG è limitato a 10 MB dopo la decompressione. Un file più grande viene rifiutato con `400` e il codice `SVG_TOO_LARGE`.
- `viewBox` e `<title>` vengono sempre mantenuti, così la grafica continua a scalare e conserva il suo nome accessibile.
- Input e output passano entrambi dal sanitizzatore SVG, che rimuove script e altri contenuti attivi.
- Abbassare `precision` è il risparmio maggiore per le grafiche ricche di tracciati. Controlla il risultato visivamente tra 0 e 2.
