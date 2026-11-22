---
description: "Selesaikan rumus tiga (rule of three), cari X dari tiga nilai yang diketahui."
i18n_source_hash: e0c21822bdae
i18n_provenance: machine
i18n_output_hash: 028cf7e793f7
i18n_hash_version: 2
---

# Proportion Calculator {#proportion-calculator}

Selesaikan rumus tiga (perkalian silang). Ketik tiga nilai, pilih langsung atau terbalik, dan dapatkan nilai keempat. Nilai tetap berada di formulir setelah setiap jawaban, sehingga Anda bisa mengubah satu angka dan menekan Enter untuk mencoba berikutnya.

Ini adalah penyelesai proporsi matematika, bukan grid komposisi foto aturan sepertiga.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/proportion-calculator`

Menerima body JSON, bukan multipart form data, dan menjawab dengan angka, bukan file untuk diunduh.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `a` | number | (wajib) | Nilai pertama yang diketahui. |
| `b` | number | (wajib) | Nilai yang berpasangan dengan `a`. |
| `c` | number | (wajib) | Nilai ketiga yang diketahui. X adalah nilai yang berpasangan dengannya. |
| `mode` | string | `direct` | `direct` atau `inverse`. |

| Mode | Reads as | Formula | Example |
|------|----------|---------|---------|
| `direct` | A terhadap B seperti C terhadap X | X = B × C ÷ A | 3 apel harganya 6, jadi 10 apel harganya 20 |
| `inverse` | A × B = C × X | X = A × B ÷ C | 4 pekerja butuh 6 hari, jadi 8 pekerja butuh 3 hari |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/proportion-calculator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"a": 3, "b": 6, "c": 10, "mode": "direct"}'
```

## Example Response {#example-response}

```json
{
  "mode": "direct",
  "x": 20
}
```

## Notes {#notes}

- Jawaban dibulatkan ke 15 digit signifikan, jadi `0.1 × 3 ÷ 3` menghasilkan `0.1`, bukan `0.10000000000000002`.
- `a` tidak boleh `0` pada proporsi langsung dan `c` tidak boleh `0` pada proporsi terbalik, karena masing-masing menjadi pembagi. Keduanya mengembalikan 400.
- Jawaban di luar rentang yang bisa ditampung double (di atas sekitar `1.8e308`, atau terlalu dekat ke nol hingga presisinya hilang) mengembalikan 400.
- Di aplikasi web Anda bisa mengetik `1,5` atau `1.5`, dan angka Arab-Indic atau Devanagari juga berfungsi. Pemisah ribuan tidak diterima.
