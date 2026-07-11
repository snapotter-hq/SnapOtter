---
description: "Keer een audiobestand om zodat het achterstevoren afspeelt."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 72b27748eb26
---

# Reverse Audio {#reverse-audio}

Keer een audiobestand om zodat het achterstevoren afspeelt.

## API-endpoint {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Accepteert multipart-formuliergegevens met een audiobestand en een JSON `settings`-veld.

## Parameters {#parameters}

Deze tool heeft geen configureerbare parameters. Het volledige audiobestand wordt omgekeerd.

## Voorbeeldverzoek {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
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

- Het volledige audiospoor wordt omgekeerd van eind naar begin.
- De uitvoer behoudt meestal de invoercontainer. AAC-invoer wordt geschreven als M4A, en niet-ondersteunde decode-only-invoer valt terug op MP3.
