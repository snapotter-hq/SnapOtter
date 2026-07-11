---
description: "Höj eller sänk ljudets tonhöjd med halvtoner utan att ändra hastigheten."
i18n_source_hash: 2804d0eeecc8
i18n_provenance: human
i18n_output_hash: f82647098fa7
---

# Pitch Shift {#pitch-shift}

Höj eller sänk tonhöjden i en ljudfil med ett antal halvtoner utan att ändra dess uppspelningshastighet.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/pitch-shift`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| semitones | integer | Nej | `3` | Halvtoner att skifta (-12 till 12). Måste vara skilt från noll. |

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/pitch-shift \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"semitones": -5}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Anteckningar {#notes}

- Positiva värden höjer tonhöjden; negativa värden sänker den.
- Ett skifte på 12 halvtoner motsvarar en oktav upp; -12 motsvarar en oktav ner.
- Uppspelningslängden förblir densamma oavsett skiftets storlek.
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
