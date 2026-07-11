---
description: "Ganti latar belakang gambar dengan warna solid atau gradien menggunakan AI."
i18n_source_hash: 930fe8890e55
i18n_provenance: human
i18n_output_hash: 1aa421bb864f
---

# Ganti Latar Belakang {#background-replace}

Ganti latar belakang gambar dengan warna solid atau gradien. Model AI mendeteksi subjek, menghapus latar belakang asli, dan menggabungkan subjek ke latar belakang pilihan Anda.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/background-replace`

Menerima data formulir multipart dengan berkas gambar dan bidang JSON `settings`.

## Parameter {#parameters}

| Parameter | Tipe | Wajib | Bawaan | Deskripsi |
|-----------|------|----------|---------|-------------|
| backgroundType | string | Tidak | `"color"` | Mode latar belakang: `color` atau `gradient` |
| color | string | Tidak | `"#ffffff"` | Warna hex latar belakang (ketika backgroundType bernilai `color`) |
| gradientColor1 | string | Tidak | - | Warna hex gradien pertama |
| gradientColor2 | string | Tidak | - | Warna hex gradien kedua |
| gradientAngle | integer | Tidak | `180` | Sudut gradien dalam derajat (0-360) |
| feather | integer | Tidak | `0` | Radius pelunakan tepi (0-20) |
| format | string | Tidak | `"png"` | Format keluaran: `png` atau `webp` |

## Contoh Permintaan {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/background-replace \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"backgroundType": "color", "color": "#2563eb", "feather": 2}'
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
- Input HEIC, RAW, PSD, dan SVG didekode secara otomatis sebelum diproses.
- Keluaran bawaan ke PNG untuk mempertahankan transparansi di sekitar subjek.
