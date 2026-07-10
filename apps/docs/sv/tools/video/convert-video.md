---
description: "Konvertera videor mellan MP4, MOV, WebM, AVI och MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: b7978a51a1ab
---

# Konvertera video {#convert-video}

Konvertera videor mellan formaten MP4, MOV, WebM, AVI och MKV med konfigurerbara kvalitetsförinställningar.

## API-slutpunkt {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parametrar {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| format | string | Nej | `"mp4"` | Utdataformat: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | Nej | `"balanced"` | Kvalitetsförinställning: `high`, `balanced`, `small` |

## Exempelbegäran {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Exempelsvar {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Anteckningar {#notes}

- Kvalitetsförinställningen `high` ger bäst visuell trohet men större filer. Förinställningen `small` komprimerar aggressivt för minsta möjliga filstorlek.
- WebM-utdata använder VP9-kodning. MP4 och MOV använder H.264. AVI och MKV finns tillgängliga för äldre eller arkivbaserade arbetsflöden.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
