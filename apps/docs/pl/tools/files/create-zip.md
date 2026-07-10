---
description: "Pakuje wiele plików w jedno archiwum ZIP."
i18n_source_hash: 9ff1250dbd36
i18n_provenance: human
i18n_output_hash: 28164bf351bd
---

# Create ZIP {#create-zip}

Pakuje wiele plików dowolnego typu w jedno archiwum ZIP. Zduplikowane nazwy plików są automatycznie deduplikowane.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/create-zip`

Przyjmuje dane formularza multipart z dwoma lub więcej plikami. Pole ustawień nie jest wymagane.

## Parameters {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij od 2 do 50 plików dowolnego typu do spakowania.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/create-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@report.pdf" \
  -F "file=@data.csv" \
  -F "file=@photo.jpg"
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive.zip",
  "originalSize": 3500000,
  "processedSize": 2800000
}
```

## Notes {#notes}

- Wymaga od 2 do 50 plików wejściowych.
- Akceptowany jest dowolny typ pliku; nie ma ograniczeń co do formatu wejściowego.
- Jeśli kilka plików ma tę samą nazwę, są one automatycznie deduplikowane przez dodanie sufiksów liczbowych.
- Archiwum wyjściowe korzysta ze standardowej kompresji ZIP (deflate).
