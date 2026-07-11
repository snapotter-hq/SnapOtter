---
description: "Helderheid, contrast, verzadiging en gamma van een video aanpassen."
i18n_source_hash: 40483b79d44b
i18n_provenance: human
i18n_output_hash: 85019e556fa6
---

# Video Color {#video-color}

Pas de helderheid, het contrast, de verzadiging en de gammacorrectie van een video aan.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/video-color`

Accepteert multipart form data met een videobestand en een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| brightness | number | Nee | `0` | Helderheidsaanpassing (-1 tot 1) |
| contrast | number | Nee | `1` | Contrastvermenigvuldiger (0-4) |
| saturation | number | Nee | `1` | Verzadigingsvermenigvuldiger (0-3). Zet op 0 voor grijstinten |
| gamma | number | Nee | `1` | Gammacorrectie (0.1-10) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/video-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"brightness": 0.1, "contrast": 1.2, "saturation": 1.5}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12300000
}
```

## Notes {#notes}

- Alle waarden op hun standaardinstelling (brightness 0, contrast 1, saturation 1, gamma 1) geven geen wijziging.
- Het instellen van saturation op `0` zet de video om naar grijstinten.
- Gammawaarden onder 1 maken schaduwen lichter, terwijl waarden boven 1 ze donkerder maken.
