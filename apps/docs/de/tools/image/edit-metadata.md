---
description: "Bearbeitet EXIF-, IPTC-, GPS- und XMP-Metadatenfelder in Bildern, ohne die Pixel neu zu kodieren."
i18n_source_hash: 9271d3d8f278
i18n_provenance: human
i18n_output_hash: e0f8d58bc6c3
---

# Bildmetadaten bearbeiten {#edit-metadata}

Bearbeitet Bildmetadatenfelder einschließlich EXIF, IPTC, GPS-Koordinaten, Daten und Schlüsselwörter. Verwendet ExifTool im Hintergrund, sodass Metadaten direkt geschrieben werden, ohne die Pixel neu zu kodieren, wodurch die volle Bildqualität erhalten bleibt.

## API-Endpunkte {#api-endpoints}

### Metadaten bearbeiten {#edit-metadata-1}

`POST /api/v1/tools/image/edit-metadata`

Schreibt Metadatenfelder in das Bild und gibt die geänderte Datei zurück.

### Metadaten prüfen {#inspect-metadata}

`POST /api/v1/tools/image/edit-metadata/inspect`

Gibt die vollständigen Metadaten des Bildes über ExifTool als JSON zurück. Verändert das Bild nicht.

## Parameter (Bearbeiten) {#parameters-edit}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| title | string | Nein | - | Bildtitel (XMP/EXIF) |
| author | string | Nein | - | Name des Autors |
| artist | string | Nein | - | Name des Künstlers (EXIF-Artist-Tag) |
| copyright | string | Nein | - | Urheberrechtshinweis |
| imageDescription | string | Nein | - | Bildbeschreibung (EXIF) |
| software | string | Nein | - | Software-Tag |
| dateTime | string | Nein | - | EXIF-DateTime-Wert |
| dateTimeOriginal | string | Nein | - | EXIF-DateTimeOriginal-Wert |
| setAllDates | string | Nein | - | Alle Datumsfelder auf einmal setzen |
| dateShift | string | Nein | - | Alle Daten um einen Versatz verschieben (Format: `+HH:MM` oder `-HH:MM`) |
| clearGps | boolean | Nein | `false` | Alle GPS-Daten entfernen |
| gpsLatitude | number | Nein | - | GPS-Breitengrad setzen (-90 bis 90) |
| gpsLongitude | number | Nein | - | GPS-Längengrad setzen (-180 bis 180) |
| gpsAltitude | number | Nein | - | GPS-Höhe in Metern setzen |
| keywords | string[] | Nein | - | Hinzuzufügende oder zu setzende Schlüsselwörter/Tags |
| keywordsMode | string | Nein | `"add"` | Umgang mit Schlüsselwörtern: `add` (anhängen) oder `set` (ersetzen) |
| fieldsToRemove | string[] | Nein | `[]` | Liste bestimmter zu entfernender Metadatenfeldnamen |
| iptcTitle | string | Nein | - | IPTC Object Name |
| iptcHeadline | string | Nein | - | IPTC Headline |
| iptcCity | string | Nein | - | IPTC City |
| iptcState | string | Nein | - | IPTC Province/State |
| iptcCountry | string | Nein | - | IPTC Country |

## Beispielanfrage {#example-request}

Autor und Urheberrecht setzen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"author": "Jane Smith", "copyright": "2024 Jane Smith"}'
```

GPS-Koordinaten setzen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"gpsLatitude": 48.8566, "gpsLongitude": 2.3522, "gpsAltitude": 35}'
```

GPS entfernen und Schlüsselwörter hinzufügen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"clearGps": true, "keywords": ["landscape", "sunset"], "keywordsMode": "add"}'
```

Metadaten prüfen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/edit-metadata/inspect \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Beispielantwort (Bearbeiten) {#example-response-edit}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2452000
}
```

## Hinweise {#notes}

- Dieses Werkzeug erfordert, dass ExifTool auf dem Server installiert ist. Es ist im Docker-Image enthalten.
- Metadaten werden direkt geschrieben, sodass keine erneute Pixelkodierung erfolgt. Die Änderung der Dateigröße ist minimal (nur die Metadaten-Bytes).
- Der Parameter `dateShift` verschiebt alle Datumsfelder um den angegebenen Versatz, was zur Korrektur von Zeitzonenfehlern nützlich ist (z. B. `+02:00` oder `-05:30`).
- Werden keine Änderungen angefordert (alle Parameter weggelassen oder leer), wird die Originaldatei unverändert zurückgegeben.
- Unterstützte Formate: JPEG, PNG, WebP, AVIF, TIFF, GIF, HEIC/HEIF.
- Für Formate, die nicht im Browser vorschaubar sind (HEIF, TIFF), enthält die Antwort ein Feld `previewUrl` mit einer WebP-Vorschau.
