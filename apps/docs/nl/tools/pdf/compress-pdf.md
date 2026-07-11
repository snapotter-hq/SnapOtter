---
description: "Verklein de bestandsgrootte van een PDF door ingebedde afbeeldingen te comprimeren."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 51fa6d44d483
---

# Compress PDF {#compress-pdf}

Verklein de bestandsgrootte van een PDF door ingebedde afbeeldingen te downsamplen. Kies tussen een kwaliteitsschuif of een doelbestandsgrootte.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Accepteert multipart-formuliergegevens met een PDF-bestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| mode | string | Nee | `"quality"` | Compressiemodus: `quality` of `targetSize` |
| quality | integer | Nee | `75` | Compressiekwaliteit, 1-100 (hoger = minder compressie). Gebruikt in de modus `quality` |
| targetSizeKb | number | Nee | - | Doelbestandsgrootte in kilobytes. Gebruikt in de modus `targetSize` |

## Example Request {#example-request}

Comprimeren op kwaliteit:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Comprimeren naar een doelgrootte:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- In de modus `quality` produceren lagere waarden kleinere bestanden met meer beeldkwaliteitsverlies.
- In de modus `targetSize` vindt een binaire zoekopdracht de hoogste DPI die binnen de gevraagde grootte past.
- Als compressie het bestand zou vergroten, worden de originele bytes ongewijzigd teruggegeven.
- Tekst en vectorinhoud worden niet beïnvloed; alleen ingebedde rasterafbeeldingen worden gedownsampled.
