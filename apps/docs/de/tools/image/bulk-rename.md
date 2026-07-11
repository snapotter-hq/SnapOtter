---
description: "Mehrere Dateien mit einer Muster-Vorlage umbenennen und als ZIP herunterladen."
i18n_source_hash: 2776dcc2f71c
i18n_provenance: human
i18n_output_hash: 482df91186ca
---

# Massenumbenennung {#bulk-rename}

Benennt mehrere Dateien mit einer Muster-Vorlage um, die Platzhalter für Index, aufgefüllten Index und ursprünglichen Dateinamen enthält. Gibt ein ZIP-Archiv mit allen umbenannten Dateien zurück.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/bulk-rename`

Nimmt Multipart-Formulardaten mit mehreren Dateien und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| pattern | string | Nein | `"image-{{index}}"` | Benennungsmuster mit Platzhaltern (max. 1000 Zeichen) |
| startIndex | number | Nein | `1` | Startindexnummer |

### Muster-Platzhalter {#pattern-placeholders}

| Platzhalter | Beschreibung | Beispiel |
|-------------|-------------|---------|
| `{{index}}` | Fortlaufende Nummer, beginnend bei `startIndex` | `1`, `2`, `3` |
| `{{padded}}` | Mit Nullen aufgefüllte fortlaufende Nummer | `01`, `02`, `03` |
| `{{original}}` | Ursprünglicher Dateiname ohne Erweiterung | `photo`, `IMG_001` |

Die ursprüngliche Dateierweiterung bleibt stets erhalten.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo1.jpg" \
  -F "file=@photo2.jpg" \
  -F "file=@photo3.jpg" \
  -F 'settings={"pattern": "vacation-{{padded}}", "startIndex": 1}'
```

Dies erzeugt: `vacation-1.jpg`, `vacation-2.jpg`, `vacation-3.jpg`

Mit ursprünglichem Dateinamen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/bulk-rename \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@IMG_001.jpg" \
  -F "file=@IMG_002.jpg" \
  -F 'settings={"pattern": "2024-trip-{{original}}-{{index}}"}'
```

Dies erzeugt: `2024-trip-IMG_001-1.jpg`, `2024-trip-IMG_002-2.jpg`

## Beispielantwort {#example-response}

Die Antwort ist eine direkt gestreamte ZIP-Datei (keine JSON-Antwort). Die Antwort-Header lauten:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="renamed-a1b2c3d4.zip"
```

## Hinweise {#notes}

- Dieses Werkzeug verarbeitet keine Bilder. Es benennt nur Dateien um und packt sie in ein ZIP-Archiv.
- Die Breite der Null-Auffüllung für `{{padded}}` wird automatisch anhand der Gesamtzahl der Dateien bestimmt (z. B. würden 100 Dateien eine 3-stellige Auffüllung verwenden: `001`, `002` usw.).
- Dateierweiterungen werden aus den ursprünglichen Dateinamen übernommen.
- Dateinamen werden bereinigt, um unsichere Zeichen zu entfernen.
- Es muss mindestens eine Datei bereitgestellt werden.
