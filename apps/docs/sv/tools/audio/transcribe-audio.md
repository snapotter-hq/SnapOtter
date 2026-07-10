---
description: "Omvandla tal till text med AI-driven transkribering."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: 2c0cc1fc4468
---

# Transcribe Audio {#transcribe-audio}

Omvandla tal till text med AI-driven transkribering (faster-whisper). Stöder utdataformaten oformaterad text, SRT och VTT med automatiskt eller manuellt språkval.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Tar emot multipart-formulärdata med en ljudfil och ett JSON-fält `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Språk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Utdataformat: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Detta är ett asynkront verktyg. API:et returnerar `202 Accepted` omedelbart:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Följ förloppet via SSE på `GET /api/v1/jobs/{jobId}/progress`. När jobbet är klart levererar SSE-strömmen det slutliga resultatet med en `downloadUrl`.

## Notes {#notes}

- Kräver att funktionspaketet **transcription** är installerat. Returnerar `501` med koden `FEATURE_NOT_INSTALLED`, det saknade `feature`, `featureName` och `estimatedSize` om paketet inte är tillgängligt.
- Använder faster-whisper för transkribering. Språket `auto` identifierar det talade språket automatiskt.
- Formaten `srt` och `vtt` innehåller tidsstämplar för varje segment, lämpliga för undertexter.
- Formatet `txt` returnerar oformaterad text utan tidsstämplar.
- Detta är ett långkörande AI-verktyg; bearbetningstiden beror på ljudets längd och serverns hårdvara.
