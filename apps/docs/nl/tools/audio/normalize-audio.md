---
description: "Egaliseer luidheid tot broadcast-standaardniveaus (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: 1e577bbf068e
---

# Normalize Audio {#normalize-audio}

Egaliseer audioluidheid tot broadcast-standaardniveaus met EBU R128-normalisatie (-16 LUFS).

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

Deze tool heeft geen configureerbare parameters. Het past automatisch EBU R128-luidheidsnormalisatie toe.

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
```

## Voorbeeldrespons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/audio.mp3",
  "originalSize": 4500000,
  "processedSize": 4500000
}
```

## Opmerkingen {#notes}

- Gebruikt de EBU R128-luidheidsstandaard, met -16 LUFS als doel.
- Ideaal voor podcasts, audioboeken en broadcast-content waar consistente luidheid belangrijk is.
- De samplefrequentie van de bron blijft behouden in de uitvoer.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
