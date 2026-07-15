---
description: "Zmniejsz rozmiar pliku obrazu według poziomu jakości lub do docelowego rozmiaru pliku."
i18n_source_hash: 342c5cf1f864
i18n_provenance: human
i18n_output_hash: ad5235390f3f
---

# Kompresuj obraz {#compress}

Zmniejsz rozmiar pliku obrazu, określając poziom jakości lub docelowy rozmiar pliku w kilobajtach. Narzędzie wykorzystuje iteracyjne wyszukiwanie binarne, aby dokładnie trafić w docelowy rozmiar.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/compress`

Przyjmuje dane formularza multipart z plikiem obrazu oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| mode | string | Nie | `"quality"` | Tryb kompresji: `quality` lub `targetSize` |
| quality | number | Nie | `80` | Poziom jakości (1-100). Używany, gdy tryb to `quality`. |
| targetSizeKb | number | Nie | - | Docelowy rozmiar pliku w kilobajtach. Używany, gdy tryb to `targetSize`. |

## Przykładowe żądanie {#example-request}

Kompresja do jakości 60:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Kompresja do docelowego rozmiaru 200 KB:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 200}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 204800
}
```

## Uwagi {#notes}

- W trybie `quality` niższe wartości dają mniejsze pliki z większą liczbą artefaktów kompresji. Wartość 80 to dobra wartość domyślna do zastosowań webowych.
- W trybie `targetSize` silnik wykonuje iteracyjną kompresję, aby zbliżyć się do celu jak najbardziej bez jego przekroczenia.
- Format wyjściowy odpowiada formatowi wejściowemu. Kompresja dotyczy natywnego kodowania danego formatu (np. jakość JPEG dla plików JPEG, jakość WebP dla plików WebP).
- Jeśli domyślna jakość (80) jest akceptowalna, możesz całkowicie pominąć parametr `quality`.
