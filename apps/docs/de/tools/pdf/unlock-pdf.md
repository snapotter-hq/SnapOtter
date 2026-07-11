---
description: "Passwortschutz von einer PDF entfernen."
i18n_source_hash: 14f5165d185c
i18n_provenance: human
i18n_output_hash: a36f8a5bc0e0
---

# PDF entsperren {#unlock-pdf}

Entfernen Sie den Passwortschutz von einer verschlüsselten PDF, indem Sie das korrekte Passwort angeben.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/unlock-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| password | string | Ja | - | Passwort zum Entschlüsseln der PDF (1-256 Zeichen) |

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

- Das korrekte Passwort muss angegeben werden; ein falsches Passwort gibt einen 400-Fehler zurück.
- Zum Entschlüsseln funktioniert entweder das Benutzerpasswort oder das Besitzerpasswort.
- Passwörter werden aus den Audit-Protokollen entfernt.
