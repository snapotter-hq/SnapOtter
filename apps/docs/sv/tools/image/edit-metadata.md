---
description: "Redigera EXIF-, IPTC-, GPS- och XMP-metadatafält i bilder utan att koda om pixlarna."
i18n_source_hash: a37746db11c3
i18n_provenance: human
i18n_output_hash: e19a6cf535ce
---

# Redigera metadata {#edit-metadata}

Redigera bildmetadatafält inklusive EXIF, IPTC, GPS-koordinater, datum och nyckelord. Använder ExifTool i bakgrunden, så metadata skrivs på plats utan att koda om pixlar, vilket bevarar full bildkvalitet.

## API-slutpunkter {#api-endpoints}

### Redigera metadata {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Skriver metadatafält till bilden och returnerar den ändrade filen.

### Inspektera metadata {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Returnerar den fullständiga metadatan från bilden via ExifTool som JSON. Ändrar inte bilden.

## Parametrar (Redigera) {#parameters-edit}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| title | string | Nej | - | Bildtitel (XMP/EXIF) |
| author | string | Nej | - | Författarnamn |
| artist | string | Nej | - | Konstnärsnamn (EXIF Artist-tagg) |
| copyright | string | Nej | - | Upphovsrättsmeddelande |
| imageDescription | string | Nej | - | Bildbeskrivning (EXIF) |
| software | string | Nej | - | Programvarutagg |
| dateTime | string | Nej | - | EXIF DateTime-värde |
| dateTimeOriginal | string | Nej | - | EXIF DateTimeOriginal-värde |
| setAllDates | string | Nej | - | Ange alla datumfält samtidigt |
| dateShift | string | Nej | - | Förskjut alla datum med en offset (format: `+HH:MM` eller `-HH:MM`) |
| clearGps | boolean | Nej | `false` | Ta bort all GPS-data |
| gpsLatitude | number | Nej | - | Ange GPS-latitud (-90 till 90) |
| gpsLongitude | number | Nej | - | Ange GPS-longitud (-180 till 180) |
| gpsAltitude | number | Nej | - | Ange GPS-höjd i meter |
| keywords | string[] | Nej | - | Nyckelord/taggar att lägga till eller ange |
| keywordsMode | string | Nej | `"add"` | Hur nyckelord hanteras: `add` (lägg till) eller `set` (ersätt) |
| fieldsToRemove | string[] | Nej | `[]` | Lista över specifika metadatafältnamn att ta bort |
| iptcTitle | string | Nej | - | IPTC Object Name |
| iptcHeadline | string | Nej | - | IPTC Headline |
| iptcCity | string | Nej | - | IPTC City |
| iptcState | string | Nej | - | IPTC Province/State |
| iptcCountry | string | Nej | - | IPTC Country |

## Exempelbegäran {#example-request}

Ange författare och upphovsrätt:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

Ange GPS-koordinater:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

Ta bort GPS och lägg till nyckelord:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Inspektera metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exempelsvar (Redigera) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Anteckningar {#notes}

- Detta verktyg kräver att ExifTool är installerat på servern. Det ingår i Docker-avbildningen.
- Metadata skrivs på plats, så ingen omkodning av pixlar sker. Ändringen av filstorleken är minimal (bara metadatabyten).
- Parametern `dateShift` förskjuter alla datumfält med den angivna offseten, vilket är användbart för att korrigera tidszonsfel (t.ex. `+02:00` eller `-05:30`).
- Om inga ändringar begärs (alla parametrar utelämnade eller tomma) returneras originalfilen oförändrad.
- Format som stöds: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- För format som inte kan förhandsgranskas i webbläsaren (HEIF, TIFF) inkluderar svaret ett `previewUrl`-fält med en WebP-förhandsgranskning.
