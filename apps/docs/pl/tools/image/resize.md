---
description: "Zmieniaj rozmiar obrazów w pikselach, procentowo lub z trybami dopasowania."
i18n_source_hash: 53866e8266b8
i18n_provenance: human
i18n_output_hash: d0de66d1ead7
---

# Zmień rozmiar obrazu {#resize}

Zmieniaj rozmiar obrazów, podając dokładne wymiary w pikselach, procentowy współczynnik skali lub tryb dopasowania kontrolujący, jak obraz dostosowuje się do wymiarów docelowych.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/resize`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| width | integer | Nie | - | Docelowa szerokość w pikselach (maks. 16383) |
| height | integer | Nie | - | Docelowa wysokość w pikselach (maks. 16383) |
| fit | string | Nie | `"contain"` | Jak obraz dopasowuje się do wymiarów: `contain`, `cover`, `fill`, `inside`, `outside` |
| withoutEnlargement | boolean | Nie | `false` | Zapobiegaj powiększaniu, jeśli obraz jest mniejszy niż cel |
| percentage | number | Nie | - | Skaluj procentowo (np. 50 dla połowy rozmiaru) |

Musi być podany przynajmniej jeden z: `width`, `height` lub `percentage`.

### Tryby dopasowania {#fit-modes}

- **contain** - Zmień rozmiar tak, aby zmieścić się w wymiarach, zachowując proporcje (może pozostawić puste miejsce)
- **cover** - Zmień rozmiar tak, aby pokryć wymiary, zachowując proporcje (może kadrować)
- **fill** - Rozciągnij dokładnie do wymiarów (ignoruje proporcje)
- **inside** - Jak `contain`, ale tylko zmniejsza, nigdy nie powiększa
- **outside** - Jak `cover`, ale tylko zmniejsza, nigdy nie powiększa

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"width": 800, "height": 600, "fit": "contain"}'
```

Zmiana rozmiaru procentowa:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"percentage": 50}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Uwagi {#notes}

- Maksymalny wymiar to 16383 piksele na każdej osi (limit Sharp/libvips).
- Format wyjściowy odpowiada formatowi wejściowemu. Pliki wejściowe HEIC, RAW, PSD i SVG są automatycznie dekodowane przed przetwarzaniem.
- Orientacja EXIF jest automatycznie stosowana przed zmianą rozmiaru.
- Flaga `withoutEnlargement` jest przydatna przy przetwarzaniu wsadowym, gdzie niektóre obrazy mogą już być mniejsze niż cel.
