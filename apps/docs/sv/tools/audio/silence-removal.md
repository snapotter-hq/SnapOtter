---
description: "Ta bort tysta avsnitt från en ljudfil."
i18n_source_hash: a7624fc99b50
i18n_provenance: human
i18n_output_hash: b73b5b388edd
---

# Silence Removal {#silence-removal}

Identifiera och ta bort tysta avsnitt från en ljudfil baserat på ett konfigurerbart tröskelvärde och en minsta varaktighet.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/silence-removal`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| thresholdDb | number | No | `-50` | Tystnadströskel i dB (-80 till -20). Ljud under denna nivå betraktas som tystnad. |
| minSilenceS | number | No | `0.5` | Minsta tystnadsvaraktighet i sekunder att ta bort (0,1 till 5) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/silence-removal \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"thresholdDb": -45, "minSilenceS": 1}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 3200000
}
```

## Notes {#notes}

- Ett högre (mindre negativt) tröskelvärde är mer aggressivt och tar bort tystare partier likaväl som ren tystnad.
- Öka `minSilenceS` för att bara ta bort längre pauser samtidigt som korta naturliga mellanrum behålls.
- Användbart för att städa upp poddinspelningar, föreläsningar och röstmemon.
- Utdata behåller vanligtvis samma container som indata. AAC-indata skrivs som M4A, och indata som endast går att avkoda men inte stöds faller tillbaka till MP3.
