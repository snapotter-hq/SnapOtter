---
description: "Ubah ukuran, optimalkan, ubah kecepatan, balik, putar, dan ekstrak frame dari GIF beranimasi dalam satu alat."
i18n_source_hash: 5e525e80db92
i18n_provenance: human
i18n_output_hash: eda9be0ce6e7
---

# GIF Tools {#gif-tools}

Ubah ukuran, optimalkan, ubah kecepatan, balik, ekstrak frame, dan putar GIF beranimasi. Menyediakan beberapa mode operasi dalam satu alat.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/gif-tools`

## Parameters {#parameters}

### Common Parameters {#common-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"resize"` | Mode operasi: `resize`, `optimize`, `speed`, `reverse`, `extract`, `rotate` |
| loop | number | No | 0 | Jumlah loop untuk GIF output (0 = tak terbatas, 1-100 = loop terbatas) |

### Resize Mode Parameters {#resize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| width | integer | No | - | Lebar target dalam piksel (1 hingga 16384) |
| height | integer | No | - | Tinggi target dalam piksel (1 hingga 16384) |
| percentage | number | No | - | Skala berdasarkan persentase (1 hingga 500). Mengesampingkan width/height bila diatur. |

### Optimize Mode Parameters {#optimize-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| colors | number | No | 256 | Jumlah warna maksimum dalam palet (2 hingga 256) |
| dither | number | No | 1.0 | Kekuatan dithering (0 hingga 1, di mana 0 menonaktifkan dithering) |
| effort | number | No | 7 | Tingkat upaya optimasi (1 hingga 10, lebih tinggi = lebih lambat tetapi lebih kecil) |

### Speed Mode Parameters {#speed-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| speedFactor | number | No | 1.0 | Pengali kecepatan (0.1 hingga 10). Nilai > 1 mempercepat, < 1 memperlambat. |

### Extract Mode Parameters {#extract-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| extractMode | string | No | `"single"` | Mode ekstraksi: `single`, `range`, `all` |
| frameNumber | number | No | 0 | Indeks frame yang akan diekstrak dalam mode `single` (berbasis 0) |
| frameStart | number | No | 0 | Indeks frame awal untuk mode `range` (berbasis 0) |
| frameEnd | number | No | - | Indeks frame akhir untuk mode `range` (berbasis 0, inklusif) |
| extractFormat | string | No | `"png"` | Format untuk frame yang diekstrak: `png`, `webp` |

### Rotate Mode Parameters {#rotate-mode-parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| angle | number | No | - | Sudut rotasi: `90`, `180`, atau `270` derajat |
| flipH | boolean | No | `false` | Balik horizontal |
| flipV | boolean | No | `false` | Balik vertikal |

## Example Requests {#example-requests}

### Resize {#resize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"resize","percentage":50}'
```

### Optimize {#optimize}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@large.gif" \
  -F 'settings={"mode":"optimize","colors":128,"effort":9}'
```

### Speed Up {#speed-up}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"speed","speedFactor":2.0}'
```

### Extract Single Frame {#extract-single-frame}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools \
  -F "file=@animation.gif" \
  -F 'settings={"mode":"extract","extractMode":"single","frameNumber":5,"extractFormat":"png"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.gif",
  "originalSize": 2345678,
  "processedSize": 1234567
}
```

## Info Sub-Route {#info-sub-route}

`POST /api/v1/tools/image/gif-tools/info`

Mengembalikan metadata tentang GIF beranimasi tanpa memprosesnya.

### Info Request {#info-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-tools/info \
  -F "file=@animation.gif"
```

### Info Response {#info-response}

```json
{
  "width": 480,
  "height": 320,
  "pages": 24,
  "delay": [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
  "loop": 0,
  "fileSize": 2345678,
  "duration": 2400
}
```

## Notes {#notes}

- Menggunakan factory `createToolRoute` standar untuk endpoint pemrosesan utama.
- Endpoint info hanya memerlukan unggahan file (tidak perlu pengaturan).
- Dalam mode `resize`, bila `percentage` disediakan, ia diprioritaskan di atas `width`/`height`. Pengubahan ukuran menggunakan `fit: inside` untuk mempertahankan rasio aspek.
- Dalam mode `speed`, delay frame dibagi dengan faktor kecepatan. Delay minimum per frame adalah 20ms (batasan spesifikasi GIF).
- Dalam mode `reverse`, parameter `speedFactor` juga tersedia untuk menyesuaikan kecepatan sekaligus membalik.
- Dalam mode `extract` dengan `range` atau `all`, output berupa file ZIP yang berisi frame-frame individual.
- Dalam mode `rotate`, setiap frame diproses secara individual dan dirakit ulang menjadi animasi.
- Parameter `loop` mengontrol berapa kali GIF output berputar. Gunakan 0 untuk perulangan tak terbatas.
- Field `duration` dalam respons info adalah total durasi animasi dalam milidetik.
