---
description: "Den Hintergrund weichzeichnen und dabei das Motiv per KI scharf halten."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: 5997f8c497df
---

# Hintergrund weichzeichnen {#blur-background}

Zeichnet den Hintergrund eines Bildes weich und hält dabei das Motiv scharf. Das KI-Modell isoliert das Motiv, wendet eine Weichzeichnung auf den ursprünglichen Hintergrund an und setzt das scharfe Motiv darüber.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Nimmt Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings` entgegen.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| intensity | integer | Nein | `50` | Weichzeichnungsintensität (1-100) |
| feather | integer | Nein | `0` | Radius der Kantenweichzeichnung (0-20) |
| format | string | Nein | `"png"` | Ausgabeformat: `png` oder `webp` |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
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
- Höhere Intensitätswerte erzeugen einen stärkeren Weichzeichnungseffekt. Werte über 80 erzeugen eine ausgeprägte bokeh-artige Trennung.
- Eingaben in HEIC, RAW, PSD und SVG werden vor der Verarbeitung automatisch dekodiert.
