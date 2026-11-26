---
description: "Minifikuj pliki SVG za pomocą svgo i zachowaj wynik jako wektorowy SVG, z ustawieniami precyzji, wielu przebiegów, metadanych i formatowania."
i18n_source_hash: c2601cc2cdd8
i18n_provenance: machine
i18n_output_hash: 78b85a3c5681
i18n_hash_version: 2
---

# Optymalizacja SVG {#optimize-svg}

Zmniejsz pliki SVG, usuwając pozostałości po edytorze, zbędne atrybuty i nadmiarowe miejsca po przecinku, a wynik pobierz jako SVG. W przeciwieństwie do narzędzia „Optymalizacja dla sieci” wynik nigdy nie jest rasteryzowany.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/optimize-svg`

Przyjmuje dane formularza multipart z plikiem `.svg` lub `.svgz` oraz polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| precision | number | Nie | `3` | Liczba miejsc po przecinku zachowywanych w danych ścieżek i liczbach (0 do 8). Niższe wartości dają mniejsze pliki i nieco mniej gładkie krzywe. |
| multipass | boolean | Nie | `true` | Uruchamiaj optymalizator wielokrotnie, aż wynik przestanie się zmniejszać |
| removeMetadata | boolean | Nie | `true` | Usuń komentarze, `<metadata>`, `<desc>` i dane specyficzne dla edytorów. Wyłącz, aby je zachować. |
| pretty | boolean | Nie | `false` | Wcinaj wynik dla czytelności zamiast minifikować go do kilku linii |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/optimize-svg \
  -F "file=@logo.svg" \
  -F 'settings={"precision":3,"multipass":true,"removeMetadata":true,"pretty":false}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 48213,
  "processedSize": 17904
}
```

## Uwagi {#notes}

- Dane wejściowe muszą być plikiem SVG lub SVGZ. Obraz rastrowy jest odrzucany z `400` i kodem `IMAGE_UNDECODABLE`.
- Dane wejściowe `.svgz` są najpierw rozpakowywane, a wynik jest zawsze zwykłym `.svg`.
- Po rozpakowaniu SVG może mieć maksymalnie 2 MB. Większy plik jest odrzucany z `400` i kodem `SVG_TOO_LARGE`.
- `viewBox` i `<title>` są zawsze zachowywane, więc grafika nadal się skaluje i zachowuje swoją dostępną nazwę.
- Dane wejściowe i wyjściowe przechodzą przez sanityzator SVG, który usuwa skrypty i inną aktywną zawartość.
- Obniżenie `precision` daje największą oszczędność miejsca w grafikach z dużą liczbą ścieżek. Sprawdź wynik wzrokowo przy 0 do 2.
