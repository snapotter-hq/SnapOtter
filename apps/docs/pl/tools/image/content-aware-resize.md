---
description: "Zmiana rozmiaru metodą wycinania szwów, która dodaje lub usuwa piksele wzdłuż ścieżek o niskim znaczeniu, aby zachować kluczową zawartość i twarze."
i18n_source_hash: f383b28ab62a
i18n_provenance: human
i18n_output_hash: 041fb6c6b708
---

# Zmiana rozmiaru uwzględniająca treść {#content-aware-resize}

Zmiana rozmiaru metodą wycinania szwów, która inteligentnie usuwa lub dodaje piksele wzdłuż ścieżek o najmniejszym znaczeniu wizualnym, zachowując istotną zawartość i opcjonalnie chroniąc twarze.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/content-aware-resize`

**Przetwarzanie:** synchroniczne (zwraca wynik bezpośrednio)

**Pakiet modelu:** żaden nie jest wymagany do podstawowego działania. Ochrona twarzy używa pakietu `face-detection` (200-300 MB), jeśli jest włączona.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślnie | Opis |
|-----------|------|----------|---------|-------------|
| file | file | Tak | - | Plik obrazu (multipart) |
| width | number | Nie | - | Docelowa szerokość w pikselach |
| height | number | Nie | - | Docelowa wysokość w pikselach |
| protectFaces | boolean | Nie | `false` | Wykrywaj i chroń twarze przed usuwaniem szwów |
| blurRadius | number | Nie | `4` | Promień rozmycia wstępnego przetwarzania na potrzeby obliczania energii (0-20) |
| sobelThreshold | number | Nie | `2` | Próg wykrywania krawędzi Sobela (1-20). Wyższe wartości sprawiają, że algorytm jest bardziej agresywny |
| square | boolean | Nie | `false` | Zmień rozmiar do kwadratu (używa mniejszego wymiaru) |

Należy podać co najmniej jeden z parametrów `width`, `height` lub `square`.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/content-aware-resize \
  -F "file=@landscape.jpg" \
  -F 'settings={"width":800,"protectFaces":true}'
```

## Odpowiedź (200 OK) {#response-200-ok}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/{jobId}/landscape_seam.png",
  "originalSize": 450000,
  "processedSize": 380000,
  "width": 800,
  "height": 600
}
```

## Uwagi {#notes}

- Ta niestandardowa trasa zwraca obecnie synchroniczną odpowiedź 200.
- Wykorzystuje bibliotekę wycinania szwów `caire` do zmiany rozmiaru uwzględniającej treść.
- Tylko zmniejsza wymiary (usuwa szwy). Nie może powiększyć obrazu poza jego oryginalny rozmiar.
- Opcja `protectFaces` używa wykrywania twarzy przez AI, aby oznaczyć obszary twarzy jako wysokoenergetyczne, uniemożliwiając przechodzenie szwów przez twarze.
- `blurRadius` steruje wygładzaniem przed obliczeniem mapy energii. Wyższe wartości czynią mapę energii bardziej jednorodną, co może pomóc przy zaszumionych obrazach.
- `sobelThreshold` wpływa na to, jak agresywnie wykrywane są krawędzie. Niższe wartości zachowują więcej subtelnych krawędzi.
- Wynik ma zawsze format PNG.
- Obsługuje formaty wejściowe HEIC/HEIF, RAW, TGA, PSD, EXR i HDR poprzez automatyczne dekodowanie.
