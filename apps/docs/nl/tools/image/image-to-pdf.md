---
description: "Combineer een of meer afbeeldingen tot een PDF-document met opties voor paginagrootte, oriëntatie en doelbestandsgrootte."
i18n_source_hash: f659c7e7f56b
i18n_provenance: human
i18n_output_hash: fdf3d681ccbe
---

# Afbeelding naar PDF {#image-to-pdf}

Combineer een of meer afbeeldingen tot een PDF-document. Ondersteunt meerdere paginagroottes, oriëntaties, marges en optionele doelbestandsgrootte via kwaliteitsaanpassing.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/image-to-pdf`

Accepteert multipart-formuliergegevens met een of meer afbeeldingsbestanden en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| pageSize | string | Nee | `"A4"` | Paginagrootte: `A4`, `Letter`, `A3`, `A5` |
| orientation | string | Nee | `"portrait"` | Pagina-oriëntatie: `portrait` of `landscape` |
| margin | number | Nee | `20` | Paginamarge in punten (0-500) |
| targetSize | object | Nee | - | Beperking van de doelbestandsgrootte (zie hieronder) |
| collate | boolean | Nee | `true` | Combineer alle afbeeldingen tot één PDF. Indien `false`, maak één PDF per afbeelding. |

### Target Size-object {#target-size-object}

| Veld | Type | Vereist | Beschrijving |
|-------|------|----------|-------------|
| value | number | Ja | Waarde van de doelgrootte |
| unit | string | Ja | Eenheid: `KB` of `MB` |

De minimale doelgrootte is 50 KB.

## Voorbeeldverzoek {#example-request}

Basis-PDF met meerdere afbeeldingen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@page1.jpg" \
  -F "file=@page2.jpg" \
  -F "file=@page3.jpg" \
  -F 'settings={"pageSize": "A4", "orientation": "portrait", "margin": 20}'
```

Met doelbestandsgrootte:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scan1.jpg" \
  -F "file=@scan2.jpg" \
  -F 'settings={"pageSize": "Letter", "targetSize": {"value": 2, "unit": "MB"}}'
```

Eén PDF per afbeelding:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F 'settings={"collate": false}'
```

## Voorbeeldantwoord (gecollationeerd) {#example-response-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 5000000,
  "processedSize": 1200000,
  "pages": 3
}
```

## Voorbeeldantwoord (niet-gecollationeerd) {#example-response-non-collated}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.zip",
  "originalSize": 5000000,
  "processedSize": 2400000,
  "pages": 2,
  "collated": false
}
```

## Voorbeeldantwoord (met doelgrootte) {#example-response-with-target-size}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/images.pdf",
  "originalSize": 10000000,
  "processedSize": 2000000,
  "pages": 5,
  "compression": {
    "targetRequested": 2097152,
    "targetMet": true,
    "jpegQuality": 72
  }
}
```

## Opmerkingen {#notes}

- Afbeeldingen worden op de pagina gecentreerd en geschaald om binnen de marges te passen met behoud van de beeldverhouding. Afbeeldingen worden nooit vergroot.
- Wanneer `collate` `false` is, wordt elke afbeelding een afzonderlijk PDF-bestand, en de download is een ZIP-archief met alle PDF's.
- De functie voor doelgrootte gebruikt iteratief binair zoeken over JPEG-kwaliteitsniveaus (10-95) om de beste kwaliteit te vinden die binnen het budget past.
- Transparante afbeeldingen worden samengevoegd op wit voordat ze in de PDF worden ingebed.
- Ondersteunde invoerformaten: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC, RAW, PSD, SVG en meer.
- EXIF-oriëntatie wordt automatisch toegepast vóór het inbedden.
