---
description: "Optymalizuj obrazy do publikacji w sieci z konwersją formatu, kontrolą jakości, zmianą rozmiaru i usuwaniem metadanych."
i18n_source_hash: c327bbbce768
i18n_provenance: human
i18n_output_hash: 5e9a8ae5d62a
---

# Optymalizacja pod sieć {#optimize-for-web}

Optymalizuj obrazy do publikacji w sieci w jednym kroku. Łączy konwersję formatu, dostosowanie jakości, opcjonalną zmianę rozmiaru, kodowanie progresywne i usuwanie metadanych.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/optimize-for-web`

Przyjmuje dane formularza multipart z plikiem obrazu i polem JSON `settings`.

Dostępny jest też punkt końcowy podglądu na żywo pod `POST /api/v1/tools/image/optimize-for-web/preview`, który zwraca przetworzony obraz bezpośrednio jako dane binarne (bez tworzenia obszaru roboczego) na potrzeby strojenia parametrów w czasie rzeczywistym.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| format | string | Nie | `"webp"` | Format wyjściowy: `webp`, `jpeg`, `avif`, `png`, `jxl` |
| quality | number | Nie | `80` | Jakość wyjścia (1-100) |
| maxWidth | number | Nie | - | Maksymalna szerokość w pikselach. Obraz jest zmniejszany, jeśli jest szerszy. |
| maxHeight | number | Nie | - | Maksymalna wysokość w pikselach. Obraz jest zmniejszany, jeśli jest wyższy. |
| progressive | boolean | Nie | `true` | Włącz kodowanie progresywne/przeplatane |
| stripMetadata | boolean | Nie | `true` | Usuń metadane EXIF, GPS, ICC i XMP |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "webp", "quality": 75, "maxWidth": 1920}'
```

Optymalizacja do AVIF z agresywną kompresją:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-for-web \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"format": "avif", "quality": 50, "maxWidth": 1200, "maxHeight": 800}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.webp",
  "originalSize": 4500000,
  "processedSize": 320000
}
```

### Odpowiedź punktu końcowego podglądu {#preview-endpoint-response}

Punkt końcowy podglądu (`/api/v1/tools/image/optimize-for-web/preview`) zwraca obraz binarny bezpośrednio wraz z nagłówkami informacyjnymi:

- `X-Original-Size` - Rozmiar oryginalnego pliku w bajtach
- `X-Processed-Size` - Rozmiar przetworzonego pliku w bajtach
- `X-Output-Filename` - Nazwa pliku wynikowego zakodowana w URL

## Uwagi {#notes}

- To narzędzie jest zaprojektowane jako kompleksowy potok optymalizacji zasobów sieciowych. Obsługuje konwersję formatu, strojenie jakości, ograniczanie maksymalnych wymiarów i usuwanie metadanych w jednym przebiegu.
- Rozszerzenie nazwy pliku wynikowego jest aktualizowane, aby pasowało do wybranego formatu.
- Kodowanie JXL (JPEG XL) używa wyspecjalizowanego kodera CLI. Obraz jest najpierw przetwarzany jako PNG, a następnie kodowany do JXL.
- Kodowanie progresywne poprawia postrzegany czas ładowania dla JPEG i PNG, umożliwiając przeglądarkom wyświetlenie podglądu niskiej jakości przed pełnym załadowaniem obrazu.
- Punkt końcowy podglądu jest lżejszy (bez tworzenia obszaru roboczego/zadania) i jest przeznaczony do interfejsu strojenia parametrów na żywo we frontendzie.
