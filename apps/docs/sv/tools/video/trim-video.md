---
description: "Klipp ut ett klipp ur en video genom att ange start- och sluttider."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: dae64b45da92
i18n_hash_version: 2
---

# Trimma video {#trim-video}

Klipp ut ett klipp ur en video. Behåll antingen delen mellan en start- och sluttid, eller klipp bort en fast mängd i början och slutet. Det finns ett alternativ för bildruteexakta klipp.

I appen tar tidsfälten vanliga sekunder (`90`), `MM:SS` (`1:30`) eller `HH:MM:SS` (`1:02:03.5`). API:et tar sekunder.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| mode | string | Nej | `range` | `range` behåller `startS` till `endS`. `ends` tar bort `cutStartS` från början och `cutEndS` från slutet |
| startS | number | Nej | `0` | Intervallläge: starttid i sekunder (måste vara >= 0) |
| endS | number | Intervallläge | - | Intervallläge: sluttid i sekunder (måste vara efter startS) |
| cutStartS | number | Nej | `0` | Slutläge: sekunder att ta bort från början |
| cutEndS | number | Nej | `0` | Slutläge: sekunder att ta bort från slutet |
| precise | boolean | Nej | `false` | Koda om hela intervallet så att både start och slut blir bildruteexakta, i stället för att kopiera från nästa nyckelbild |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Klipp bort de första 5 sekunderna och de sista 10 sekunderna, oavsett videons längd:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Anteckningar {#notes}

- När `precise` är `false` (standardvärdet) börjar klippet på exakt den bildruta du bad om. Bara bildrutorna mellan den starten och nästa nyckelbild kodas om, och resten kopieras, så det går fortfarande snabbt. Slutet kan bli en bildruta eller så för långt, eftersom en kopierad ström behåller de bildrutor som tidigare bildrutor är beroende av. Källor som inte går att skarva säkert (H.264 som är 10-bitars eller interlaced, andra codecs som kräver en omkodad start, eller AVI-, FLV-, MPEG- och TS-filer) kodas i stället om i sin helhet.
- Att sätta `precise` till `true` kodar alltid om hela intervallet, så båda ändarna blir exakta, men det tar längre tid.
- I intervalläge måste `endS` vara större än `startS`. Om `endS` ligger efter videons slut löper klippet till slutet.
- I slutläge måste minst en av `cutStartS` och `cutEndS` vara över noll, och tillsammans måste de lämna kvar en del av videon. Eftersom klippet mäts från varje fils egen längd fungerar en inställning för ett parti videor med olika längd.
