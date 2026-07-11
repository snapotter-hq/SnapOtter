---
description: "Foga samman flera videoklipp till en fil."
i18n_source_hash: 90463dfbb580
i18n_provenance: human
i18n_output_hash: 9b8587705ebe
---

# Slå samman videor {#merge-videos}

Foga samman flera videoklipp till en enda MP4-fil. Alla indata normaliseras till den första videons upplösning och 30 fps.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/merge-videos`

Tar emot multipart-formulärdata med två eller fler videofiler. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parametrar {#parameters}

Detta verktyg har inga inställningsparametrar. Ladda upp 2-10 videofiler som flera `file`-delar.

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/merge-videos \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@intro.mp4" \
  -F "file=@main.mp4" \
  -F "file=@outro.mp4"
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Klipp sammanfogas i den ordning de laddas upp.
- Alla klipp omkodas för att matcha det första klippets upplösning, bildhastighet (30 fps) och codec (H.264). Indata som inte matchar normaliseras automatiskt.
- Tar emot 2-10 videofiler per begäran.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
