---
description: "Konwertuj obrazy na identyfikatory URI danych Base64 do osadzania w HTML, CSS i innych."
i18n_source_hash: ba4b8f3b4ece
i18n_provenance: human
i18n_output_hash: 4af7bf124f8d
---

# Obraz na Base64 {#image-to-base64}

Konwertuj jeden lub więcej obrazów na ciągi zakodowane w Base64 i identyfikatory URI danych. Obsługuje opcjonalną konwersję formatu, kontrolę jakości i zmianę rozmiaru. Przydatne do osadzania obrazów bezpośrednio w HTML, CSS, JSON lub szablonach e-mail.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/image-to-base64`

Przyjmuje dane formularza multipart z jednym lub większą liczbą plików obrazów oraz opcjonalnym polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Nie | `"original"` | Konwertuj przed zakodowaniem: `original`, `jpeg`, `png`, `webp`, `avif`, `jxl` |
| quality | number | Nie | `80` | Jakość wyjściowa dla formatów stratnych (1 do 100) |
| maxWidth | number | Nie | `0` | Maksymalna szerokość w pikselach (0 = brak zmiany rozmiaru, nie powiększy) |
| maxHeight | number | Nie | `0` | Maksymalna wysokość w pikselach (0 = brak zmiany rozmiaru, nie powiększy) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon.png" \
  -F 'settings={"outputFormat": "webp", "quality": 80, "maxWidth": 200}'
```

Wiele plików:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-to-base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@icon1.png" \
  -F "file=@icon2.png" \
  -F "file=@icon3.png" \
  -F 'settings={"outputFormat": "original"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "results": [
    {
      "filename": "icon.png",
      "mimeType": "image/webp",
      "width": 200,
      "height": 200,
      "originalSize": 45000,
      "encodedSize": 28800,
      "overheadPercent": -36.0,
      "base64": "UklGRlYAAABXRUJQ...",
      "dataUri": "data:image/webp;base64,UklGRlYAAABXRUJQ..."
    }
  ],
  "errors": []
}
```

## Pola odpowiedzi {#response-fields}

| Pole | Typ | Opis |
|-------|------|-------------|
| results | array | Pomyślnie przekonwertowane obrazy |
| errors | array | Obrazy, których nie udało się przetworzyć (z nazwą pliku i komunikatem błędu) |

### Obiekt result {#result-object}

| Pole | Typ | Opis |
|-------|------|-------------|
| filename | string | Oryginalna nazwa pliku |
| mimeType | string | Typ MIME zakodowanego wyniku |
| width | number | Końcowa szerokość w pikselach (po ewentualnej zmianie rozmiaru) |
| height | number | Końcowa wysokość w pikselach (po ewentualnej zmianie rozmiaru) |
| originalSize | number | Oryginalny rozmiar pliku w bajtach |
| encodedSize | number | Rozmiar ciągu Base64 w bajtach |
| overheadPercent | number | Procentowa różnica rozmiaru względem oryginału (dodatnia = większy, ujemna = mniejszy) |
| base64 | string | Surowe dane obrazu zakodowane w Base64 |
| dataUri | string | Kompletny identyfikator URI danych gotowy do użycia w atrybutach `src` |

## Uwagi {#notes}

- Kodowanie Base64 zazwyczaj zwiększa rozmiar o około 33% w porównaniu z plikiem binarnym. Pole `overheadPercent` pokazuje rzeczywistą różnicę.
- Gdy `outputFormat` to `"original"`, pliki HEIC/HEIF są konwertowane na JPEG (ponieważ przeglądarki nie mogą wyświetlać HEIC w identyfikatorach URI danych).
- Opcje `maxWidth` i `maxHeight` zmieniają rozmiar za pomocą `fit: inside` z `withoutEnlargement`, więc obrazy mniejsze niż podane wymiary nie są powiększane.
- W jednym żądaniu można przetworzyć wiele plików. Każdy plik jest przetwarzany niezależnie, a niepowodzenia nie uniemożliwiają pomyślnego przetworzenia innych plików.
- Pliki SVG są przepuszczane jako `image/svg+xml` bez ponownego kodowania (chyba że zażądano konwersji formatu).
- To punkt końcowy tylko do odczytu. Nie tworzy pliku do pobrania ani `jobId`. Dane Base64 są zwracane bezpośrednio w treści odpowiedzi.
