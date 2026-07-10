---
description: "Hasilkan file subtitle dari trek audio video menggunakan AI."
i18n_source_hash: 35b1e78501ad
i18n_provenance: human
i18n_output_hash: 872aa84c28d0
---

# Auto Subtitles {#auto-subtitles}

Hasilkan file subtitle dari trek audio video menggunakan pengenalan suara bertenaga AI (faster-whisper). Mendukung deteksi otomatis dan 10 bahasa eksplisit.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/auto-subtitles`

Menerima data form multipart berisi file video dan sebuah field JSON `settings`. Ini adalah endpoint async - ia mengembalikan `202 Accepted` segera dan progres dialirkan melalui SSE di `GET /api/v1/jobs/{jobId}/progress`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Bahasa ucapan: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| format | string | No | `"srt"` | Format subtitle output: `srt`, `vtt` |

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

- Ini adalah alat AI yang membutuhkan feature bundle **transcription** untuk terpasang. Jika bundle tidak terpasang, API mengembalikan `501 Feature Not Installed` dengan instruksi untuk memasangnya melalui UI admin.
- Opsi bahasa `auto` menggunakan deteksi bahasa bawaan whisper. Menentukan bahasa secara eksplisit meningkatkan akurasi dan kecepatan.
- SRT adalah format subtitle yang paling banyak didukung. VTT (WebVTT) adalah standar untuk pemutar video web.
- Pembaruan progres tersedia melalui SSE di `GET /api/v1/jobs/{jobId}/progress` hingga job selesai.
