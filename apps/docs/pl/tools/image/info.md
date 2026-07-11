---
description: "Wyświetl szczegółowe metadane obrazu, właściwości i statystyki histogramu dla poszczególnych kanałów."
i18n_source_hash: 8a0f7a0b0153
i18n_provenance: human
i18n_output_hash: ad7ebbe87780
---

# Informacje o obrazie {#image-info}

Narzędzie analityczne tylko do odczytu, które zwraca kompleksowe metadane obrazu, w tym wymiary, format, przestrzeń kolorów, obecność EXIF/ICC/XMP oraz statystyki histogramu dla poszczególnych kanałów. Nie tworzy przetworzonego pliku wyjściowego.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/image/info`

Przyjmuje dane formularza multipart z plikiem obrazu. Pole ustawień nie jest potrzebne.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Wystarczy przesłać plik obrazu.

| Pole | Typ | Wymagany | Opis |
|-------|------|----------|-------------|
| file | file | Tak | Obraz do analizy |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/info \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg"
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "filename": "photo.jpg",
  "fileSize": 2450000,
  "width": 4032,
  "height": 3024,
  "format": "jpeg",
  "channels": 3,
  "hasAlpha": false,
  "colorSpace": "srgb",
  "density": 72,
  "isProgressive": false,
  "orientation": 1,
  "hasProfile": true,
  "hasExif": true,
  "hasIcc": true,
  "hasXmp": false,
  "bitDepth": "8",
  "pages": 1,
  "histogram": [
    { "channel": "red", "min": 0, "max": 255, "mean": 128.45, "stdev": 52.31 },
    { "channel": "green", "min": 2, "max": 253, "mean": 115.22, "stdev": 48.76 },
    { "channel": "blue", "min": 0, "max": 250, "mean": 102.89, "stdev": 55.14 }
  ]
}
```

## Pola odpowiedzi {#response-fields}

| Pole | Typ | Opis |
|-------|------|-------------|
| filename | string | Oczyszczona nazwa pliku |
| fileSize | number | Rozmiar pliku w bajtach |
| width | number | Szerokość obrazu w pikselach |
| height | number | Wysokość obrazu w pikselach |
| format | string | Wykryty format (jpeg, png, webp itd.) |
| channels | number | Liczba kanałów kolorów |
| hasAlpha | boolean | Czy obraz ma kanał alfa |
| colorSpace | string | Przestrzeń kolorów (srgb, cmyk itd.) |
| density | number lub null | Rozdzielczość DPI/PPI |
| isProgressive | boolean | Czy JPEG używa kodowania progresywnego |
| orientation | number lub null | Wartość orientacji EXIF (1-8) |
| hasProfile | boolean | Czy osadzony jest profil ICC |
| hasExif | boolean | Czy obecne są metadane EXIF |
| hasIcc | boolean | Czy obecny jest profil kolorów ICC |
| hasXmp | boolean | Czy obecne są metadane XMP |
| bitDepth | string lub null | Bity na próbkę |
| pages | number | Liczba stron (dla formatów wielostronicowych, takich jak TIFF, GIF) |
| histogram | array | Statystyki dla poszczególnych kanałów (min, max, średnia, odchylenie standardowe) |

## Uwagi {#notes}

- To punkt końcowy tylko do odczytu. Nie tworzy pliku wyjściowego do pobrania ani `jobId`.
- W przypadku obrazów w formacie RAW (DNG, CR2, NEF, ARW itd.) do wyodrębnienia rzeczywistych wymiarów sensora i flag metadanych, których Sharp nie potrafi odczytać bezpośrednio, używany jest ExifTool.
- Pliki HEIC/HEIF są dekodowane wewnętrznie do PNG w celu wyodrębnienia statystyk pikseli, ponieważ Sharp nie potrafi dekodować pikseli HEVC.
- Histogram dostarcza min/max/średnią/odchylenie standardowe na kanał, a nie pełny rozkład z 256 przedziałami.
- Pole `density` odzwierciedla osadzone metadane DPI, jeśli są obecne.
