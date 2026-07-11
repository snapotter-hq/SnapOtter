---
description: "Zmniejsz rozmiar pliku PDF przez kompresję osadzonych obrazów."
i18n_source_hash: a8bb0baaca25
i18n_provenance: human
i18n_output_hash: 4ad39b458a2f
---

# Compress PDF {#compress-pdf}

Zmniejsz rozmiar pliku PDF przez zmniejszenie rozdzielczości osadzonych obrazów. Wybierz suwak jakości albo docelowy rozmiar pliku.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/compress-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| mode | string | No | `"quality"` | Tryb kompresji: `quality` lub `targetSize` |
| quality | integer | No | `75` | Jakość kompresji, 1-100 (wyższa = mniejsza kompresja). Używane w trybie `quality` |
| targetSizeKb | number | No | - | Docelowy rozmiar pliku w kilobajtach. Używane w trybie `targetSize` |

## Example Request {#example-request}

Kompresja według jakości:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "quality", "quality": 60}'
```

Kompresja do docelowego rozmiaru:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/compress-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "targetSize", "targetSizeKb": 500}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 5200000,
  "processedSize": 1800000
}
```

## Notes {#notes}

- W trybie `quality` niższe wartości dają mniejsze pliki z większą degradacją obrazu.
- W trybie `targetSize` wyszukiwanie binarne znajduje najwyższe DPI mieszczące się w żądanym rozmiarze.
- Jeśli kompresja miałaby powiększyć plik, zwracane są niezmienione oryginalne bajty.
- Treść tekstowa i wektorowa nie jest zmieniana; zmniejszana jest tylko rozdzielczość osadzonych obrazów rastrowych.
