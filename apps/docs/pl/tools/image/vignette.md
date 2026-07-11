---
description: "Dodaj efekt winiety z regulowaną siłą, kolorem i pozycją."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 94c41fb69c7e
---

# Winieta {#vignette}

Dodaj efekt winiety, który przyciemnia lub zabarwia krawędzie obrazu. Obsługuje regulowaną siłę, kolor, promień, miękkość, zaokrąglenie i pozycję środka.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| strength | number | Nie | `0.5` | Nieprzezroczystość winiety (0.1-1) |
| color | string | Nie | `"#000000"` | Kolor winiety w formacie hex |
| radius | integer | Nie | `70` | Promień zewnętrzny jako procent połowy przekątnej (0-100) |
| softness | integer | Nie | `50` | Miękkość wtapiania (0-100); wyższe wartości dają bardziej stopniowe przejście |
| roundness | integer | Nie | `100` | Kształt: 100 = koło, 0 = elipsa dopasowana do proporcji obrazu |
| centerX | integer | Nie | `50` | Pozioma pozycja środka jako procent (0-100) |
| centerY | integer | Nie | `50` | Pionowa pozycja środka jako procent (0-100) |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Uwagi {#notes}

- Mniejszy `radius` przyciemnia większą część obrazu; większy promień ogranicza winietę do skrajnych krawędzi.
- Użyj koloru `color` innego niż czarny (np. białego lub w tonach sepii) dla kreatywnych efektów winiety.
- Regulacja `centerX` i `centerY` pozwala umieścić czysty obszar poza środkiem, co jest przydatne do skierowania uwagi na obiekt, który nie znajduje się na środku kadru.
- Format wyjściowy odpowiada formatowi wejściowemu. Dane wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
