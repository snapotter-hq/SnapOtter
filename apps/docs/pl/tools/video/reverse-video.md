---
description: "Odtwarzanie klipu wideo od tyłu."
i18n_source_hash: 98226f4e092d
i18n_provenance: human
i18n_output_hash: fe9a5e8c26e7
---

# Reverse Video {#reverse-video}

Odtwarza klip wideo od tyłu. Ścieżka audio również jest odwracana.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/reverse-video`

Przyjmuje dane formularza multipart z plikiem wideo. To narzędzie nie ma konfigurowalnych ustawień.

## Parameters {#parameters}

To narzędzie nie ma parametrów. Odwraca całe wideo.

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

- Ograniczone do klipów o długości do 5 minut. Dłuższe filmy są odrzucane z błędem 400.
- Odwracane są zarówno ścieżki wideo, jak i audio. Aby odwrócić wideo bez audio, najpierw je wycisz.
