---
description: "Versnel of vertraag audioweergave met een vermenigvuldiger."
i18n_source_hash: e39ba662e594
i18n_provenance: human
i18n_output_hash: e12f8459ba08
---

# Audio Speed {#audio-speed}

Versnel of vertraag audioweergave door een snelheidsvermenigvuldiger toe te passen.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/audio-speed`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| factor | number | Nee | `1.5` | Snelheidsvermenigvuldiger (0,25 tot 4). Waarden onder 1 vertragen; boven 1 versnellen. |

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/audio-speed \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"factor": 2}'
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 2250000
}
```

## Opmerkingen {#notes}

- Een factor van `0.25` speelt af op een kwart van de snelheid (4x langer). Een factor van `4` speelt af op viervoudige snelheid (4x korter).
- De toonhoogte blijft behouden terwijl de snelheid verandert (time-stretch). Gebruik pitch-shift om de toonhoogte onafhankelijk aan te passen.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
