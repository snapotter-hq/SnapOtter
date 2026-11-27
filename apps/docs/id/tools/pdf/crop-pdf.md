---
description: "Pangkas semua halaman PDF dengan satu margin untuk setiap tepi, margin terpisah per tepi, atau ke sebuah area."
i18n_source_hash: 338ff7bb64e5
i18n_provenance: machine
i18n_output_hash: f47aaea2c784
i18n_hash_version: 2
---

# Crop PDF {#crop-pdf}

Pangkas semua halaman PDF dengan satu margin untuk setiap tepi, margin terpisah per tepi, atau ke sebuah area seperti label pengiriman yang dicetak di salah satu sudut lembar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/crop-pdf`

Menerima data form multipart berisi file PDF dan sebuah field JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `uniform` | `uniform`, `sides`, atau `region` |
| margin | number | No | `20` | Mode `uniform`: margin pemangkasan untuk setiap tepi dalam poin (0-2000) |
| top, right, bottom, left | number | No | `0` | Mode `sides`: margin pemangkasan untuk masing-masing tepi dalam poin (0-2000) |
| x, y | number | No | `0` | Mode `region`: posisi area dari tepi kiri dan atas halaman dalam poin |
| width, height | number | No | `288`, `432` | Mode `region`: ukuran area dalam poin (label 4x6 in) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"margin": 50}'
```

Pertahankan hanya label 4x6 in di sudut kiri atas setiap halaman:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/crop-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"mode": "region", "x": 0, "y": 0, "width": 288, "height": 432}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2440000
}
```

## Notes {#notes}

- Semua nilai dinyatakan dalam poin PDF (1 poin = 1/72 inci). Halaman US Letter berukuran 612 x 792 poin.
- Setiap mode hanya membaca field miliknya sendiri, sehingga permintaan yang hanya mengirim `margin` tetap berfungsi.
- Area diukur dari sudut kiri atas setiap halaman dan harus muat di dalam semua halaman. Margin harus menyisakan sebagian dari setiap halaman. Jika tidak, permintaan gagal dengan `400`.
- Pada halaman yang diatur untuk tampil dalam keadaan diputar, posisi dan tepi merujuk ke halaman sebagaimana ditampilkan, sehingga sudut kiri atas sebuah area adalah sudut kiri atas halaman yang diputar.
- Setiap mode mengukur dari media box penuh, jadi memangkas halaman yang sudah dipangkas akan dimulai ulang dari halaman penuh. Margin seragam sebesar `0` menampilkan seluruh media box.
