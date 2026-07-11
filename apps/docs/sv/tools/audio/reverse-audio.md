---
description: "Vänd en ljudfil så att den spelas baklänges."
i18n_source_hash: 5c2017661803
i18n_provenance: human
i18n_output_hash: 584487cec750
---

# Reverse Audio {#reverse-audio}

Vänd en ljudfil så att den spelas baklänges.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/reverse-audio`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Hela ljudfilen vänds.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/reverse-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3"
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

- Hela ljudspåret vänds från slut till början.
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
