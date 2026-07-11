---
description: "Zeigt detaillierte Bildmetadaten, Eigenschaften und Histogrammstatistiken pro Kanal an."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: bd976d2a6f65
---

# Bildinformationen {#image-info}

Schreibgeschütztes Analysewerkzeug, das umfassende Bildmetadaten zurückgibt, darunter Abmessungen, Format, Farbraum, das Vorhandensein von EXIF/ICC/XMP und Histogrammstatistiken pro Kanal. Erzeugt keine verarbeitete Ausgabedatei.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/info`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei. Es ist kein Einstellungsfeld erforderlich.

## Parameter {#parameters}

Dieses Werkzeug hat keine konfigurierbaren Parameter. Laden Sie einfach die Bilddatei hoch.

| Feld | Typ | Erforderlich | Beschreibung |
|-------|------|----------|-------------|
| file | file | Ja | Das zu analysierende Bild |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Beispielantwort {#example-response}

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

## Antwortfelder {#response-fields}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| filename | string | Bereinigter Dateiname |
| fileSize | number | Dateigröße in Bytes |
| width | number | Bildbreite in Pixeln |
| height | number | Bildhöhe in Pixeln |
| format | string | Erkanntes Format (jpeg, png, webp usw.) |
| channels | number | Anzahl der Farbkanäle |
| hasAlpha | boolean | Ob das Bild einen Alphakanal hat |
| colorSpace | string | Farbraum (srgb, cmyk usw.) |
| density | number oder null | DPI/PPI-Auflösung |
| isProgressive | boolean | Ob JPEG progressive Codierung verwendet |
| orientation | number oder null | EXIF-Ausrichtungswert (1-8) |
| hasProfile | boolean | Ob ein ICC-Profil eingebettet ist |
| hasExif | boolean | Ob EXIF-Metadaten vorhanden sind |
| hasIcc | boolean | Ob ein ICC-Farbprofil vorhanden ist |
| hasXmp | boolean | Ob XMP-Metadaten vorhanden sind |
| bitDepth | string oder null | Bits pro Sample |
| pages | number | Anzahl der Seiten (bei mehrseitigen Formaten wie TIFF, GIF) |
| histogram | array | Statistiken pro Kanal (Minimum, Maximum, Mittelwert, Standardabweichung) |

## Hinweise {#notes}

- Dies ist ein schreibgeschützter Endpunkt. Er erzeugt keine herunterladbare Ausgabedatei und keine `jobId`.
- Bei Bildern im RAW-Format (DNG, CR2, NEF, ARW usw.) wird ExifTool verwendet, um die tatsächlichen Sensorabmessungen und Metadaten-Flags zu extrahieren, die Sharp nicht direkt lesen kann.
- HEIC/HEIF-Dateien werden intern zu PNG decodiert, um Pixelstatistiken zu extrahieren, da Sharp HEVC-Pixel nicht decodieren kann.
- Das Histogramm liefert Minimum/Maximum/Mittelwert/Standardabweichung pro Kanal, nicht eine vollständige Verteilung mit 256 Bins.
- Das Feld `density` gibt die eingebetteten DPI-Metadaten wieder, sofern vorhanden.
