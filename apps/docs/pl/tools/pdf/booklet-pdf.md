---
description: "Rozmieść strony PDF do złożenia w broszurę."
i18n_source_hash: 8844b6d4fe96
i18n_provenance: human
i18n_output_hash: 95d088bd8a50
---

# Broszura PDF {#booklet-pdf}

Rozmieść strony do druku dwustronnego, aby zadrukowane arkusze można było złożyć w broszurę.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/pdf/booklet-pdf`

Przyjmuje dane formularza multipart z plikiem PDF i polem JSON `settings`.

## Parametry {#parameters}

| Parametr | Typ | Wymagany | Domyślny | Opis |
|-----------|------|----------|---------|-------------|
| perSheet | integer | Nie | `2` | Strony na arkusz: `2`, `4`, `6` lub `8` |

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/booklet-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"perSheet": 2}'
```

## Przykładowa odpowiedź {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2400000
}
```

## Uwagi {#notes}

- Domyślna wartość `perSheet: 2` umieszcza dwie strony obok siebie na każdym arkuszu, co jest standardowym układem broszury do druku dwustronnego.
- Puste strony są dodawane automatycznie, jeśli całkowita liczba stron nie jest wielokrotnością rozmiaru arkusza.
- Wydrukuj wynik dwustronnie z oprawą wzdłuż krótszej krawędzi, a następnie złóż i zszyj.
