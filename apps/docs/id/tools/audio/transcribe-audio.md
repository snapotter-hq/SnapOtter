---
description: "Ubah ucapan menjadi teks dengan transkripsi bertenaga AI."
i18n_source_hash: ae98c4c0aed2
i18n_provenance: human
i18n_output_hash: ed0acb2b52f0
---

# Transcribe Audio {#transcribe-audio}

Ubah ucapan menjadi teks menggunakan transkripsi bertenaga AI (faster-whisper). Mendukung format output teks biasa, SRT, dan VTT dengan pemilihan bahasa otomatis atau manual.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/audio/transcribe-audio`

Menerima multipart form data berisi file audio dan field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| language | string | No | `"auto"` | Bahasa: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| outputFormat | string | No | `"txt"` | Format output: `txt`, `srt`, `vtt` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/audio/transcribe-audio \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@audio.mp3" \
  -F 'settings={"language": "en", "outputFormat": "srt"}'
```

## Example Response {#example-response}

Ini adalah tool asinkron. API mengembalikan `202 Accepted` secara langsung:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Lacak progres melalui SSE di `GET /api/v1/jobs/{jobId}/progress`. Ketika pekerjaan selesai, aliran SSE mengirimkan hasil akhir dengan `downloadUrl`.

## Notes {#notes}

- Memerlukan feature bundle **transcription** untuk diinstal. Mengembalikan `501` dengan kode `FEATURE_NOT_INSTALLED`, `feature` yang hilang, `featureName`, dan `estimatedSize` jika bundle tidak tersedia.
- Menggunakan faster-whisper untuk transkripsi. Bahasa `auto` mendeteksi bahasa yang diucapkan secara otomatis.
- Format `srt` dan `vtt` menyertakan timestamp untuk setiap segmen, cocok untuk subtitle.
- Format `txt` mengembalikan teks biasa tanpa timestamp.
- Ini adalah tool AI yang berjalan lama; waktu pemrosesan bergantung pada panjang audio dan perangkat keras server.
