---
description: "Bekijk gedetailleerde afbeeldingsmetadata, eigenschappen en histogramstatistieken per kanaal."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: f2814f85e35e
---

# Afbeeldingsinfo {#image-info}

Alleen-lezen analysehulpmiddel dat uitgebreide afbeeldingsmetadata retourneert, waaronder afmetingen, formaat, kleurruimte, aanwezigheid van EXIF/ICC/XMP en histogramstatistieken per kanaal. Produceert geen verwerkt uitvoerbestand.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/info`

Accepteert multipart-formuliergegevens met een afbeeldingsbestand. Er is geen instellingenveld nodig.

## Parameters {#parameters}

Dit hulpmiddel heeft geen configureerbare parameters. Upload gewoon het afbeeldingsbestand.

| Veld | Type | Vereist | Beschrijving |
|-------|------|----------|-------------|
| file | file | Ja | De te analyseren afbeelding |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Voorbeeldantwoord {#example-response}

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

## Antwoordvelden {#response-fields}

| Veld | Type | Beschrijving |
|-------|------|-------------|
| filename | string | Opgeschoonde bestandsnaam |
| fileSize | number | Bestandsgrootte in bytes |
| width | number | Afbeeldingsbreedte in pixels |
| height | number | Afbeeldingshoogte in pixels |
| format | string | Gedetecteerd formaat (jpeg, png, webp, enz.) |
| channels | number | Aantal kleurkanalen |
| hasAlpha | boolean | Of de afbeelding een alfakanaal heeft |
| colorSpace | string | Kleurruimte (srgb, cmyk, enz.) |
| density | number of null | DPI/PPI-resolutie |
| isProgressive | boolean | Of de JPEG progressieve codering gebruikt |
| orientation | number of null | EXIF-oriëntatiewaarde (1-8) |
| hasProfile | boolean | Of er een ICC-profiel is ingebed |
| hasExif | boolean | Of er EXIF-metadata aanwezig is |
| hasIcc | boolean | Of er een ICC-kleurprofiel aanwezig is |
| hasXmp | boolean | Of er XMP-metadata aanwezig is |
| bitDepth | string of null | Bits per sample |
| pages | number | Aantal pagina's (voor formaten met meerdere pagina's zoals TIFF, GIF) |
| histogram | array | Statistieken per kanaal (min, max, gemiddelde, standaarddeviatie) |

## Opmerkingen {#notes}

- Dit is een alleen-lezen endpoint. Het produceert geen downloadbaar uitvoerbestand of `jobId`.
- Voor afbeeldingen in RAW-formaat (DNG, CR2, NEF, ARW, enz.) wordt ExifTool gebruikt om de werkelijke sensorafmetingen en metadatavlaggen te extraheren die Sharp niet rechtstreeks kan lezen.
- HEIC/HEIF-bestanden worden intern gedecodeerd naar PNG om pixelstatistieken te extraheren, aangezien Sharp geen HEVC-pixels kan decoderen.
- Het histogram geeft min/max/gemiddelde/stdev per kanaal, niet een volledige verdeling met 256 bins.
- Het veld `density` weerspiegelt de ingebedde DPI-metadata, indien aanwezig.
