---
description: "Generuj kody QR z niestandardowymi kolorami i poziomami korekcji błędów."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: d9030f17e1ca
---

# Generator kodów QR {#qr-code-generator}

Generuj obrazy kodów QR z tekstu lub adresów URL z konfigurowalnym rozmiarem, poziomem korekcji błędów oraz niestandardowymi kolorami pierwszego planu i tła.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Przyjmuje **treść JSON** (nie multipart). Nie jest potrzebne przesyłanie pliku.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| text | string | Tak | - | Treść do zakodowania w kodzie QR (od 1 do 2000 znaków) |
| size | number | Nie | `400` | Szerokość/wysokość obrazu wynikowego w pikselach (100 do 10000) |
| errorCorrection | string | Nie | `"M"` | Poziom korekcji błędów: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | Nie | `"#000000"` | Kolor pierwszego planu/modułów kodu QR w hex (`#RRGGBB`) |
| background | string | Nie | `"#FFFFFF"` | Kolor tła kodu QR w hex (`#RRGGBB`) |
| logoDataUri | string | Nie | - | Obraz logo jako data URI (`data:image/png;base64,...` lub `data:image/jpeg;base64,...`, maks. 700 KB). Wyśrodkowany na kodzie QR na 22% jego rozmiaru. Wymusza korekcję błędów na `H` |

### Poziomy korekcji błędów {#error-correction-levels}

| Poziom | Odzyskiwanie | Zastosowanie |
|-------|----------|----------|
| `L` | ~7% | Maksymalna gęstość danych |
| `M` | ~15% | Zrównoważony (domyślny) |
| `Q` | ~25% | Dobry dla kodów drukowanych |
| `H` | ~30% | Najlepszy dla kodów z nakładką logo |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

Kod QR z marką i niestandardowymi kolorami:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Uwagi {#notes}

- Ten punkt końcowy przyjmuje JSON, a nie dane formularza multipart, ponieważ nie jest potrzebne przesyłanie obrazu.
- Wynikiem jest zawsze obraz PNG.
- Nazwa pliku wynikowego to zawsze `qrcode.png`.
- `originalSize` zawsze wynosi 0, ponieważ to narzędzie generuje obrazy od zera.
- Wokół kodu QR uwzględniana jest 2-modułowa strefa cichej (margines).
- Maksymalna długość tekstu to 2000 znaków. Rzeczywista pojemność zależy od poziomu korekcji błędów i kodowania znaków.
- Wyższe poziomy korekcji błędów pozwalają, by kod QR pozostał skanowalny nawet przy częściowym zasłonięciu, ale zmniejszają pojemność danych.
- Gdy podano `logoDataUri`, korekcja błędów jest automatycznie wymuszana na `H` (30%), aby kod QR pozostał skanowalny mimo zasłonięcia środka przez logo.
