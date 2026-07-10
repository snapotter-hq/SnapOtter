---
description: "Bezpiecznie wypakowuje pliki z archiwum ZIP z ochroną przed bombami."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: e4a94b89b6d3
---

# Extract ZIP {#extract-zip}

Bezpiecznie wypakowuje pliki z archiwum ZIP. Archiwa jednoplikowe zwracają zawarty plik bezpośrednio; archiwa wieloplikowe zwracają płaski ZIP z wypakowaną zawartością.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Przyjmuje dane formularza multipart z plikiem ZIP. Pole ustawień nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik `.zip` do wypakowania.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notes {#notes}

- Jako wejście akceptowane są tylko pliki `.zip`.
- Jeśli archiwum zawiera pojedynczy plik, jest on zwracany bezpośrednio (nie jest zawijany w ZIP).
- Jeśli archiwum zawiera wiele plików, zwracany jest płaski ZIP ze wszystkimi plikami wypakowanymi do poziomu głównego (zagnieżdżona struktura katalogów jest spłaszczana).
- Wbudowana ochrona przed bombami odrzuca archiwa o nadmiernych współczynnikach kompresji lub liczbie plików, aby zapobiec wyczerpaniu zasobów.
