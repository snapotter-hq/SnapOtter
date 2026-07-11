---
description: "Optimaliseer afbeeldingen voor levering op het web met formaatconversie, kwaliteitsbeheer, verkleinen en het strippen van metadata."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 6ed64a89617f
---

# Optimize for Web {#optimize-for-web}

Optimaliseer afbeeldingen voor levering op het web in één stap. Combineert formaatconversie, kwaliteitsaanpassing, optioneel verkleinen, progressieve codering en het strippen van metadata.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Accepteert multipart form data met een afbeeldingsbestand en een JSON `settings`-veld.

Er is ook een live-voorbeeld-endpoint beschikbaar op `POST /api/v1/tools/image/optimize-for-web/preview`, die de verwerkte afbeelding rechtstreeks als binair teruggeeft (zonder werkruimte aan te maken) voor het in realtime afstemmen van parameters.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| format | string | Nee | `"webp"` | Uitvoerformaat: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Nee | `80` | Uitvoerkwaliteit (1-100) |
| maxWidth | number | Nee | - | Maximale breedte in pixels. De afbeelding wordt verkleind als deze breder is. |
| maxHeight | number | Nee | - | Maximale hoogte in pixels. De afbeelding wordt verkleind als deze hoger is. |
| progressive | boolean | Nee | `true` | Progressieve/interlaced codering inschakelen |
| stripMetadata | boolean | Nee | `true` | EXIF-, GPS-, ICC- en XMP-metadata verwijderen |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optimaliseren voor AVIF met agressieve compressie:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Preview Endpoint Response {#preview-endpoint-response}

Het voorbeeld-endpoint (`/api/v1/tools/image/optimize-for-web/preview`) geeft de binaire afbeelding rechtstreeks terug met informatieve headers:

- `X-Original-Size` - Oorspronkelijke bestandsgrootte in bytes
- `X-Processed-Size` - Verwerkte bestandsgrootte in bytes
- `X-Output-Filename` - URL-gecodeerde uitvoerbestandsnaam

## Notes {#notes}

- Deze tool is ontworpen als een alles-in-één optimalisatiepijplijn voor webassets. Deze verzorgt formaatconversie, kwaliteitsafstemming, het begrenzen van de maximale afmetingen en het verwijderen van metadata in één keer.
- De extensie van de uitvoerbestandsnaam wordt bijgewerkt om overeen te komen met het gekozen formaat.
- JXL-codering (JPEG XL) gebruikt een gespecialiseerde CLI-encoder. De afbeelding wordt eerst verwerkt als PNG en vervolgens gecodeerd naar JXL.
- Progressieve codering verbetert de waargenomen laadtijd voor JPEG en PNG doordat browsers een voorbeeld van lage kwaliteit kunnen renderen voordat de volledige afbeelding is geladen.
- Het voorbeeld-endpoint is lichter (geen werkruimte-/job-aanmaak) en is bedoeld voor de UI van de frontend voor het in realtime afstemmen van parameters.
