---
description: "Een videoclip achterstevoren afspelen."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: 8ea84a42a438
---

# Reverse Video {#reverse-video}

Speel een videoclip achterstevoren af. Ook het audiospoor wordt omgekeerd.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Accepteert multipart form data met een videobestand. Deze tool heeft geen instelbare opties.

## Parameters {#parameters}

Deze tool heeft geen parameters. Het keert de hele video om.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/reverse-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12600000
}
```

## Notes {#notes}

- Beperkt tot clips van maximaal 5 minuten. Langere video's worden afgewezen met een 400-fout.
- Zowel het beeld- als het audiospoor worden omgekeerd. Om video zonder audio om te keren, moet je hem eerst dempen.
