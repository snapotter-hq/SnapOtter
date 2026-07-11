---
description: "Mux sebuah trek subtitle ke dalam kontainer video."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: da795534962e
---

# Embed Subtitles {#embed-subtitles}

Mux sebuah file subtitle ke dalam kontainer video sebagai trek subtitle lunak yang dapat dinyalakan atau dimatikan oleh penonton.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Menerima multipart form data dengan file video dan file subtitle, ditambah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"eng"` | Kode bahasa ISO 639-2/B (3 huruf kecil, mis. `"eng"`, `"fra"`, `"deu"`) |

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

- Unggah dua file: yang pertama harus berupa video, yang kedua harus berupa file subtitle (.srt, .vtt, atau .ass).
- Subtitle tersemat (lunak) dapat dialihkan oleh penonton di pemutar media mereka. Untuk subtitle yang terlihat permanen, gunakan alat Burn Subtitles sebagai gantinya.
- Kode bahasa disimpan sebagai metadata di dalam kontainer dan membantu pemutar media melabeli trek subtitle.
