---
description: "Textvorkommen dauerhaft aus einer PDF entfernen (verifizierte echte Schwärzung)."
i18n_source_hash: 296ad2a701b2
i18n_provenance: human
i18n_output_hash: 26ac03f05029
---

# PDF schwärzen {#redact-pdf}

Entfernen Sie angegebene Textvorkommen dauerhaft aus einer PDF mithilfe verifizierter echter Schwärzung. Der geschwärzte Text wird vollständig aus der Datei entfernt und nicht nur mit einem schwarzen Kasten überdeckt.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/redact-pdf`

Akzeptiert Multipart-Formulardaten mit einer PDF-Datei und einem JSON-Feld `settings`.

## Parameters {#parameters}

| Parameter | Typ | Erforderlich | Standard | Beschreibung |
|-----------|------|----------|---------|-------------|
| terms | string[] | Ja | - | Zu schwärzende Textzeichenfolgen (1-50 Begriffe, je bis zu 200 Zeichen) |
| caseSensitive | boolean | Nein | `false` | Ob die Übereinstimmung Groß- und Kleinschreibung beachtet |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/redact-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@contract.pdf" \
  -F 'settings={"terms": ["John Doe", "555-0123"], "caseSensitive": false}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/contract.pdf",
  "originalSize": 245000,
  "processedSize": 243000,
  "found": 7
}
```

## Notes {#notes}

- Akzeptiertes Eingabeformat: `.pdf`.
- Dies ist ein schnelles (synchrones) Tool, das das Ergebnis direkt zurückgibt.
- Dies führt eine echte Schwärzung durch: Übereinstimmender Text wird aus dem Inhaltsstrom der PDF entfernt, nicht nur visuell verdeckt.
- Das Feld `found` in der Antwort gibt an, wie viele Vorkommen geschwärzt wurden.
- Sie können in einer einzigen Anfrage bis zu 50 Begriffe schwärzen.
