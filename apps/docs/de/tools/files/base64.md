---
description: "Kodiert Text in Base64 oder dekodiert Base64 zurück in Text."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: a25a6429fa8c
i18n_hash_version: 2
---

# Base64 kodieren / dekodieren {#base64}

Füge Text ein, um Base64 zu erhalten, oder füge Base64 ein, um den Text zurückzubekommen, und kopiere dann das Ergebnis. Der Text geht an deinen eigenen SnapOtter-Server und sonst nirgendwohin.

Um ein Bild in Base64 umzuwandeln, nutze stattdessen [Image to Base64](/de/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Akzeptiert einen JSON-Body statt Multipart-Formulardaten und antwortet mit dem konvertierten Text statt mit einer herunterladbaren Datei.

## Parameters {#parameters}

| Name | Typ | Standard | Beschreibung |
|------|------|---------|-------------|
| `text` | string | (erforderlich) | Text zum Kodieren oder Base64 zum Dekodieren. Bis zu 1.000.000 Zeichen. |
| `mode` | string | (erforderlich) | `encode` oder `decode`. |
| `urlSafe` | boolean | `false` | Verwendet beim Kodieren das URL-sichere Alphabet (`-` und `_`) und lässt das Padding `=` weg. Wird beim Dekodieren ignoriert. |

## Example Request {#example-request}

Kodieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Dekodieren:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "SGVsbG8sIFdvcmxkIQ==", "mode": "decode"}'
```

## Example Response {#example-response}

```json
{
  "mode": "encode",
  "result": "SGVsbG8sIFdvcmxkIQ=="
}
```

## Notes {#notes}

- Text wird als UTF-8 kodiert, daher bleiben Umlaute, CJK-Zeichen und Emoji beim Hin- und Rückweg erhalten.
- Beim Dekodieren werden Leerzeichen und Zeilenumbrüche ignoriert, sodass Base64 mit Umbruch nach 76 Spalten (E-Mail, PEM-Inhalte) so dekodiert wird, wie es eingefügt wurde.
- Das Dekodieren akzeptiert Eingaben mit oder ohne Padding `=`, entweder im Standardalphabet (`+`, `/`) oder im URL-sicheren (`-`, `_`), aber keine Mischung aus beiden.
- Eingaben, die kein Base64 sind, schlagen mit einem 400 und dem Code `ENCODED_TEXT_INVALID` fehl. Gültiges Base64, das zu Binärdaten (einem Bild, einem ZIP) statt zu UTF-8-Text dekodiert wird, schlägt mit `DECODED_DATA_NOT_TEXT` fehl.
