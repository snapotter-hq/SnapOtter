---
description: "Passwortschutz mit AES-256-Verschlüsselung zu einer PDF hinzufügen."
i18n_source_hash: 869cfbc739ef
i18n_provenance: human
i18n_output_hash: 95cf667f453e
---

# PDF schützen {#protect-pdf}

Fügen Sie einer PDF mithilfe der AES-256-Verschlüsselung Passwortschutz hinzu.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/protect-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| userPassword | string | Ja | - | Passwort, das zum Öffnen der PDF erforderlich ist (1-256 Zeichen) |
| ownerPassword | string | Nein | Wie `userPassword` | Besitzerpasswort für Berechtigungen (1-256 Zeichen) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/protect-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"userPassword": "s3cret", "ownerPassword": "0wn3r"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- Die Verschlüsselung verwendet AES-256.
- Wenn `ownerPassword` weggelassen wird, entspricht es standardmäßig demselben Wert wie `userPassword`.
- Passwörter werden aus den Audit-Protokollen entfernt.
- Die verschlüsselte PDF erfordert das Benutzerpasswort zum Öffnen und das Besitzerpasswort (falls abweichend) für vollständige Berechtigungen.
