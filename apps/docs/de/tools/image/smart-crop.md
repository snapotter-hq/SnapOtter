---
description: "Motiv-, gesichts- und entropiebewusstes Zuschneiden, das Bilder mit Sharp und KI-Gesichtserkennung intelligent ausrichtet."
i18n_source_hash: acbe1439c6d8
i18n_provenance: human
i18n_output_hash: 579029ef7760
---

# Intelligentes Zuschneiden {#smart-crop}

Intelligentes motiv-, gesichts- oder trimmbasiertes Zuschneiden. Nutzt die Aufmerksamkeits-/Entropiestrategien von Sharp sowie KI-Gesichtserkennung für eine intelligente Bildausrichtung.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/smart-crop`

**Verarbeitung:** Asynchron (liefert 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abrufen)

**Modell-Bundle:** `face-detection` (200-300 MB) - nur für den Modus `face` erforderlich

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| mode | string | Nein | `"subject"` | Zuschneidemodus: `subject`, `face`, `trim`. (Legacy-Werte `attention` und `content` werden auf `subject` und `trim` abgebildet) |
| strategy | string | Nein | `"attention"` | Strategie für den Motivmodus: `attention` oder `entropy` |
| width | integer | Nein | - | Zielbreite in Pixeln |
| height | integer | Nein | - | Zielhöhe in Pixeln |
| padding | integer | Nein | `0` | Abstandsprozentsatz um das Motiv (0-50) |
| facePreset | string | Nein | `"head-shoulders"` | Voreinstellung für die Gesichtsausrichtung: `closeup`, `head-shoulders`, `upper-body`, `half-body` |
| sensitivity | number | Nein | `0.5` | Empfindlichkeit der Gesichtserkennung (0-1) |
| threshold | integer | Nein | `30` | Schwellenwert im Trimm-Modus für die Hintergrunderkennung (0-255) |
| padToSquare | boolean | Nein | `false` | Getrimmtes Ergebnis zu einem Quadrat auffüllen |
| padColor | string | Nein | `"#ffffff"` | Hintergrundfarbe für die Auffüllung |
| targetSize | integer | Nein | - | Zielgröße für die aufgefüllte Ausgabe (Pixel) |
| quality | integer | Nein | - | Ausgabequalität (1-100) |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/smart-crop \
  -F "file=@portrait.jpg" \
  -F 'settings={"mode":"face","width":1080,"height":1080,"facePreset":"head-shoulders"}'
```

## Antwort {#response}

### Erste Antwort (202 Accepted) {#initial-response-202-accepted}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Fortschritt (SSE unter `/api/v1/jobs/{jobId}/progress`) {#progress-sse-at-api-v1-jobs-jobid-progress}

```
event: progress
data: {"phase":"processing","percent":50}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/portrait_smartcrop.jpg",
    "originalSize": 500000,
    "processedSize": 320000
  }
}
```

## Modi {#modes}

### Motivmodus {#subject-mode}
Nutzt die Aufmerksamkeits- oder Entropiestrategie von Sharp, um die visuell interessanteste Region zu finden, und schneidet um diese herum zu.

### Gesichtsmodus {#face-mode}
Erkennt Gesichter mithilfe von KI und richtet den Zuschnitt anhand der angegebenen `facePreset` an den erkannten Gesichtern aus. Fällt auf den Motivmodus (Aufmerksamkeitsstrategie) zurück, wenn keine Gesichter erkannt werden.

### Trimm-Modus {#trim-mode}
Entfernt gleichmäßige Ränder/Hintergründe aus dem Bild. Optional wird das Ergebnis mit einer angegebenen Hintergrundfarbe und Zielgröße zu einem Quadrat aufgefüllt.

## Hinweise {#notes}

- Dieses Werkzeug nutzt die Factory `createToolRoute` mit `executionHint: "long"` und liefert daher 202 mit SSE-Fortschritt zurück.
- Der Gesichtsmodus erfordert das Modell-Bundle `face-detection` (200-300 MB).
- Motiv- und Trimm-Modus funktionieren ohne jegliches KI-Modell-Bundle.
- Die `facePreset` bestimmt, wie eng der Zuschnitt die erkannten Gesichter umrahmt: `closeup` ist am engsten, `half-body` am weitesten.
- Wenn keine Breite/Höhe angegeben wird, gilt standardmäßig 1080x1080.
