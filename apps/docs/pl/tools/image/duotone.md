---
description: "Zastosuj dwukolorowy efekt duotone z niestandardowymi kolorami cieni i świateł."
i18n_source_hash: ab99c4f0152c
i18n_provenance: human
i18n_output_hash: 0afe4767f2ad
---

# Duotone {#duotone}

Zastosuj dwukolorowy efekt duotone do obrazu. Obraz jest konwertowany do skali szarości, a następnie mapowany na gradient między kolorem cieni (ciemne tony) a kolorem świateł (jasne tony).

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/duotone`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| shadow | string | Nie | `"#1e3a8a"` | Szesnastkowy kolor cieni (stosowany do ciemnych tonów) |
| highlight | string | Nie | `"#fbbf24"` | Szesnastkowy kolor świateł (stosowany do jasnych tonów) |
| intensity | integer | Nie | `100` | Intensywność efektu (0-100); 0 zwraca oryginał, 100 stosuje pełny efekt duotone |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/duotone \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"shadow": "#0f172a", "highlight": "#f97316", "intensity": 80}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1870000
}
```

## Uwagi {#notes}

- Format wyjściowy odpowiada formatowi wejściowemu. Pliki wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
- Wartość `intensity` mniejsza niż 100 miesza wynik duotone z oryginalnym obrazem, pozwalając na subtelniejsze efekty.
- Popularne kombinacje duotone to granat/złoto, morski/koralowy oraz fioletowy/różowy.
