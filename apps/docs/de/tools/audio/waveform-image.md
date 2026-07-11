---
description: "Erzeugt aus einer Audiodatei eine Wellenform-Visualisierung als PNG-Bild."
i18n_source_hash: 5480106dfe48
i18n_provenance: human
i18n_output_hash: db47e6d98839
---

# Waveform Image {#waveform-image}

Erzeugt aus einer Audiodatei eine Wellenform-Visualisierung als PNG-Bild mit konfigurierbaren Abmessungen und Farbe.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/waveform-image`

Akzeptiert Multipart-Formulardaten mit einer Audiodatei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| width | integer | Nein | `1024` | Bildbreite in Pixeln (256 bis 3840) |
| height | integer | Nein | `256` | Bildhöhe in Pixeln (64 bis 1080) |
| color | string | Nein | `"#4f46e5"` | Hex-Farbe der Wellenform (z. B. `"#4f46e5"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/waveform-image \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"width": 1920, "height": 400, "color": "#e07832"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.png",
  "originalSize": 4500000,
  "processedSize": 45000
}
```

## Notes {#notes}

- Die Ausgabe ist unabhängig vom Eingabe-Audioformat immer ein PNG-Bild.
- Die Wellenform wird auf einem transparenten Hintergrund gerendert.
- Nützlich für Miniaturansichten, Social-Media-Vorschauen oder zum Einbetten in Webseiten.
