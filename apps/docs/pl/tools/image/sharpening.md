---
description: "Wyostrzaj obrazy metodami adaptacyjną, maski wyostrzającej lub filtra górnoprzepustowego z opcjonalną redukcją szumów."
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: 6d8a1b16e180
---

# Wyostrz obraz {#sharpening}

Zaawansowane narzędzie do wyostrzania z trzema metodami: adaptacyjną (inteligentne rozpoznawanie krawędzi), maską wyostrzającą (klasyczny promień/siła) oraz filtrem górnoprzepustowym (uwydatnienie tekstury). Zawiera wbudowaną redukcję szumów, aby zapobiec powstawaniu artefaktów wyostrzania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| method | string | Nie | `"adaptive"` | Algorytm wyostrzania: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Nie | `1.0` | Adaptacyjny: sigma Gaussa (0.5 do 10) |
| m1 | number | Nie | `1.0` | Adaptacyjny: wyostrzanie obszarów gładkich (0 do 10) |
| m2 | number | Nie | `3.0` | Adaptacyjny: wyostrzanie obszarów postrzępionych (0 do 20) |
| x1 | number | Nie | `2.0` | Adaptacyjny: próg gładki/postrzępiony (0 do 10) |
| y2 | number | Nie | `12` | Adaptacyjny: maksymalne wyostrzanie obszarów gładkich (0 do 50) |
| y3 | number | Nie | `20` | Adaptacyjny: maksymalne wyostrzanie obszarów postrzępionych (0 do 50) |
| amount | number | Nie | `100` | Maska wyostrzająca: siła wyostrzania (0 do 1000) |
| radius | number | Nie | `1.0` | Maska wyostrzająca: promień rozmycia w pikselach (0.1 do 5) |
| threshold | number | Nie | `0` | Maska wyostrzająca: minimalna różnica jasności do wyostrzenia (0 do 255) |
| strength | number | Nie | `50` | Filtr górnoprzepustowy: siła filtra (0 do 100) |
| kernelSize | number | Nie | `3` | Filtr górnoprzepustowy: rozmiar jądra splotu (3 lub 5) |
| denoise | string | Nie | `"off"` | Redukcja szumów przed wyostrzaniem: `off`, `light`, `medium`, `strong` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Maska wyostrzająca z progiem chroniącym gładkie obszary:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Uwagi {#notes}

- Używane są tylko parametry właściwe dla wybranej metody. Na przykład `amount`, `radius` i `threshold` są ignorowane, gdy `method` ma wartość `adaptive`.
- Metoda adaptacyjna korzysta z wbudowanego w Sharp wyostrzania adaptacyjnego z konfigurowalnym zachowaniem dla obszarów gładkich/postrzępionych.
- Opcja `denoise` stosuje redukcję szumów przed wyostrzaniem, aby zapobiec wzmocnieniu szumu/ziarna.
- Wyostrzanie filtrem górnoprzepustowym wydobywa drobne detale, odejmując rozmytą wersję od oryginału, a następnie łącząc ją z powrotem.
- Format wyjściowy odpowiada formatowi wejściowemu. Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
