---
description: "Pembuat foto paspor dan ID bertenaga AI dengan deteksi wajah, penghapusan latar belakang, dan penataan lembar cetak."
i18n_source_hash: d4b4f4ced988
i18n_provenance: human
i18n_output_hash: e4dd75bbe828
---

# Passport Photo {#passport-photo}

Pembuat foto paspor dan ID bertenaga AI. Alur kerja dua fase: analisis (deteksi wajah + penghapusan latar belakang) lalu generasi (pemotongan, pengubahan ukuran, dan penataan untuk pencetakan).

## API Endpoints {#api-endpoints}

Alat ini menggunakan alur dua fase dengan endpoint terpisah untuk analisis dan generasi.

**Model bundles:** `background-removal` dan `face-detection`

---

### Phase 1: Analyze {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Mendeteksi landmark wajah dan menghapus latar belakang. Mengembalikan data landmark dan pratinjau agar frontend dapat menampilkan pratinjau pemotongan.

#### Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Berkas gambar (multipart) |
| clientJobId | string | No | - | ID job opsional untuk pelacakan progres via SSE |

#### Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/analyze \
  -F "file=@headshot.jpg"
```

#### Response (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "headshot.jpg",
  "preview": "<base64-encoded PNG>",
  "previewWidth": 800,
  "previewHeight": 1067,
  "landmarks": {
    "leftEye": { "x": 0.42, "y": 0.35 },
    "rightEye": { "x": 0.58, "y": 0.35 },
    "eyeCenter": { "x": 0.50, "y": 0.35 },
    "chin": { "x": 0.50, "y": 0.65 },
    "forehead": { "x": 0.50, "y": 0.22 },
    "crown": { "x": 0.50, "y": 0.18 },
    "nose": { "x": 0.50, "y": 0.48 },
    "faceCenterX": 0.50
  },
  "imageWidth": 2400,
  "imageHeight": 3200
}
```

#### Progress (SSE, optional) {#progress-sse-optional}

Jika `clientJobId` disediakan, progres dialirkan (0-30% untuk deteksi wajah, 30-95% untuk penghapusan latar belakang).

#### Error: No Face Detected (422) {#error-no-face-detected-422}

```json
{
  "error": "No face detected",
  "details": "Could not detect a face in the uploaded image. Please upload a clear, front-facing photo with good lighting."
}
```

---

### Phase 2: Generate {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Memotong, mengubah ukuran, dan secara opsional menata foto ke lembar cetak. Menggunakan gambar yang di-cache dari Fase 1 (tanpa menjalankan ulang AI).

#### Parameters (JSON body) {#parameters-json-body}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| jobId | string | Yes | - | ID job dari Fase 1 |
| filename | string | Yes | - | Nama berkas asli dari Fase 1 |
| countryCode | string | Yes | - | Kode negara untuk spesifikasi paspor (mis., `US`, `GB`, `IN`) |
| documentType | string | No | `"passport"` | Jenis dokumen (dari spesifikasi negara) |
| bgColor | string | No | `"#FFFFFF"` | Warna latar belakang hex |
| printLayout | string | No | `"none"` | Tata letak kertas cetak: `none`, `4x6`, `a4` |
| maxFileSizeKb | number | No | `0` | Batasan ukuran berkas maksimum dalam KB (0 = tanpa batas) |
| dpi | number | No | `300` | DPI output (72-1200) |
| customWidthMm | number | No | - | Lebar foto kustom dalam mm (menimpa spesifikasi negara) |
| customHeightMm | number | No | - | Tinggi foto kustom dalam mm (menimpa spesifikasi negara) |
| zoom | number | No | `1` | Faktor zoom (0.5-3). Nilai > 1 memotong lebih ketat |
| adjustX | number | No | `0` | Penyesuaian posisi horizontal |
| adjustY | number | No | `0` | Penyesuaian posisi vertikal |
| landmarks | object | Yes | - | Objek landmark dari respons Fase 1 |
| imageWidth | number | Yes | - | Lebar gambar dari respons Fase 1 |
| imageHeight | number | Yes | - | Tinggi gambar dari respons Fase 1 |

#### Example Request {#example-request-1}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/passport-photo/generate \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "a1b2c3d4-...",
    "filename": "headshot.jpg",
    "countryCode": "US",
    "documentType": "passport",
    "bgColor": "#FFFFFF",
    "printLayout": "4x6",
    "dpi": 300,
    "zoom": 1,
    "adjustX": 0,
    "adjustY": 0,
    "landmarks": { "leftEye": {"x":0.42,"y":0.35}, "rightEye": {"x":0.58,"y":0.35}, "eyeCenter": {"x":0.50,"y":0.35}, "chin": {"x":0.50,"y":0.65}, "forehead": {"x":0.50,"y":0.22}, "crown": {"x":0.50,"y":0.18}, "nose": {"x":0.50,"y":0.48}, "faceCenterX": 0.50 },
    "imageWidth": 2400,
    "imageHeight": 3200
  }'
```

#### Response (200 OK) {#response-200-ok-1}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/headshot_passport.jpg",
  "dimensions": {
    "widthMm": 51,
    "heightMm": 51,
    "widthPx": 602,
    "heightPx": 602,
    "dpi": 300
  },
  "spec": {
    "country": "United States",
    "countryCode": "US",
    "documentType": "passport",
    "documentLabel": "Passport"
  },
  "printDownloadUrl": "/api/v1/download/{jobId}/headshot_passport_print_4x6.jpg"
}
```

---

### Base Route {#base-route}

`POST /api/v1/tools/image/passport-photo`

Mengembalikan panduan untuk menggunakan sub-endpoint yang benar.

```json
{
  "error": "Use /api/v1/tools/image/passport-photo/analyze or /generate"
}
```

## Notes {#notes}

- Membutuhkan model bundle `background-removal` dan `face-detection` terpasang.
- Fase 1 menjalankan AI (landmark wajah + penghapusan latar belakang) dan meng-cache hasilnya. Fase 2 adalah manipulasi gambar Sharp murni (cepat, tanpa perlu AI).
- Landmark dikembalikan sebagai koordinat ternormalisasi (rentang 0-1 relatif terhadap dimensi gambar).
- Field `preview` dalam respons analisis adalah PNG yang di-encode base64 (maks lebar 800px) untuk tampilan cepat.
- Spesifikasi negara mencakup dimensi dokumen, rasio tinggi kepala, dan penempatan garis mata berdasarkan persyaratan foto paspor resmi.
- Opsi `printLayout` menghasilkan lembar yang ditata pada kertas 4x6\" atau A4 dengan gutter 2mm di antara foto.
- Saat `maxFileSizeKb` diatur, output dikompresi secara iteratif agar pas dalam batas ukuran.
