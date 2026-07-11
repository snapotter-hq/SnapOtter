---
description: "Seam-Carving-Skalierung, die Pixel entlang wenig wichtiger Pfade hinzufügt oder entfernt, um Schlüsselinhalte und Gesichter zu bewahren."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: f93b84234ca9
---

# Inhaltsbasierte Skalierung {#content-aware-resize}

Seam-Carving-Skalierung, die Pixel entlang der Pfade mit der geringsten visuellen Bedeutung intelligent entfernt oder hinzufügt, dabei wichtige Inhalte bewahrt und optional Gesichter schützt.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Verarbeitung:** Synchron (gibt das Ergebnis direkt zurück)

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

## Antwort (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Hinweise {#notes}

- Diese benutzerdefinierte Route gibt derzeit eine synchrone 200-Antwort zurück.
- Verwendet die Seam-Carving-Bibliothek `caire` für die inhaltsbasierte Skalierung.
- Verkleinert nur die Abmessungen (entfernt Seams). Kann ein Bild nicht über seine ursprüngliche Größe hinaus vergrößern.
- Die Option `protectFaces` nutzt die KI-Gesichtserkennung, um Gesichtsbereiche als hochenergetisch zu markieren und zu verhindern, dass Seams durch Gesichter verlaufen.
- `blurRadius` steuert die Glättung vor der Berechnung der Energiekarte. Höhere Werte machen die Energiekarte gleichmäßiger, was bei verrauschten Bildern helfen kann.
- `sobelThreshold` beeinflusst, wie aggressiv Kanten erkannt werden. Niedrigere Werte bewahren feinere Kanten.
- Die Ausgabe ist immer im PNG-Format.
- Unterstützt die Eingabeformate HEIC/HEIF, RAW, TGA, PSD, EXR und HDR durch automatische Dekodierung.
