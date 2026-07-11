---
description: "PDF-Seiten in hochwertige Bilder umwandeln."
i18n_source_hash: 1c36be5dadb8
i18n_provenance: human
i18n_output_hash: de98acf7742f
---

# PDF zu Bild {#pdf-to-image}

Wandeln Sie PDF-Seiten in hochwertige Rasterbilder um. Unterstützt Seitenauswahl, mehrere Ausgabeformate, DPI-Steuerung und Farbmodi. Enthält Info- und Vorschau-Unterrouten zum Prüfen von PDFs vor der Umwandlung.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-to-image`

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| format | string | Nein | `"png"` | Ausgabeformat: `png`, `jpg`, `webp`, `avif`, `tiff`, `gif`, `heic`, `heif`, `jxl` |
| dpi | number | Nein | 150 | Renderauflösung (36 bis 2400). Höhere DPI-Werte erzeugen größere, detailliertere Bilder. |
| quality | number | Nein | 85 | Ausgabequalität für verlustbehaftete Formate (1 bis 100) |
| colorMode | string | Nein | `"color"` | Farbmodus: `color`, `grayscale`, `bw` (Schwarz-Weiß-Schwellenwert) |
| pages | string | Nein | `"all"` | Seitenauswahl: `all`, einzelne Seite (`3`), Bereich (`1-5`) oder kommagetrennt (`1,3,5-8`) |

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

Gibt die Seitenanzahl einer PDF zurück, ohne Seiten zu rendern.

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

Gibt niedrig aufgelöste JPEG-Miniaturansichten aller Seiten als Base64-Data-URLs zurück. Nützlich zum Erstellen einer Benutzeroberfläche zur Seitenauswahl.

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

- Verwendet MuPDF zum Rendern von PDFs und liefert eine originalgetreue Ausgabe mit korrekter Schrift- und Vektorgrafik-Darstellung.
- Passwortgeschützte PDFs werden nicht unterstützt und geben einen 400-Fehler zurück.
- Der Parameter `pages` unterstützt eine flexible Syntax:
  - `"all"` oder `""` - alle Seiten
  - `"3"` - einzelne Seite
  - `"1-5"` - Seitenbereich (einschließlich)
  - `"1,3,5-8"` - gemischte einzelne Seiten und Bereiche
- Seitenzahlen sind 1-basiert. Die Angabe von Seiten über die Dokumentlänge hinaus gibt einen 400-Fehler zurück.
- Der Haupt-Endpunkt erzeugt immer sowohl einzelne Seiten-Downloads als auch ein ZIP, das alle ausgewählten Seiten enthält.
- Der Vorschau-Endpunkt rendert mit 72 DPI und skaliert für eine schnelle Miniaturansicht-Erzeugung auf 300 Pixel Breite. Miniaturansichten sind JPEG mit 60 % Qualität.
- Der Vorschau-Endpunkt berücksichtigt die Serverkonfiguration `MAX_PDF_PAGES` und begrenzt so, wie viele Miniaturansichten erzeugt werden.
- Bei großen Dokumenten mit hoher DPI-Auflösung steigt die Verarbeitungszeit proportional an. Erwägen Sie eine niedrigere DPI-Auflösung (150) für die Webnutzung und eine höhere DPI-Auflösung (300-600) für den Druck.
