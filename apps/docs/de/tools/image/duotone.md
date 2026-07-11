---
description: "Wendet einen zweifarbigen Duotone-Effekt mit individuellen Schatten- und Lichterfarben an."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: a0baf955972e
---

# Duotone {#duotone}

Wendet einen zweifarbigen Duotone-Effekt auf ein Bild an. Das Bild wird in Graustufen umgewandelt und dann auf einen Verlauf zwischen der Schattenfarbe (dunkle Töne) und der Lichterfarbe (helle Töne) abgebildet.

## API-Endpunkt {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Akzeptiert Multipart-Formulardaten mit einer Bilddatei und einem JSON-Feld `settings`.

## Parameter {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| shadow | string | Nein | `"#1e3a8a"` | Schatten-Hex-Farbe (wird auf dunkle Töne angewendet) |
| highlight | string | Nein | `"#fbbf24"` | Lichter-Hex-Farbe (wird auf helle Töne angewendet) |
| intensity | integer | Nein | `100` | Effektintensität (0-100); 0 gibt das Original zurück, 100 wendet den vollen Duotone-Effekt an |

## Beispielanfrage {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Beispielantwort {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Hinweise {#notes}

- Das Ausgabeformat entspricht dem Eingabeformat. HEIC-, RAW-, PSD- und SVG-Eingaben werden vor der Verarbeitung automatisch dekodiert.
- Ein `intensity` von weniger als 100 mischt das Duotone-Ergebnis mit dem Originalbild und ermöglicht so dezentere Effekte.
- Beliebte Duotone-Kombinationen sind Marineblau/Gold, Petrol/Koralle und Violett/Rosa.
