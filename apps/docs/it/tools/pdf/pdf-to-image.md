---
description: "Converti le pagine PDF in immagini di alta qualità."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: 50fa12b02faf
---

# PDF in immagine {#pdf-to-image}

Converti le pagine PDF in immagini raster di alta qualità. Supporta la selezione delle pagine, più formati di output, il controllo del DPI e le modalità colore. Include sotto-route di info e anteprima per ispezionare i PDF prima della conversione.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"png"` | Formato di output: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | No | 150 | Risoluzione di rendering (da 36 a 2400). Un DPI più alto produce immagini più grandi e dettagliate. |
| quality | number | No | 85 | Qualità di output per i formati con perdita (da 1 a 100) |
| colorMode | string | No | `"color"` | Modalità colore: `color`, `grayscale`, `bw` (soglia bianco e nero) |
| pages | string | No | `"all"` | Selezione delle pagine: `all`, pagina singola (`3`), intervallo (`1-5`), o separate da virgole (`1,3,5-8`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image \
  -F "file=@document.pdf" \
  -F 'settings={"format":"png","dpi":300,"pages":"1-3","colorMode":"color"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "pageCount": 10,
  "selectedPages": [1, 2, 3],
  "format": "png",
  "pages": [
    {
      "page": 1,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-1.png",
      "size": 234567
    },
    {
      "page": 2,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-2.png",
      "size": 198765
    },
    {
      "page": 3,
      "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/page-3.png",
      "size": 210456
    }
  ],
  "zipUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/pdf-pages.zip",
  "zipSize": 612345
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/info`

Restituisce il numero di pagine di un PDF senza renderizzare alcuna pagina.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/info \
  -F "file=@document.pdf"
```

### Info Response {#info-response}

```json
{
  "pageCount": 10
}
```

## Preview Sub-Route {#preview-sub-route}

`POST /api/v1/tools/pdf/pdf-to-image/preview`

Restituisce miniature JPEG a bassa risoluzione di tutte le pagine come data URL in base64. Utile per costruire un'interfaccia di selezione delle pagine.

### Preview Request {#preview-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-to-image/preview \
  -F "file=@document.pdf"
```

### Preview Response {#preview-response}

```json
{
  "pageCount": 10,
  "thumbnails": [
    {
      "page": 1,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    },
    {
      "page": 2,
      "dataUrl": "data:image/jpeg;base64,/9j/4AAQ...",
      "width": 300,
      "height": 424
    }
  ]
}
```

## Notes {#notes}

- Usa MuPDF per il rendering dei PDF, fornendo un output ad alta fedeltà con rendering corretto dei caratteri e grafica vettoriale.
- I PDF protetti da password non sono supportati e restituiranno un errore 400.
- Il parametro `pages` supporta una sintassi flessibile:
  - `"all"` o `""` - tutte le pagine
  - `"3"` - pagina singola
  - `"1-5"` - intervallo di pagine (inclusivo)
  - `"1,3,5-8"` - pagine singole e intervalli combinati
- I numeri di pagina partono da 1. Specificare pagine oltre la lunghezza del documento restituisce un errore 400.
- L'endpoint principale genera sempre sia i download delle singole pagine sia uno ZIP contenente tutte le pagine selezionate.
- L'endpoint di anteprima renderizza a 72 DPI e ridimensiona a 300px di larghezza per una generazione rapida delle miniature. Le miniature sono in JPEG al 60% di qualità.
- L'endpoint di anteprima rispetta la configurazione del server `MAX_PDF_PAGES`, limitando il numero di miniature generate.
- Per documenti di grandi dimensioni ad alto DPI, il tempo di elaborazione aumenta proporzionalmente. Considera l'uso di un DPI più basso (150) per l'uso web e di un DPI più alto (300-600) per la stampa.
