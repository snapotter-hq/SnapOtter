---
description: "Mengonversi video antara MP4, MOV, WebM, AVI, dan MKV."
i18n_source_hash: 8f9e6418b1c6
i18n_provenance: human
i18n_output_hash: 964d81cde713
---

# Convert Video {#convert-video}

Mengonversi video antara format MP4, MOV, WebM, AVI, dan MKV dengan preset kualitas yang dapat dikonfigurasi.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-video`

Menerima multipart form data dengan file video dan field JSON `settings`. Ini adalah endpoint asinkron - ia langsung mengembalikan `202 Accepted` dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| format | string | No | `"mp4"` | Format keluaran: `mp4`, `mov`, `webm`, `avi`, `mkv` |
| quality | string | No | `"balanced"` | Preset kualitas: `high`, `balanced`, `small` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format": "webm", "quality": "balanced"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Preset kualitas `high` menghasilkan ketepatan visual terbaik tetapi file lebih besar. Preset `small` mengompresi secara agresif untuk ukuran file minimum.
- Keluaran WebM menggunakan enkoding VP9. MP4 dan MOV menggunakan H.264. AVI dan MKV tersedia untuk alur kerja lama atau pengarsipan.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
