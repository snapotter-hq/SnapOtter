---
description: "Generera undertextfiler från videons ljudspår med AI."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: e073c48141c0
---

# Auto Subtitles {#auto-subtitles}

Generera undertextfiler från en videos ljudspår med AI-driven taligenkänning (faster-whisper). Stöder automatisk igenkänning och 10 uttryckliga språk.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Tar emot multipart-formulärdata med en videofil och ett JSON-fält `settings`. Detta är en asynkron slutpunkt - den returnerar `202 Accepted` omedelbart och förloppet strömmas via SSE på `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Typ | Obligatorisk | Standard | Beskrivning |
|-----------|------|----------|---------|-------------|
| language | string | Nej | `"auto"` | Talat språk: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | Nej | `"srt"` | Utdataformat för undertext: `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/auto-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"language": "en", "format": "srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Detta är ett AI-verktyg som kräver att funktionspaketet **transcription** är installerat. Om paketet inte är installerat returnerar API:et `501 Feature Not Installed` med instruktioner om hur du installerar det via administratörsgränssnittet.
- Språkalternativet `auto` använder whispers inbyggda språkigenkänning. Att ange språket uttryckligen förbättrar träffsäkerheten och hastigheten.
- SRT är det bredast stödda undertextformatet. VTT (WebVTT) är standarden för webbvideospelare.
- Förloppsuppdateringar finns tillgängliga via SSE på `GET /api/v1/jobs/{jobId}/progress` tills jobbet är klart.
