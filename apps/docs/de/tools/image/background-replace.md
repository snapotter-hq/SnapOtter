---
description: "Den Bildhintergrund mit einer Volltonfarbe oder einem Farbverlauf per KI ersetzen."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 3a562fed291b
---

# Hintergrund ersetzen {#background-replace}

Ersetzt den Hintergrund eines Bildes durch eine Volltonfarbe oder einen Farbverlauf. Das KI-Modell erkennt das Motiv, entfernt den ursprünglichen Hintergrund und setzt das Motiv auf den von Ihnen gewählten Hintergrund.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Nein | `"color"` | Hintergrundmodus: `color` oder `gradient` |
| color | string | Nein | `"#ffffff"` | Hex-Farbe des Hintergrunds (wenn backgroundType `color` ist) |
| gradientColor1 | string | Nein | - | Erste Hex-Farbe des Farbverlaufs |
| gradientColor2 | string | Nein | - | Zweite Hex-Farbe des Farbverlaufs |
| gradientAngle | integer | Nein | `180` | Winkel des Farbverlaufs in Grad (0-360) |
| feather | integer | Nein | `0` | Radius der Kantenweichzeichnung (0-20) |
| format | string | Nein | `"png"` | Ausgabeformat: `png` oder `webp` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Verfolgen Sie den Fortschritt per SSE unter `GET /api/v1/jobs/{jobId}/progress`. Wenn der Auftrag abgeschlossen ist, gibt der SSE-Stream ein `completed`-Ereignis mit der Download-URL aus.

## Hinweise {#notes}

- Dies ist ein KI-gestütztes Werkzeug, das `202 Accepted` zurückgibt und asynchron verarbeitet. Verbinden Sie sich mit dem SSE-Endpunkt, um Fortschrittsaktualisierungen und das Endergebnis zu erhalten.
- Erfordert die Installation des Funktionspakets **background-removal**. Gibt `501` zurück, wenn das Paket nicht verfügbar ist.
- Eingaben in HEIC, RAW, PSD und SVG werden vor der Verarbeitung automatisch dekodiert.
- Die Ausgabe ist standardmäßig PNG, um die Transparenz um das Motiv herum zu erhalten.
