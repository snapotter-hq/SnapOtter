---
description: "Konwertuj plik Markdown na stylizowany plik PDF."
i18n_source_hash: 18474dc8772a
i18n_provenance: human
i18n_output_hash: c4c3776fb707
---

# Markdown na PDF {#markdown-to-pdf}

Konwertuj plik Markdown na stylizowany dokument PDF. Zasoby zdalne są wyłączone ze względu na prywatność.

## Punkt końcowy API {#api-endpoint}

`POST /api/v1/tools/files/markdown-to-pdf`

Przyjmuje dane formularza multipart z plikiem Markdown.

## Parametry {#parameters}

To narzędzie nie ma konfigurowalnych parametrów. Prześlij plik Markdown, a zostanie on przekonwertowany na PDF.

## Przykładowe żądanie {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/markdown-to-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.md"
```

## Przykładowa odpowiedź {#example-response}

Zwraca `202 Accepted`. Śledź postęp przez SSE pod `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Uwagi {#notes}

- Akceptowane formaty wejściowe: `.md`, `.markdown`.
- Zasoby zdalne (obrazy, arkusze stylów odwołujące się przez adresy URL) nie są pobierane ze względu na prywatność i bezpieczeństwo.
- Markdown jest najpierw renderowany do HTML, a następnie konwertowany na PDF za pomocą WeasyPrint.
- Bloki kodu, tabele i inne elementy Markdown są stylizowane w wynikowym PDF.
