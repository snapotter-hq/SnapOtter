---
description: "Eine Untertitelspur in den Videocontainer muxen."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: bf8b16e90b55
---

# Embed Subtitles {#embed-subtitles}

Eine Untertiteldatei als weiche Untertitelspur in den Videocontainer muxen, die Betrachter ein- oder ausschalten können.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Nimmt Multipart-Formulardaten mit einer Videodatei und einer Untertiteldatei sowie einem JSON-Feld `settings` entgegen.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | ISO 639-2/B-Sprachcode (3 Kleinbuchstaben, z. B. `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Laden Sie zwei Dateien hoch: Die erste muss ein Video sein, die zweite eine Untertiteldatei (.srt, .vtt oder .ass).
- Eingebettete (weiche) Untertitel können vom Betrachter in seinem Media-Player umgeschaltet werden. Für dauerhaft sichtbare Untertitel verwenden Sie stattdessen das Tool Burn Subtitles.
- Der Sprachcode wird als Metadaten im Container gespeichert und hilft Media-Playern, die Untertitelspur zu kennzeichnen.
