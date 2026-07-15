---
description: "Kadruj obrazy, określając obszar za pomocą pozycji i wymiarów."
i18n_source_hash: 556f37893553
i18n_provenance: human
i18n_output_hash: ac8f21ea2c80
---

# Kadruj obraz {#crop}

Kadruj obrazy, definiując prostokątny obszar za pomocą pozycji i rozmiaru. Obsługuje zarówno jednostki pikselowe, jak i procentowe.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/crop`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| left | number | Tak | - | Przesunięcie X obszaru kadrowania (od lewej krawędzi) |
| top | number | Tak | - | Przesunięcie Y obszaru kadrowania (od górnej krawędzi) |
| width | number | Tak | - | Szerokość obszaru kadrowania |
| height | number | Tak | - | Wysokość obszaru kadrowania |
| unit | string | Nie | `"px"` | Jednostka wartości: `px` lub `percent` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 100, "top": 50, "width": 800, "height": 600}'
```

Kadrowanie z użyciem wartości procentowych:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"left": 10, "top": 10, "width": 80, "height": 80, "unit": "percent"}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 1200000
}
```

## Uwagi {#notes}

- Obszar kadrowania musi mieścić się w granicach obrazu. Jeśli obszar wykracza poza obraz, żądanie zakończy się niepowodzeniem.
- Przy użyciu jednostki `percent` wartości oznaczają procent wymiarów obrazu (np. `left: 10` oznacza 10% od lewej krawędzi).
- Format wyjściowy odpowiada formatowi wejściowemu.
- Orientacja EXIF jest automatycznie stosowana przed kadrowaniem, więc współrzędne odpowiadają wizualnie poprawnej orientacji.
