---
description: "Visa detaljerad bildmetadata, egenskaper och histogramstatistik per kanal."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: cc97aadeef6a
---

# Bildinformation {#image-info}

Skrivskyddat analysverktyg som returnerar omfattande bildmetadata inklusive dimensioner, format, färgrymd, förekomst av EXIF/ICC/XMP och histogramstatistik per kanal. Producerar ingen bearbetad utdatafil.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/image/info`

Tar emot multipart-formulärdata med en bildfil. Inget inställningsfält behövs.

## Parametrar {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Ladda bara upp bildfilen.

| Fält | Typ | Obligatorisk | Beskrivning |
|-------|------|----------|-------------|
| file | file | Ja | Bilden att analysera |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Exempelsvar {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Svarsfält {#response-fields}

| Fält | Typ | Beskrivning |
|-------|------|-------------|
| filename | string | Rensat filnamn |
| fileSize | number | Filstorlek i byte |
| width | number | Bildbredd i pixlar |
| height | number | Bildhöjd i pixlar |
| format | string | Upptäckt format (jpeg, png, webp osv.) |
| channels | number | Antal färgkanaler |
| hasAlpha | boolean | Om bilden har en alfakanal |
| colorSpace | string | Färgrymd (srgb, cmyk osv.) |
| density | number eller null | DPI/PPI-upplösning |
| isProgressive | boolean | Om JPEG använder progressiv kodning |
| orientation | number eller null | EXIF-orienteringsvärde (1-8) |
| hasProfile | boolean | Om en ICC-profil är inbäddad |
| hasExif | boolean | Om EXIF-metadata finns |
| hasIcc | boolean | Om en ICC-färgprofil finns |
| hasXmp | boolean | Om XMP-metadata finns |
| bitDepth | string eller null | Bitar per sampel |
| pages | number | Antal sidor (för flersidiga format som TIFF, GIF) |
| histogram | array | Statistik per kanal (min, max, medelvärde, standardavvikelse) |

## Anmärkningar {#notes}

- Detta är en skrivskyddad slutpunkt. Den producerar ingen nedladdningsbar utdatafil eller `jobId`.
- För RAW-formatbilder (DNG, CR2, NEF, ARW osv.) används ExifTool för att extrahera verkliga sensordimensioner och metadataflaggor som Sharp inte kan läsa direkt.
- HEIC/HEIF-filer avkodas internt till PNG för att extrahera pixelstatistik, eftersom Sharp inte kan avkoda HEVC-pixlar.
- Histogrammet tillhandahåller min/max/medelvärde/stdav per kanal, inte en fullständig 256-bins fördelning.
- Fältet `density` återspeglar den inbäddade DPI-metadatan, om den finns.
