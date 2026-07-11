---
description: "Nanieś przesłane obrazy podpisów na plik PDF, używając znormalizowanych rozmieszczeń na stronie."
i18n_source_hash: c28f78c2e7fd
i18n_provenance: human
i18n_output_hash: 3bb0e466cf77
---

# Sign PDF {#sign-pdf}

Nanieś jeden lub więcej przesłanych obrazów podpisów PNG na dowolną stronę pliku PDF. Ta trasa używa niestandardowego kontraktu multipart, ponieważ potrzebuje pliku PDF, jednego lub więcej obrazów podpisów oraz współrzędnych rozmieszczenia.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/sign-pdf`

Przyjmuje dane formularza multipart. Plik PDF jest wysyłany jako `file`; podpisy są wysyłane jako `sig0`, `sig1` i tak dalej; rozmieszczenia są wysyłane w polu JSON `placements`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| file | file | Yes | - | Plik PDF do podpisania |
| sig0 | file | Yes | - | Pierwszy obraz podpisu. Dodatkowe obrazy używają `sig1`, `sig2` i tak dalej |
| placements | JSON string | Yes | - | Tablica obiektów rozmieszczenia: `{ "sig": 0, "page": 0, "x": 0.2, "y": 0.7, "w": 0.25, "h": 0.08 }` |
| clientJobId | string | No | - | Opcjonalny UUID do śledzenia postępu przez SSE |
| fileId | string | No | - | Opcjonalny identyfikator biblioteki plików do zapisania podpisanego wyniku jako nowej wersji |

## Placement Coordinates {#placement-coordinates}

| Field | Type | Description |
|-------|------|-------------|
| sig | integer | Indeks obrazu podpisu. `0` odpowiada `sig0` |
| page | integer | Indeks strony PDF liczony od zera |
| x | number | Pozycja lewej krawędzi jako ułamek strony |
| y | number | Pozycja górnej krawędzi jako ułamek strony |
| w | number | Szerokość podpisu jako ułamek strony |
| h | number | Wysokość podpisu jako ułamek strony |

Współrzędne używają początku w lewym górnym rogu. Wartości mogą nieznacznie wykraczać poza krawędź strony; renderer PDF przycina finalny stempel do strony.

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/sign-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F "sig0=@signature.png" \
  -F 'placements=[{"sig":0,"page":0,"x":0.64,"y":0.82,"w":0.22,"h":0.08}]'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract_signed.pdf",
  "previewUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/preview.png",
  "originalSize": 245000,
  "processedSize": 249000
}
```

Jeśli żądanie nie może zakończyć się w oknie oczekiwania synchronicznego, API zwraca:

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

Połącz się z `/api/v1/jobs/<jobId>/progress` i pobierz wynik, gdy zadanie się zakończy.

## Notes {#notes}

- Akceptowany format wejściowy PDF: `.pdf`.
- Obrazy podpisów muszą być prawidłowymi plikami graficznymi, zwykle PNG z przezroczystością.
- Akceptowane jest do 100 obrazów podpisów i 100 rozmieszczeń.
- `sign-pdf` to niestandardowa trasa i nie używa standardowego pola JSON `settings` narzędzia.
