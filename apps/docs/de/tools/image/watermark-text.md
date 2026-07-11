---
description: "Text-Wasserzeichen mit konfigurierbarer Position, Deckkraft, Rotation und Kachelung hinzufügen."
i18n_source_hash: b80f12f410e4
i18n_provenance: human
i18n_output_hash: 5ceba5ba09eb
---

# Text-Wasserzeichen {#text-watermark}

Fügt Bildern eine Text-Wasserzeichenüberlagerung hinzu. Unterstützt eine einzelne Platzierung an Ecken/Mitte oder eine gekachelte Wiederholung über das gesamte Bild, mit konfigurierbarer Schriftgröße, Farbe, Deckkraft und Rotation.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/watermark-text`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| text | string | Ja | - | Wasserzeichentext (1 bis 500 Zeichen) |
| fontSize | number | Nein | `48` | Schriftgröße in Pixeln (8 bis 1000) |
| color | string | Nein | `"#000000"` | Textfarbe im Hexformat (`#RRGGBB`) |
| opacity | number | Nein | `50` | Deckkraft des Textes in Prozent (0 bis 100) |
| position | string | Nein | `"center"` | Platzierung: `center`, `top-left`, `top-right`, `bottom-left`, `bottom-right`, `tiled` |
| rotation | number | Nein | `0` | Textrotationswinkel in Grad (-360 bis 360) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "SAMPLE", "fontSize": 64, "opacity": 30, "position": "center", "rotation": -30}'
```

Gekacheltes Wasserzeichen über das gesamte Bild:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/watermark-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"text": "DRAFT", "fontSize": 36, "opacity": 20, "position": "tiled", "rotation": -45}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2480000
}
```

## Hinweise {#notes}

- Das Wasserzeichen wird als SVG-Text gerendert und auf das Bild komponiert, wodurch die Ausgabequalität erhalten bleibt.
- Der Kachelmodus verteilt die Textelemente anhand der Schriftgröße (6-facher horizontaler, 4-facher vertikaler Abstand), gedeckelt auf maximal 500 Elemente.
- Bei Eckpositionen entspricht der Abstand zum Rand der Schriftgröße.
- Die verwendete Schriftart ist die serifenlose Standardschriftart des Systems.
- XML-Sonderzeichen im Text (`&`, `<`, `>`, `"`, `'`) werden sicher maskiert.
- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
