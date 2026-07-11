---
description: "Bewerk EXIF-, IPTC-, GPS- en XMP-metadatavelden in afbeeldingen zonder de pixels opnieuw te coderen."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: b568d57227b5
---

# Metadata bewerken {#edit-metadata}

Bewerk metadatavelden van afbeeldingen, waaronder EXIF, IPTC, GPS-coördinaten, datums en trefwoorden. Gebruikt ExifTool onder de motorkap, zodat de metadata ter plaatse wordt geschreven zonder de pixels opnieuw te coderen, waardoor de volledige beeldkwaliteit behouden blijft.

## API-eindpunten {#api-endpoints}

### Metadata bewerken {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Schrijft metadatavelden naar de afbeelding en geeft het gewijzigde bestand terug.

### Metadata inspecteren {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Geeft de volledige metadata van de afbeelding terug via ExifTool als JSON. Wijzigt de afbeelding niet.

## Parameters (Bewerken) {#parameters-edit}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| title | string | Nee | - | Titel van de afbeelding (XMP/EXIF) |
| author | string | Nee | - | Naam van de auteur |
| artist | string | Nee | - | Naam van de kunstenaar (EXIF Artist-tag) |
| copyright | string | Nee | - | Auteursrechtvermelding |
| imageDescription | string | Nee | - | Beschrijving van de afbeelding (EXIF) |
| software | string | Nee | - | Software-tag |
| dateTime | string | Nee | - | EXIF DateTime-waarde |
| dateTimeOriginal | string | Nee | - | EXIF DateTimeOriginal-waarde |
| setAllDates | string | Nee | - | Alle datumvelden tegelijk instellen |
| dateShift | string | Nee | - | Verschuif alle datums met een offset (formaat: `+HH:MM` of `-HH:MM`) |
| clearGps | boolean | Nee | `false` | Verwijder alle GPS-gegevens |
| gpsLatitude | number | Nee | - | Stel de GPS-breedtegraad in (-90 tot 90) |
| gpsLongitude | number | Nee | - | Stel de GPS-lengtegraad in (-180 tot 180) |
| gpsAltitude | number | Nee | - | Stel de GPS-hoogte in meters in |
| keywords | string[] | Nee | - | Toe te voegen of in te stellen trefwoorden/tags |
| keywordsMode | string | Nee | `"add"` | Hoe trefwoorden moeten worden verwerkt: `add` (toevoegen) of `set` (vervangen) |
| fieldsToRemove | string[] | Nee | `[]` | Lijst met specifieke metadataveldnamen die moeten worden verwijderd |
| iptcTitle | string | Nee | - | IPTC Object Name |
| iptcHeadline | string | Nee | - | IPTC Headline |
| iptcCity | string | Nee | - | IPTC City |
| iptcState | string | Nee | - | IPTC Province/State |
| iptcCountry | string | Nee | - | IPTC Country |

## Voorbeeldverzoek {#example-request}

Auteur en auteursrecht instellen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

GPS-coördinaten instellen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

GPS verwijderen en trefwoorden toevoegen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Metadata inspecteren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Voorbeeldantwoord (Bewerken) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Opmerkingen {#notes}

- Deze tool vereist dat ExifTool op de server is geïnstalleerd. Het is opgenomen in de Docker-image.
- Metadata wordt ter plaatse geschreven, zodat er geen pixels opnieuw worden gecodeerd. De verandering in bestandsgrootte is minimaal (alleen de metadatabytes).
- De parameter `dateShift` verschuift alle datumvelden met de opgegeven offset, wat nuttig is voor het corrigeren van tijdzonefouten (bijv. `+02:00` of `-05:30`).
- Als er geen wijzigingen worden aangevraagd (alle parameters weggelaten of leeg), wordt het originele bestand ongewijzigd teruggegeven.
- Ondersteunde formaten: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Voor formaten die niet in de browser kunnen worden bekeken (HEIF, TIFF) bevat het antwoord een `previewUrl`-veld met een WebP-voorbeeld.
