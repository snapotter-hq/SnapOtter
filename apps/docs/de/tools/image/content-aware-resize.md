---
description: "Seam-Carving-Skalierung, die Pixel entlang wenig wichtiger Pfade hinzufügt oder entfernt, um Schlüsselinhalte und Gesichter zu bewahren."
i18n_source_hash: a4adf011b2bd
i18n_provenance: human
i18n_output_hash: 98f7aedd761d
---

# Inhaltsbasierte Skalierung {#content-aware-resize}

Seam-Carving-Skalierung, die Pixel entlang der Pfade mit der geringsten visuellen Bedeutung intelligent entfernt oder hinzufügt, dabei wichtige Inhalte bewahrt und optional Gesichter schützt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Verarbeitung:** Asynchron (gibt 202 zurück, Status über SSE per `/api/v1/jobs/{jobId}/progress` abfragen)

**Modell-Bundle:** Für den Grundbetrieb keines erforderlich. Der Gesichtsschutz verwendet, sofern aktiviert, das Bundle `face-detection` (200-300 MB).

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| file | file | Ja | - | Bilddatei (Multipart) |
| width | number | Nein | - | Zielbreite in Pixeln |
| height | number | Nein | - | Zielhöhe in Pixeln |
| protectFaces | boolean | Nein | `false` | Gesichter erkennen und vor der Seam-Entfernung schützen |
| blurRadius | number | Nein | `4` | Weichzeichnungsradius für die Vorverarbeitung zur Energieberechnung (0-20) |
| sobelThreshold | number | Nein | `2` | Schwellenwert für die Sobel-Kantenerkennung (1-20). Höhere Werte machen den Algorithmus aggressiver |
| square | boolean | Nein | `false` | Auf ein Quadrat skalieren (verwendet die kleinere Abmessung) |

Mindestens eines von `width`, `height` oder `square` muss angegeben werden.

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Antwort {#response}

### Erste Antwort (202 Accepted) {#initial-response-202-accepted}

```json
{
  "statusUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "progressUrl": "/api/v1/jobs/a1b2c3d4-e5f6-7890-abcd-ef1234567890/progress",
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

### Endergebnis (über SSE) {#final-result-via-sse}

```json
{
  "phase": "complete",
  "percent": 100,
  "result": {
    "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
    "originalSize": 450000,
    "processedSize": 380000,
    "width": 800,
    "height": 600
  }
}
```

## Hinweise {#notes}

- Verwendet die Seam-Carving-Bibliothek `caire` für die inhaltsbasierte Skalierung.
- Verkleinert durch Entfernen von Seams oder vergrößert durch Einfügen von Seams. Jede Seite kann auf höchstens das Doppelte ihrer ursprünglichen Größe wachsen.
- Die Option `protectFaces` nutzt die KI-Gesichtserkennung, um Gesichtsbereiche als hochenergetisch zu markieren und zu verhindern, dass Seams durch Gesichter verlaufen.
- `blurRadius` steuert die Glättung vor der Berechnung der Energiekarte. Höhere Werte machen die Energiekarte gleichmäßiger, was bei verrauschten Bildern helfen kann.
- `sobelThreshold` beeinflusst, wie aggressiv Kanten erkannt werden. Niedrigere Werte bewahren feinere Kanten.
- Die Ausgabe ist immer im PNG-Format.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
