---
description: "EXIF-, GPS-, ICC- en XMP-metadata uit afbeeldingen verwijderen voor privacy en kleinere bestandsgroottes."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: f966cb3141d7
---

# Afbeeldingsmetadata verwijderen {#remove-metadata}

Verwijder EXIF-, GPS-, ICC-kleurprofielen en XMP-metadata uit afbeeldingen. Handig voor privacy (het verwijderen van GPS-coördinaten, camera-informatie) en het verkleinen van de bestandsgrootte.

## API Endpoints {#api-endpoints}

### Metadata Verwijderen {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Verwerkt de afbeelding en retourneert een opgeschoonde versie waaruit de geselecteerde metadata is verwijderd.

### Metadata Inspecteren {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Retourneert de geparseerde metadata als JSON zonder de afbeelding te wijzigen. Handig om te bekijken welke metadata aanwezig is voordat je deze verwijdert.

## Parameters (Verwijderen) {#parameters-strip}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Nee | `false` | EXIF-gegevens verwijderen (camera-instellingen, datums, enz.) |
| stripGps | boolean | Nee | `false` | Alleen GPS-/locatiegegevens verwijderen |
| stripIcc | boolean | Nee | `false` | ICC-kleurprofiel verwijderen |
| stripXmp | boolean | Nee | `false` | XMP-metadata verwijderen (Adobe, IPTC) |
| stripAll | boolean | Nee | `true` | Alle metadata in één keer verwijderen |

Wanneer `stripAll` `true` is, overschrijft dit de individuele vlaggen en wordt alles verwijderd.

## Voorbeeldverzoek {#example-request}

Alle metadata verwijderen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Alleen GPS-gegevens verwijderen (camera-informatie en kleurprofiel behouden):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Metadata inspecteren zonder te wijzigen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Voorbeeldrespons (Verwijderen) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Voorbeeldrespons (Inspecteren) {#example-response-inspect}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "exif": {
    "Make": "Canon",
    "Model": "EOS R5",
    "DateTimeOriginal": "2024:03:15 14:30:00",
    "ExposureTime": "1/250",
    "FNumber": 2.8,
    "ISO": 400
  },
  "gps": {
    "GPSLatitudeRef": "N",
    "GPSLatitude": [37, 46, 30],
    "_latitude": 37.775,
    "_longitude": -122.4183
  },
  "icc": {
    "Profile Size": "3144 bytes",
    "Color Space": "RGB",
    "Description": "sRGB IEC61966-2.1"
  },
  "xmp": {
    "CreatorTool": "Adobe Photoshop 25.0"
  }
}
```

## Opmerkingen {#notes}

- De afbeelding wordt na het verwijderen opnieuw gecodeerd in het oorspronkelijke formaat. JPEG gebruikt mozjpeg met kwaliteit 90, PNG gebruikt compressieniveau 9, WebP gebruikt kwaliteit 85.
- Het verwijderen van ICC-profielen kan subtiele kleurverschuivingen veroorzaken als de afbeelding met een niet-sRGB-profiel was gemarkeerd. Gebruik `stripIcc: false` als kleurnauwkeurigheid van belang is.
- Het inspecteer-endpoint parseert GPS-coördinaten voor het gemak naar decimale breedte-/lengtegraadwaarden (met een underscore als voorvoegsel).
- Ondersteunde invoerformaten: JPEG, PNG, WebP, AVIF, TIFF, GIF.
