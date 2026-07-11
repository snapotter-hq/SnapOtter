---
description: "Ersetze eine bestimmte Farbe in einem Bild durch eine andere Farbe oder mache sie transparent."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 280398f11bb5
---

# Farbe ersetzen & umkehren {#replace-invert-color}

Ersetze Pixel, die einer Quellfarbe entsprechen, durch eine Zielfarbe oder mache sie transparent. Verwendet die euklidische Distanz im RGB-Raum mit konfigurierbarer Toleranz für sanfte Übergänge an Farbgrenzen.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Nein | `"#FF0000"` | Zu findende Hex-Farbe (Format: `#RRGGBB`) |
| targetColor | string | Nein | `"#00FF00"` | Hex-Farbe, durch die ersetzt wird (Format: `#RRGGBB`) |
| makeTransparent | boolean | Nein | `false` | Übereinstimmende Pixel transparent machen, statt sie durch die Zielfarbe zu ersetzen |
| tolerance | number | Nein | `30` | Toleranz für die Farbübereinstimmung (0 bis 255). Höhere Werte erfassen einen größeren Bereich ähnlicher Farben |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Einen grünen Hintergrund transparent machen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Hinweise {#notes}

- Die Farbübereinstimmung verwendet die euklidische Distanz im RGB-Raum, skaliert durch `tolerance * sqrt(3)`.
- Die Überblendung beim Ersetzen ist proportional zur Farbdistanz: Pixel, die näher an der Quellfarbe liegen, erhalten mehr von der Zielfarbe, was sanfte Übergänge erzeugt.
- Wenn `makeTransparent` auf `true` gesetzt ist, wird die Ausgabe auf PNG (oder WebP/AVIF) erzwungen, falls das Eingabeformat keine Alphakanäle unterstützt (z. B. JPEG).
- Eine Toleranz von 0 erfasst nur die exakte Quellfarbe. Höhere Werte (50+) erfassen einen breiteren Bereich ähnlicher Farbtöne.
- Das Ausgabeformat entspricht dem Eingabeformat, sofern keine Transparenz benötigt wird und das Eingabeformat keine Alpha-Unterstützung bietet.
