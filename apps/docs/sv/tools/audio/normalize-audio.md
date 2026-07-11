---
description: "Jämna ut ljudstyrkan till nivåer enligt sändningsstandard (EBU R128)."
i18n_source_hash: 794d8cfa5ad8
i18n_provenance: human
i18n_output_hash: feecc7e633fa
---

# Normalize Audio {#normalize-audio}

Jämna ut ljudstyrkan till nivåer enligt sändningsstandard med EBU R128-normalisering (-16 LUFS).

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/audio/normalize-audio`

Accepterar multipart-formulärdata med en ljudfil och ett JSON `settings`-fält.

## Parametrar {#parameters}

Detta verktyg har inga konfigurerbara parametrar. Det tillämpar EBU R128-ljudstyrkenormalisering automatiskt.

## Exempelförfrågan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/normalize-audio \
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

- Använder ljudstyrkestandarden EBU R128, med målet -16 LUFS.
- Idealisk för poddar, ljudböcker och sändningsinnehåll där konsekvent ljudstyrka är viktig.
- Källans samplingsfrekvens bevaras i utdata.
- Utdata behåller vanligtvis inmatningens container. AAC-inmatning skrivs som M4A, och inmatningar som endast kan avkodas och inte stöds faller tillbaka till MP3.
