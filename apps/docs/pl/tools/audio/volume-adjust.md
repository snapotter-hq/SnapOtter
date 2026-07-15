---
description: "Zwiększa lub zmniejsza głośność audio o stałe wzmocnienie w decybelach."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 4d06574f6787
---

# Regulacja głośności {#volume-adjust}

Zwiększa lub zmniejsza głośność pliku audio, stosując stałe wzmocnienie w decybelach.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Przyjmuje dane formularza multipart z plikiem audio oraz polem JSON `settings`.

## Parameters {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| gainDb | number | Nie | `3` | Regulacja głośności w decybelach (od -30 do 30) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/volume-adjust \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"gainDb": 6}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Notes {#notes}

- Wartości dodatnie zwiększają głośność; wartości ujemne ją zmniejszają.
- Duże dodatnie wzmocnienia mogą powodować przesterowanie. Użyj normalize-audio, aby bezpiecznie wyrównać głośność.
- Wynik zwykle zachowuje kontener wejściowy. Wejście AAC jest zapisywane jako M4A, a nieobsługiwane wejścia tylko do dekodowania są zapisywane jako MP3.
