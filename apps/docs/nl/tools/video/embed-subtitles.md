---
description: "Een ondertitelspoor in de videocontainer muxen."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 2f03a1cf7a13
---

# Embed Subtitles {#embed-subtitles}

Mux een ondertitelbestand in de videocontainer als een soft ondertitelspoor dat kijkers kunnen in- of uitschakelen.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Accepteert multipart form data met een videobestand en een ondertitelbestand, plus een JSON-veld `settings`.

## Parameters {#parameters}

| Parameter | Type | Vereist | Standaard | Beschrijving |
|-----------|------|----------|---------|-------------|
| language | string | Nee | `"eng"` | ISO 639-2/B-taalcode (3 kleine letters, bijv. `"eng"`, `"fra"`, `"deu"`) |

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

- Upload twee bestanden: het eerste moet een video zijn, het tweede moet een ondertitelbestand zijn (.srt, .vtt of .ass).
- Ingebedde (soft) ondertitels kunnen door de kijker in hun mediaspeler worden in- en uitgeschakeld. Gebruik voor permanent zichtbare ondertitels in plaats daarvan de tool Burn Subtitles.
- De taalcode wordt als metadata in de container opgeslagen en helpt mediaspelers het ondertitelspoor te labelen.
