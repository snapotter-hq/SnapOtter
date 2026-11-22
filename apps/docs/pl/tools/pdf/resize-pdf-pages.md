---
description: "Zmienia rozmiar każdej strony PDF na A4, Letter, etykietę wysyłkową 4x6 cali lub rozmiar niestandardowy."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: 10e356e2bc16
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

Zmienia rozmiar każdej strony w pliku PDF. Zawartość jest skalowana, aby zmieściła się na nowej stronie, i wyśrodkowana, dzięki czemu tekst, grafika wektorowa i kody kreskowe pozostają ostre. Użyj tego, aby zamienić etykietę wysyłkową na stronę 4x6 cali dla drukarki termicznej lub aby przenieść dokument między A4 a US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Przyjmuje dane formularza multipart z plikiem PDF i polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| pageSize | string | No | `"4x6in"` | Rozmiar docelowy: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` lub `custom` |
| width | number | No | `4` | Niestandardowa szerokość strony, używana gdy `pageSize` ma wartość `custom` |
| height | number | No | `6` | Niestandardowa wysokość strony, używana gdy `pageSize` ma wartość `custom` |
| unit | string | No | `"in"` | Jednostka rozmiaru niestandardowego: `in` lub `mm` |
| keepOrientation | boolean | No | `false` | Obraca rozmiar docelowy, aby pasował do orientacji każdej strony, zamiast wymuszać szerokość na wysokość |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- Strony są skalowane tak, aby się zmieściły, nigdy rozciągane. Gdy proporcje się różnią, pozostałe miejsce zostaje puste.
- Zmiana rozmiaru nie przycina. Etykieta wydrukowana na jednej czwartej strony Letter lub A4 nadal wypełnia tylko jedną czwartą nowej strony.
- Rozmiary niestandardowe muszą mieć po 0,5-200 cali (12,7-5080 mm) z każdej strony.
- Rozmiar strony jest zmieniany względem jej ramki przycięcia, jeśli ją ma, więc przycięta strona zachowuje tylko przycięty obszar.
