---
description: "EXIF-, GPS-, ICC- und XMP-Metadaten aus Bildern entfernen, für mehr Datenschutz und kleinere Dateigrößen."
i18n_source_hash: 07f61cdb2c26
i18n_provenance: human
i18n_output_hash: 9a2e10358171
---

# Bildmetadaten entfernen {#remove-metadata}

Entfernt EXIF-, GPS-, ICC-Farbprofile und XMP-Metadaten aus Bildern. Nützlich für den Datenschutz (Entfernen von GPS-Koordinaten, Kamerainformationen) und zur Reduzierung der Dateigröße.

## API-Endpunkte {#api-endpoints}

### Metadaten entfernen {#strip-metadata}

`POST /api/v1/tools/image/strip-metadata`

Verarbeitet das Bild und gibt eine bereinigte Version zurück, aus der die ausgewählten Metadaten entfernt wurden.

### Metadaten prüfen {#inspect-metadata}

`POST /api/v1/tools/image/strip-metadata/inspect`

Gibt die geparsten Metadaten als JSON zurück, ohne das Bild zu verändern. Nützlich, um vor dem Entfernen zu prüfen, welche Metadaten vorhanden sind.

## Parameter (Entfernen) {#parameters-strip}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| stripExif | boolean | Nein | `false` | EXIF-Daten entfernen (Kameraeinstellungen, Datumsangaben usw.) |
| stripGps | boolean | Nein | `false` | Nur GPS-/Standortdaten entfernen |
| stripIcc | boolean | Nein | `false` | ICC-Farbprofil entfernen |
| stripXmp | boolean | Nein | `false` | XMP-Metadaten entfernen (Adobe, IPTC) |
| stripAll | boolean | Nein | `true` | Alle Metadaten auf einmal entfernen |

Wenn `stripAll` den Wert `true` hat, überschreibt es die einzelnen Flags und entfernt alles.

## Beispielanfrage {#example-request}

Alle Metadaten entfernen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": true}'
```

Nur GPS-Daten entfernen (Kamerainformationen und Farbprofil behalten):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"stripAll": false, "stripGps": true}'
```

Metadaten prüfen, ohne zu verändern:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/strip-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Beispielantwort (Entfernen) {#example-response-strip}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Beispielantwort (Prüfen) {#example-response-inspect}

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

## Hinweise {#notes}

- Das Bild wird nach dem Entfernen in seinem ursprünglichen Format neu kodiert. JPEG verwendet mozjpeg bei Qualität 90, PNG verwendet Kompressionsstufe 9, WebP verwendet Qualität 85.
- Das Entfernen von ICC-Profilen kann subtile Farbverschiebungen verursachen, wenn das Bild mit einem Nicht-sRGB-Profil versehen war. Verwenden Sie `stripIcc: false`, wenn Farbgenauigkeit wichtig ist.
- Der Prüf-Endpunkt wandelt GPS-Koordinaten der Bequemlichkeit halber in dezimale Werte für Breiten-/Längengrad um (mit einem Unterstrich als Präfix).
- Unterstützte Eingabeformate: JPEG, PNG, WebP, AVIF, TIFF, GIF.
