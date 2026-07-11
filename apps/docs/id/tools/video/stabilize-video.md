---
description: "Mengurangi guncangan kamera dengan stabilisasi dua-lintasan."
i18n_source_hash: ec908e91a752
i18n_provenance: human
i18n_output_hash: 74980e750521
---

# Stabilize Video {#stabilize-video}

Mengurangi guncangan kamera pada rekaman genggam menggunakan stabilisasi vidstab dua-lintasan dari FFmpeg.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/stabilize-video`

Menerima multipart form data dengan file video dan field JSON `settings`. Ini adalah endpoint asinkron - ia langsung mengembalikan `202 Accepted` dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| smoothing | integer | No | `15` | Ukuran jendela penghalusan dalam frame (5-60). Nilai lebih tinggi menghasilkan gerak lebih mulus |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/stabilize-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"smoothing": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Stabilisasi adalah proses dua-lintasan: lintasan pertama menganalisis gerakan kamera, dan lintasan kedua menerapkan koreksinya. Ini memakan waktu kira-kira dua kali lebih lama daripada alat satu-lintasan.
- Nilai penghalusan lebih tinggi menghilangkan lebih banyak guncangan tetapi dapat menimbulkan sedikit zoom crop di tepian.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
