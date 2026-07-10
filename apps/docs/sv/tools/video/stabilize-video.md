---
description: "Minska kameraskakningar med tvåpassstabilisering."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 1af0454b1d97
---

# Stabilisera video {#stabilize-video}

Minska kameraskakningar i handhållet material med FFmpegs tvåpass-vidstab-stabilisering.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| smoothing | integer | Nej | `15` | Storlek på utjämningsfönstret i bildrutor (5-60). Högre värden ger jämnare rörelse |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Stabilisering är en tvåpassprocess: det första passet analyserar kamerarörelsen och det andra passet tillämpar korrigeringen. Detta tar ungefär dubbelt så lång tid som enpassverktyg.
- Högre utjämningsvärden tar bort mer skakning men kan introducera en lätt zoom-beskärning vid kanterna.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
