---
description: "Klipp ut ett avsnitt ur en ljudfil genom att ange start- och sluttider."
i18n_source_hash: 8b80c5c8a711
i18n_provenance: human
i18n_output_hash: 1770fa7c239a
---

# Trim Audio {#trim-audio}

Klipp ut ett avsnitt ur en ljudfil genom att ange start- och sluttider i sekunder.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| startS | number | No | `0` | Starttid i sekunder (minst 0) |
| endS | number | Yes | - | Sluttid i sekunder (måste vara efter start) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 1575000
}
```

## Notes {#notes}

- Tider anges i sekunder och kan innehålla decimaler (t.ex. `10.5`).
- Värdet `endS` måste vara större än `startS`.
- Om `endS` överstiger ljudets varaktighet trimmas filen till slutet.
- Utdata behåller vanligtvis samma container som indata. AAC-indata skrivs som M4A, och indata som endast går att avkoda men inte stöds faller tillbaka till MP3.
