---
description: "Öka eller minska ljudvolymen med en fast förstärkning i decibel."
i18n_source_hash: 4bc993fd4e08
i18n_provenance: human
i18n_output_hash: 45d6cfb545cc
---

# Justera volym {#volume-adjust}

Öka eller minska volymen på en ljudfil genom att tillämpa en fast förstärkning i decibel.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/volume-adjust`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| gainDb | number | No | `3` | Volymjustering i decibel (-30 till 30) |

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

- Positiva värden ökar volymen; negativa värden minskar den.
- Stora positiva förstärkningar kan orsaka klippning. Använd normalize-audio för nivåjustering som är säker för ljudstyrkan.
- Utdata behåller vanligtvis samma container som indata. AAC-indata skrivs som M4A, och indata som endast går att avkoda men inte stöds faller tillbaka till MP3.
