---
description: "Rendrera undertexter permanent på videobildrutor."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: abeaacc1d1fc
---

# Bränn in undertexter {#burn-subtitles}

Rendrera (hårdkoda) permanent undertexter från en SRT-, VTT- eller ASS-fil på varje bildruta i en video.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Tar emot multipart-formulärdata med en videofil och en undertextfil. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| fontSize | integer | Nej | `24` | Teckenstorlek för undertext i pixlar (8-72) |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Ladda upp två filer: den första måste vara en video, den andra måste vara en undertextfil (.srt, .vtt eller .ass).
- Inbrända undertexter är permanent en del av videon och kan inte stängas av av tittaren. För undertexter som kan slås av och på, använd verktyget Bädda in undertexter i stället.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
