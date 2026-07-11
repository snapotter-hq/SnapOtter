---
description: "Skanuj obrazy w poszukiwaniu kodów QR, kodów kreskowych i kodów 2D z opatrzonym adnotacjami wynikiem."
i18n_source_hash: 97c9d395c257
i18n_provenance: human
i18n_output_hash: c1e42f2999ca
---

# Czytnik kodów kreskowych {#barcode-reader}

Skanuj przesłane obrazy w poszukiwaniu wszystkich typów kodów kreskowych i kodów QR. Zwraca odkodowany tekst, typ kodu kreskowego i dane o położeniu dla każdego wykrytego kodu. Generuje również obraz z adnotacjami z kolorowymi ramkami wokół wykrytych kodów.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/barcode-read`

Przyjmuje dane formularza multipart z plikiem obrazu oraz opcjonalnym polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| tryHarder | boolean | Nie | `true` | Włącz agresywny tryb skanowania dla trudniejszych do odczytania kodów kreskowych (wolniejszy, ale dokładniejszy) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-read \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@receipt.jpg" \
  -F 'settings={"tryHarder": true}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "filename": "receipt.jpg",
  "barcodes": [
    {
      "type": "QRCode",
      "text": "https://example.com/product/123",
      "position": {
        "topLeft": { "x": 100, "y": 50 },
        "topRight": { "x": 250, "y": 50 },
        "bottomLeft": { "x": 100, "y": 200 },
        "bottomRight": { "x": 250, "y": 200 }
      }
    },
    {
      "type": "EAN-13",
      "text": "5901234123457",
      "position": {
        "topLeft": { "x": 50, "y": 400 },
        "topRight": { "x": 300, "y": 400 },
        "bottomLeft": { "x": 50, "y": 450 },
        "bottomRight": { "x": 300, "y": 450 }
      }
    }
  ],
  "annotatedUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/annotated-receipt.png"
}
```

## Pola odpowiedzi {#response-fields}

| Pole | Typ | Opis |
|-------|------|-------------|
| filename | string | Oryginalna nazwa pliku |
| barcodes | array | Tablica wykrytych obiektów kodów kreskowych |
| annotatedUrl | string lub null | Adres URL do pobrania obrazu z adnotacjami (null, jeśli nie znaleziono kodów kreskowych) |
| previewUrl | string lub null | Taki sam jak annotatedUrl (dla zgodności z podglądem frontendu) |

### Obiekt kodu kreskowego {#barcode-object}

| Pole | Typ | Opis |
|-------|------|-------------|
| type | string | Format kodu kreskowego (QRCode, EAN-13, Code128, DataMatrix, PDF417 itd.) |
| text | string | Odkodowana treść kodu kreskowego |
| position | object | Ramka ograniczająca ze współrzędnymi topLeft, topRight, bottomLeft, bottomRight |

## Obsługiwane typy kodów kreskowych {#supported-barcode-types}

Kody kreskowe 1D: Code128, Code39, Code93, Codabar, EAN-8, EAN-13, ITF, UPC-A, UPC-E

Kody 2D: QRCode, DataMatrix, PDF417, Aztec, MaxiCode

## Uwagi {#notes}

- Używa biblioteki zxing-wasm do wykrywania kodów kreskowych.
- Obraz z adnotacjami nakłada kolorowe ramki wielokątne i numerowane etykiety na każdy wykryty kod kreskowy.
- W jednym obrazie można wykryć do 255 kodów kreskowych.
- Jeśli nie znaleziono żadnych kodów kreskowych, `barcodes` jest pustą tablicą, a `annotatedUrl` ma wartość null.
- Tryb `tryHarder` przeprowadza dokładniejsze skanowanie kosztem czasu przetwarzania. Wyłącz go, aby szybciej przetwarzać czyste, dobrze wyrównane kody kreskowe.
- Wynik z adnotacjami jest zawsze w formacie PNG.
- Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed skanowaniem.
- Orientacja EXIF jest automatycznie stosowana przed przetworzeniem.
