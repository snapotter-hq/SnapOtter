---
description: "Zastosuj efekt pikselizacji do całego obrazu lub wybranego obszaru."
i18n_source_hash: a3ad29841f7b
i18n_provenance: human
i18n_output_hash: f098fbbfdcab
---

# Pikselizacja {#pixelate}

Zastosuj efekt pikselizacji do całego obrazu lub wybranego prostokątnego obszaru. Przydatne do zasłaniania wrażliwej treści, takiej jak twarze, tablice rejestracyjne czy dane osobowe.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/pixelate`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| blockSize | integer | Nie | `12` | Rozmiar bloku pikseli (2-128); większe wartości dają grubszą pikselizację |
| region | object | Nie | - | Ogranicz pikselizację do prostokąta (patrz poniżej) |

### Obiekt region {#region-object}

| Pole | Typ | Wymagane | Opis |
|-------|------|----------|-------------|
| left | integer | Tak | Przesunięcie od lewej w pikselach (>= 0) |
| top | integer | Tak | Przesunięcie od góry w pikselach (>= 0) |
| width | integer | Tak | Szerokość obszaru w pikselach (>= 1) |
| height | integer | Tak | Wysokość obszaru w pikselach (>= 1) |

## Przykładowe żądanie {#example-request}

Pikselizacja całego obrazu:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 20}'
```

Pikselizacja wybranego obszaru:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/pixelate \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"blockSize": 16, "region": {"left": 100, "top": 50, "width": 200, "height": 150}}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Uwagi {#notes}

- Gdy `region` jest pominięty, pikselizowany jest cały obraz.
- Współrzędne obszaru są podawane w pikselach względem lewego górnego rogu obrazu. Obszar musi mieścić się w granicach obrazu.
- Format wyjściowy odpowiada formatowi wejściowemu. Pliki wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
