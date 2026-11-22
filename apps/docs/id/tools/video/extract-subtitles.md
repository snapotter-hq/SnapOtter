---
description: "Mengekstrak trek subtitle dari video sebagai file SRT, WebVTT, atau ASS."
i18n_source_hash: 5af4dad67936
i18n_provenance: machine
i18n_output_hash: 7255f52bd47f
i18n_hash_version: 2
---

# Extract Subtitles {#extract-subtitles}

Mengekstrak trek subtitle tersemat dari kontainer video dan mengunduhnya sebagai file SRT, WebVTT, atau ASS.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/extract-subtitles`

Menerima multipart form data dengan file video dan string JSON `settings` opsional.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `format` | string | `"srt"` | Format keluaran: `srt`, `vtt` (WebVTT), atau `ass` |

Trek subtitle pertama yang ditemukan di dalam kontainer video akan diekstrak.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/extract-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"format":"vtt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.vtt",
  "originalSize": 12500000,
  "processedSize": 4500
}
```

## Notes {#notes}

- Video harus berisi trek subtitle tersemat. Jika tidak ada trek subtitle yang ditemukan, permintaan akan mengembalikan galat 400.
- Jika video memiliki beberapa trek subtitle, yang pertama akan diekstrak.
- Trek teks (SubRip, ASS, mov_text, WebVTT) dapat dikonversi ke salah satu dari tiga format keluaran. Mengonversi trek ASS ke SRT atau WebVTT akan menghilangkan pengaturan posisi dan efeknya.
- Trek berbasis gambar (Blu-ray PGS, DVD VobSub) tidak dapat diubah menjadi teks tanpa OCR dan akan mengembalikan galat 422.
