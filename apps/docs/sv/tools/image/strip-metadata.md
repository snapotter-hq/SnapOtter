---
description: "Ta bort EXIF-, GPS-, ICC- och XMP-metadata från bilder för integritet och mindre filstorlekar."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 691746073839
---

# Ta bort bildmetadata {#remove-metadata}

Ta bort EXIF, GPS, ICC-färgprofiler och XMP-metadata från bilder. Användbart för integritet (ta bort GPS-koordinater, kamerainformation) och för att minska filstorleken.

## API Endpoints {#api-endpoints}

### Ta bort metadata {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Bearbetar bilden och returnerar en rensad version med vald metadata borttagen.

### Granska metadata {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Returnerar den tolkade metadatan som JSON utan att modifiera bilden. Användbart för att förhandsgranska vilken metadata som finns innan borttagning.

## Parameters (Strip) {#parameters-strip}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | No | `false` | Ta bort EXIF-data (kcamerainställningar, datum osv.) |
| stripGps | boolean | No | `false` | Ta endast bort GPS-/platsdata |
| stripIcc | boolean | No | `false` | Ta bort ICC-färgprofil |
| stripXmp | boolean | No | `false` | Ta bort XMP-metadata (Adobe, IPTC) |
| stripAll | boolean | No | `true` | Ta bort all metadata på en gång |

När `stripAll` är `true` åsidosätter det de enskilda flaggorna och tar bort allt.

## Example Request {#example-request}

Ta bort all metadata:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Ta endast bort GPS-data (behåll kamerainformation och färgprofil):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Granska metadata utan att modifiera:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Example Response (Strip) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Example Response (Inspect) {#example-response-inspect}

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

## Notes {#notes}

- Bilden omkodas i sitt originalformat efter borttagning. JPEG använder mozjpeg med kvalitet 90, PNG använder komprimeringsnivå 9, WebP använder kvalitet 85.
- Att ta bort ICC-profiler kan orsaka subtila färgförskjutningar om bilden var taggad med en icke-sRGB-profil. Använd `stripIcc: false` om färgnoggrannhet är viktig.
- Granskningsslutpunkten tolkar GPS-koordinater till decimala latitud-/longitudvärden (med understreck som prefix) för bekvämlighet.
- Indataformat som stöds: JPEG, PNG, WebP, AVIF, TIFF, GIF.
