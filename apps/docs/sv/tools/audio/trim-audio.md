---
description: "Klipp ut ett avsnitt ur en ljudfil genom att ange start- och sluttider."
i18n_source_hash: f8d0b6a84592
i18n_provenance: machine
i18n_output_hash: 466c7be459b7
i18n_hash_version: 2
---

# Trim Audio {#trim-audio}

Klipp ut ett avsnitt ur en ljudfil. Behåll antingen delen mellan en start- och sluttid, eller klipp bort en fast tid i början och slutet.

I appen tar tidsfälten vanliga sekunder (`90`), `MM:SS` (`1:30`) eller `HH:MM:SS` (`1:02:03.5`). API:et tar sekunder.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/trim-audio`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `range` | `range` behåller `startS` till `endS`. `ends` tar bort `cutStartS` från början och `cutEndS` från slutet |
| startS | number | No | `0` | Intervallläge: starttid i sekunder (minst 0) |
| endS | number | Range mode | - | Intervallläge: sluttid i sekunder (måste vara efter start) |
| cutStartS | number | No | `0` | Ändläge: sekunder att ta bort från början |
| cutEndS | number | No | `0` | Ändläge: sekunder att ta bort från slutet |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"startS": 10, "endS": 45}'
```

Klipp bort de första 2 sekunderna och de sista 3 sekunderna, oavsett filens längd:

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/trim-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"mode": "ends", "cutStartS": 2, "cutEndS": 3}'
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
- I intervallläge måste `endS` vara större än `startS`. Om `endS` överstiger ljudets varaktighet trimmas filen till slutet.
- I ändläge måste minst en av `cutStartS` och `cutEndS` vara större än noll, och tillsammans måste de lämna kvar minst 0,1 sekunder ljud. Eftersom klippet mäts från varje fils egen längd fungerar en inställning för en hel batch av filer med olika varaktighet.
- Utdata behåller vanligtvis samma container som indata. AAC-indata skrivs som M4A, och indata som endast går att avkoda men inte stöds faller tillbaka till MP3.
