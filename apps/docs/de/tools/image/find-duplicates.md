---
description: "Erkennt doppelte und nahezu doppelte Bilder mithilfe von perzeptuellem Hashing."
i18n_source_hash: 4e1f4413f90f
i18n_provenance: human
i18n_output_hash: 50520e45b29d
---

# Duplikate finden {#find-duplicates}

Laden Sie mehrere Bilder hoch, um Duplikate und nahezu Duplikate mithilfe von perzeptuellem Hashing (dHash) zu erkennen. Gruppiert ähnliche Bilder, identifiziert die beste Qualitätsversion in jeder Gruppe und berechnet mögliche Speichereinsparungen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/find-duplicates`

Akzeptiert Multipart-Formulardaten mit mehreren Bilddateien und einem optionalen JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| threshold | number | Nein | `8` | Maximaler Hamming-Abstand, um Bilder als Duplikate zu betrachten (0 bis 20). Niedriger = strengere Übereinstimmung |

### Datei-Felder {#file-fields}

Laden Sie mindestens 2 Bilddateien in der Multipart-Anfrage hoch (alle unter dem Feldnamen `file` oder einem beliebigen Feldnamen für Dateibestandteile).

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/find-duplicates \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F "file=@photo4.jpg" \
  -F 'settings={"threshold": 8}'
```

## Beispielantwort {#example-response}

```json
{
  "totalImages": 4,
  "duplicateGroups": [
    {
      "groupId": 1,
      "files": [
        {
          "filename": "photo1.jpg",
          "similarity": 100,
          "width": 4032,
          "height": 3024,
          "fileSize": 2450000,
          "format": "jpeg",
          "isBest": true,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        },
        {
          "filename": "photo2.jpg",
          "similarity": 96.88,
          "width": 1920,
          "height": 1440,
          "fileSize": 850000,
          "format": "jpeg",
          "isBest": false,
          "thumbnail": "data:image/jpeg;base64,/9j/..."
        }
      ]
    }
  ],
  "uniqueImages": 2,
  "spaceSaveable": 850000,
  "skippedFiles": []
}
```

## Antwortfelder {#response-fields}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| totalImages | number | Anzahl der erfolgreich analysierten Bilder |
| duplicateGroups | array | Gruppen doppelter Bilder |
| uniqueImages | number | Anzahl der Bilder, die zu keiner Duplikatgruppe gehören |
| spaceSaveable | number | Gesamtzahl der Bytes, die durch Entfernen der nicht besten Duplikate eingespart werden könnten |
| skippedFiles | array | Dateien, die nicht verarbeitet werden konnten (mit Dateiname und Grund) |

### Objekt „Duplikatgruppe“ {#duplicate-group-object}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| groupId | number | Gruppenbezeichner |
| files | array | Bilder in dieser Duplikatgruppe |

### Datei-Objekt (innerhalb einer Gruppe) {#file-object-within-a-group}

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| filename | string | Ursprünglicher Dateiname |
| similarity | number | Ähnlichkeitsprozentsatz zum Referenzbild (das erste in der Gruppe) |
| width | number | Bildbreite in Pixeln |
| height | number | Bildhöhe in Pixeln |
| fileSize | number | Dateigröße in Bytes |
| format | string | Bildformat |
| isBest | boolean | Ob dies die Version mit der höchsten Qualität ist (die meisten Pixel, größte Datei) |
| thumbnail | string oder null | Base64-JPEG-Vorschaubild (200 px breit) für die Vorschau |

## Hinweise {#notes}

- Verwendet einen 128-Bit-dHash (64-Bit-Zeile + 64-Bit-Spalte) zur Erkennung perzeptueller Ähnlichkeit. Damit werden Duplikate selbst über Größenänderungen, Neukompression und kleinere Bearbeitungen hinweg erfasst.
- Der Schwellenwert steht für den maximalen Hamming-Abstand zwischen Hashes. Der Standardwert 8 erfasst nahezu Duplikate und vermeidet dabei Fehltreffer. Verwenden Sie 0 für ausschließlich pixelidentische Bilder oder 15-20 für eine sehr lockere Übereinstimmung.
- Das „beste“ Bild in jeder Gruppe ist dasjenige mit den meisten Pixeln (Breite x Höhe), wobei die Dateigröße als Tiebreaker dient.
- Es sind mindestens 2 Bilder erforderlich. Dateien, die die Validierung oder Decodierung nicht bestehen, werden in `skippedFiles` gemeldet, anstatt die gesamte Anfrage scheitern zu lassen.
- Vorschaubilder sind 200 px breite JPEG-Vorschauen, die als Data-URIs codiert sind.
- Alle gängigen Formate werden unterstützt (HEIC, RAW, PSD, SVG werden automatisch decodiert).
