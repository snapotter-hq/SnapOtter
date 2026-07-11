---
description: "Konvertera PDF-sidor till högkvalitativa bilder."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: ae131ed26a40
---

# PDF to Image {#pdf-to-image}

Konvertera PDF-sidor till högkvalitativa rasterbilder. Stöder sidval, flera utdataformat, DPI-kontroll och färglägen. Innehåller under-rutter för info och förhandsvisning för att inspektera PDF-filer före konvertering.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"png"` | Utdataformat: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Nej | 150 | Renderingsupplösning (36 till 2400). Högre DPI ger större, mer detaljerade bilder. |
| quality | number | Nej | 85 | Utdatakvalitet för förlustbringande format (1 till 100) |
| colorMode | string | Nej | `"color"` | Färgläge: `color`, `grayscale`, `bw` (svartvit tröskel) |
| pages | string | Nej | `"all"` | Sidval: `all`, enskild sida (`3`), intervall (`1-5`) eller kommaseparerat (`1,3,5-8`) |

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

Returnerar antalet sidor i en PDF utan att rendera några sidor.

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

Returnerar lågupplösta JPEG-miniatyrer av alla sidor som base64-data-URL:er. Användbart för att bygga ett gränssnitt för sidval.

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

- Använder MuPDF för PDF-rendering, vilket ger utdata med hög trohet, korrekt teckensnittsrendering och vektorgrafik.
- Lösenordsskyddade PDF-filer stöds inte och returnerar ett 400-fel.
- Parametern `pages` stöder flexibel syntax:
  - `"all"` eller `""` - alla sidor
  - `"3"` - enskild sida
  - `"1-5"` - sidintervall (inklusive)
  - `"1,3,5-8"` - blandade enskilda sidor och intervall
- Sidnummer är 1-baserade. Att ange sidor bortom dokumentets längd returnerar ett 400-fel.
- Huvudslutpunkten genererar alltid både nedladdningar av enskilda sidor och en ZIP som innehåller alla valda sidor.
- Förhandsvisningsslutpunkten renderar vid 72 DPI och skalar till 300 px bredd för snabb miniatyrgenerering. Miniatyrer är JPEG med 60 % kvalitet.
- Förhandsvisningsslutpunkten respekterar serverkonfigurationen `MAX_PDF_PAGES`, vilket begränsar hur många miniatyrer som genereras.
- För stora dokument vid hög DPI ökar bearbetningstiden proportionerligt. Överväg att använda lägre DPI (150) för webbanvändning och högre DPI (300-600) för utskrift.
