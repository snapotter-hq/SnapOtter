---
description: "Konversi file subtitle antara SRT, WebVTT, dan ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 393efc4fb825
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

Konversi file subtitle antara SRT, WebVTT, dan ASS. Waktu dan teks terbawa, tetapi posisi dan efek ASS tidak.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Menerima multipart form data berisi satu file subtitle (`.srt`, `.vtt`, atau `.ass`) dan field JSON `settings` opsional.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Format output: `srt`, `vtt`, atau `ass` |
| `encoding` | string | `"auto"` | Encoding teks input: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis`, atau `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- Konversi dari ASS mempertahankan waktu, teks dialog, dan pemformatan dasar yang bisa ditampung format tujuan: SRT mempertahankan miring, tebal, warna, dan ukuran font sebagai tag, sedangkan WebVTT mempertahankan miring, tebal, dan garis bawah. Posisi di layar, animasi, dan efek ASS lainnya dibuang.
- Output selalu UTF-8. Dengan `encoding` diatur ke `auto`, file yang berupa UTF-8 valid dibaca apa adanya dan selain itu dibaca sebagai Windows-1252, encoding yang lazim untuk file SRT Eropa Barat lama. Jika karakter beraksen atau non-Latin tampil rusak, atur `encoding` ke encoding sebenarnya dari file tersebut (misalnya `gb18030` untuk Tionghoa Sederhana atau `windows-1251` untuk Sirilik).
- Unggahan subtitle dibatasi 1 MB secara default. Naikkan atau hapus batas ini dengan `MAX_SUBTITLE_SIZE_MB`.
