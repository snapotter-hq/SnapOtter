---
description: "Erstelle Memes mit Vorlagen oder eigenen Bildern, gestylten Textfeldern und Schriftoptionen."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 04074c6faeaf
---

# Meme-Generator {#meme-generator}

Erstelle Memes mit integrierten Vorlagen oder eigenen Bildern. Füge Text im klassischen Meme-Stil hinzu (fetter Text mit Umrandung), mit mehreren Layout-Voreinstellungen und Schriftauswahl.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Akzeptiert entweder:
- **Multipart-Formulardaten** mit einer Bilddatei und einem JSON-Feld `settings` (Modus mit eigenem Bild)
- **JSON-Body** mit einer `templateId` (Vorlagenmodus, kein Datei-Upload nötig)

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| templateId | string | Nein | - | ID einer integrierten Meme-Vorlage. Wenn angegeben, ist kein Bild-Upload nötig |
| textLayout | string | Nein | `"top-bottom"` | Textfeld-Layout: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Nein | `[]` | Array von Textfeld-Objekten mit den Feldern `id` und `text` |
| fontFamily | string | Nein | `"anton"` | Schriftart: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Nein | auto | Schriftgröße in Pixeln (8 bis 200). Wird automatisch berechnet, wenn nicht angegeben |
| textColor | string | Nein | `"#ffffff"` | Füllfarbe des Textes |
| strokeColor | string | Nein | `"#000000"` | Farbe der Textumrandung |
| textAlign | string | Nein | `"center"` | Textausrichtung: `left`, `center`, `right` |
| allCaps | boolean | Nein | `true` | Text in Großbuchstaben umwandeln |

### Textfelder {#text-boxes}

Jeder Eintrag im Array `textBoxes` sollte Folgendes enthalten:

| Feld | Typ | Beschreibung |
|-------|------|-------------|
| id | string | Feld-Bezeichner passend zum Layout (z. B. `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | Der anzuzeigende Meme-Text |

### Feld-IDs des Text-Layouts {#text-layout-box-ids}

| Layout | Verfügbare Feld-IDs |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Beispielanfrage {#example-request}

Eigenes Bild mit oberem und unterem Text:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Verwendung einer integrierten Vorlage (JSON-Body, kein Datei-Upload):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Hinweise {#notes}

- Entweder `templateId` oder eine hochgeladene Bilddatei ist erforderlich. Werden beide angegeben, wird die Vorlage verwendet.
- Vorlagen definieren ihre eigenen Textfeld-Positionen; der Parameter `textLayout` wird bei Verwendung von Vorlagen ignoriert.
- Text wird als SVG mit Umrandungen gerendert, um den klassischen Meme-Look zu erzielen.
- Die Schriftgröße wird automatisch berechnet, um in das Textfeld zu passen, sofern sie nicht explizit gesetzt ist.
- Leere Textfelder werden übersprungen (es wird nichts gerendert, wenn alle Felder leer sind).
- Der Ausgabedateiname enthält die Vorlagen-ID, wenn Vorlagen verwendet werden (z. B. `meme-drake.png`).
- HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
