---
description: "Converteer PDF-pagina's naar hoogwaardige afbeeldingen."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: b50664331b9b
---

# PDF to Image {#pdf-to-image}

Converteer PDF-pagina's naar hoogwaardige rasterafbeeldingen. Ondersteunt paginaselectie, meerdere uitvoerformaten, DPI-instelling en kleurmodi. Bevat info- en preview-subroutes om PDF's te inspecteren vóór conversie.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"png"` | Uitvoerformaat: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Nee | 150 | Renderresolutie (36 tot 2400). Een hogere DPI produceert grotere, gedetailleerdere afbeeldingen. |
| quality | number | Nee | 85 | Uitvoerkwaliteit voor verliesgevende formaten (1 tot 100) |
| colorMode | string | Nee | `"color"` | Kleurmodus: `color`, `grayscale`, `bw` (zwart-witdrempel) |
| pages | string | Nee | `"all"` | Paginaselectie: `all`, enkele pagina (`3`), bereik (`1-5`), of door komma's gescheiden (`1,3,5-8`) |

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

Geeft het aantal pagina's van een PDF terug zonder pagina's te renderen.

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

Geeft JPEG-miniaturen met lage resolutie van alle pagina's terug als base64-data-URL's. Handig voor het bouwen van een paginaselectie-UI.

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

- Gebruikt MuPDF voor PDF-rendering, wat hoogwaardige uitvoer levert met correcte lettertypeweergave en vectorafbeeldingen.
- Met een wachtwoord beveiligde PDF's worden niet ondersteund en geven een 400-fout terug.
- De parameter `pages` ondersteunt flexibele syntaxis:
  - `"all"` of `""` - alle pagina's
  - `"3"` - enkele pagina
  - `"1-5"` - paginabereik (inclusief)
  - `"1,3,5-8"` - gemengde individuele pagina's en bereiken
- Paginanummers zijn 1-gebaseerd. Pagina's opgeven buiten de documentlengte geeft een 400-fout terug.
- Het hoofdendpoint genereert altijd zowel individuele pagina-downloads als een ZIP met alle geselecteerde pagina's.
- Het preview-endpoint rendert op 72 DPI en schaalt naar 300px breedte voor snelle miniatuurgeneratie. Miniaturen zijn JPEG met 60% kwaliteit.
- Het preview-endpoint respecteert de serverconfiguratie `MAX_PDF_PAGES`, die beperkt hoeveel miniaturen worden gegenereerd.
- Voor grote documenten met een hoge DPI neemt de verwerkingstijd evenredig toe. Overweeg een lagere DPI (150) voor webgebruik en een hogere DPI (300-600) voor afdrukken.
