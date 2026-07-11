---
description: "Usuń ochronę hasłem z pliku PDF."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: 114a7344526b
---

# Unlock PDF {#unlock-pdf}

Usuń ochronę hasłem z zaszyfrowanego pliku PDF, podając poprawne hasło.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Przyjmuje dane formularza multipart z plikiem PDF oraz polem JSON `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| password | string | Yes | - | Hasło do odszyfrowania pliku PDF (1-256 znaków) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/unlock-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"password": "s3cret"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2500000,
  "processedSize": 2450000
}
```

## Notes {#notes}

- Należy podać poprawne hasło; nieprawidłowe hasło zwraca błąd 400.
- Do odszyfrowania zadziała zarówno hasło użytkownika, jak i hasło właściciela.
- Hasła są usuwane z dzienników audytu.
