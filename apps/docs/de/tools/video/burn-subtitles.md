---
description: "Untertitel dauerhaft in Videoframes einbrennen."
i18n_source_hash: 2d3111589db0
i18n_provenance: human
i18n_output_hash: bd82fdfa0130
---

# Burn Subtitles {#burn-subtitles}

Untertitel aus einer SRT-, VTT- oder ASS-Datei dauerhaft (fest kodiert) in jeden Frame eines Videos einbrennen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/burn-subtitles`

Nimmt Multipart-Formulardaten mit einer Videodatei und einer Untertiteldatei entgegen. Dies ist ein asynchroner Endpunkt: Er gibt sofort `202 Accepted` zurück, und der Fortschritt wird per SSE unter `GET /api/v1/jobs/{jobId}/progress` gestreamt.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| fontSize | integer | No | `24` | Schriftgröße der Untertitel in Pixeln (8-72) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/burn-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"fontSize": 28}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Laden Sie zwei Dateien hoch: Die erste muss ein Video sein, die zweite eine Untertiteldatei (.srt, .vtt oder .ass).
- Eingebrannte Untertitel sind dauerhaft Teil des Videos und können vom Betrachter nicht ausgeschaltet werden. Für umschaltbare Untertitel verwenden Sie stattdessen das Tool Embed Subtitles.
- Fortschrittsaktualisierungen sind per SSE unter `GET /api/v1/jobs/{jobId}/progress` verfügbar, bis der Job abgeschlossen ist.
