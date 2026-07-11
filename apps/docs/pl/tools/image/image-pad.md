---
description: "Dopełnij obraz do docelowych proporcji jednolitym kolorem, przezroczystym lub rozmytym tłem."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 47d27ff89e89
---

# Dopełnianie obrazu {#image-pad}

Dopełnij obraz do docelowych proporcji, dodając wokół niego jednolity kolor, przezroczyste lub rozmyte tło. Przydatne do dopasowywania obrazów do stałych proporcji dla mediów społecznościowych lub druku bez przycinania.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| target | string | Nie | `"1:1"` | Docelowe proporcje: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` lub `custom` |
| ratioW | integer | Nie | `1` | Niestandardowa szerokość proporcji (1-100, używana gdy target to `custom`) |
| ratioH | integer | Nie | `1` | Niestandardowa wysokość proporcji (1-100, używana gdy target to `custom`) |
| background | string | Nie | `"color"` | Tryb tła: `color`, `transparent` lub `blur` |
| color | string | Nie | `"#ffffff"` | Kolor tła w formacie hex (gdy background to `color`) |
| padding | integer | Nie | `0` | Dodatkowy odstęp jako procent kanwy (0-50) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Uwagi {#notes}

- Tryb tła `blur` tworzy rozmytą kopię oryginalnego obrazu jako wypełnienie dopełnienia, dając wizualnie spójny rezultat.
- Podczas używania tła `transparent` wynik jest konwertowany na PNG w celu zachowania kanału alfa.
- Format wyjściowy odpowiada formatowi wejściowemu, chyba że w grę wchodzi przezroczystość. Wejścia HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
- Ustaw `target` na `custom` i podaj `ratioW` oraz `ratioH` dla dowolnych proporcji (np. `ratioW: 3, ratioH: 2` dla 3:2).
