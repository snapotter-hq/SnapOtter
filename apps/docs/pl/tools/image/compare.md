---
description: "Porównaj dwa obrazy obok siebie z wizualizacją różnic na poziomie pikseli i wynikiem podobieństwa."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 7ad8cdc9a3da
---

# Porównywanie obrazów {#image-compare}

Prześlij dwa obrazy, aby obliczyć mapę różnic na poziomie pikseli oraz liczbowy procent podobieństwa. Wynikiem jest obraz różnic wyróżniający zmienione obszary na czerwono.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/compare`

Przyjmuje dane formularza multipart z **dwoma** plikami obrazów. Pole ustawień nie jest wymagane.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij dokładnie dwa pliki obrazów.

| Pole | Typ | Wymagane | Opis |
|-------|------|----------|-------------|
| file (pierwszy) | file | Tak | Pierwszy obraz |
| file (drugi) | file | Tak | Drugi obraz |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Pola odpowiedzi {#response-fields}

| Pole | Typ | Opis |
|-------|------|-------------|
| jobId | string | Identyfikator zadania do pobrania obrazu różnic |
| similarity | number | Procent podobieństwa między dwoma obrazami (od 0 do 100) |
| dimensions | object | Szerokość i wysokość użyte do porównania |
| downloadUrl | string | Adres URL do pobrania wygenerowanego obrazu różnic |
| originalSize | number | Łączny rozmiar obu obrazów wejściowych w bajtach |
| processedSize | number | Rozmiar wyjściowego obrazu różnic w bajtach |

## Uwagi {#notes}

- Oba obrazy są skalowane do tych samych wymiarów (maksimum z każdej osi) przed porównaniem.
- Obraz różnic wyróżnia różnice na czerwono z przezroczystością proporcjonalną do wielkości zmiany. Piksele identyczne lub prawie identyczne (różnica < 10) są pokazywane jako półprzezroczyste wersje oryginału.
- Podobieństwo jest obliczane jako odwrotność średniej różnicy pikseli w całym obrazie, wyrażona procentowo.
- Podobieństwo 100% oznacza, że obrazy są identyczne co do piksela (w rozdzielczości porównania).
- Wynikowy obraz różnic ma zawsze format PNG, niezależnie od formatów wejściowych.
- Oba obrazy są walidowane i dekodowane (obsługiwane HEIC, RAW, PSD, SVG) przed porównaniem.
- Orientacja EXIF jest automatycznie stosowana do obu obrazów przed przetwarzaniem.
