---
description: "Buramkan latar belakang sambil menjaga subjek tetap tajam menggunakan AI."
i18n_source_hash: 9073f10e6e9d
i18n_provenance: human
i18n_output_hash: a952409ad00b
---

# Buramkan Latar Belakang {#blur-background}

Buramkan latar belakang gambar sambil menjaga subjek tetap tajam. Model AI mengisolasi subjek, menerapkan blur pada latar belakang asli, dan menggabungkan subjek tajam di atasnya.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/blur-background`

Menerima data formulir multipart dengan berkas gambar dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| intensity | integer | Tidak | `50` | Intensitas blur (1-100) |
| feather | integer | Tidak | `0` | Radius pelunakan tepi (0-20) |
| format | string | Tidak | `"png"` | Format keluaran: `png` atau `webp` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/blur-background \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"intensity": 75, "feather": 3}'
```

## Contoh Respons {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Lacak progres melalui SSE di `GET /api/v1/jobs/{jobId}/progress`. Ketika pekerjaan selesai, aliran SSE memancarkan peristiwa `completed` dengan URL unduhan.

## Catatan {#notes}

- Ini adalah alat bertenaga AI yang mengembalikan `202 Accepted` dan memproses secara asinkron. Sambungkan ke endpoint SSE untuk menerima pembaruan progres dan hasil akhir.
- Memerlukan bundel fitur **background-removal** untuk dipasang. Mengembalikan `501` jika bundel tidak tersedia.
- Nilai intensitas yang lebih tinggi menghasilkan efek blur yang lebih kuat. Nilai di atas 80 menciptakan pemisahan mirip bokeh yang jelas.
- Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
