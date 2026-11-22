---
description: "Codeer tekst naar Base64 of decodeer Base64 terug naar tekst."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: d1c1176e9608
i18n_hash_version: 2
---

# Base64 coderen / decoderen {#base64}

Plak tekst om Base64 te krijgen, of plak Base64 om de tekst terug te krijgen, en kopieer dan het resultaat. De tekst gaat naar je eigen SnapOtter-server en nergens anders heen.

Om een afbeelding naar Base64 om te zetten, gebruik je in plaats daarvan [Afbeelding naar Base64](/nl/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Accepteert een JSON-body, geen multipart form data, en antwoordt met de geconverteerde tekst in plaats van een bestand om te downloaden.

## Parameters {#parameters}

| Naam | Type | Standaard | Beschrijving |
|------|------|---------|-------------|
| `text` | string | (vereist) | Tekst om te coderen, of Base64 om te decoderen. Maximaal 1.000.000 tekens. |
| `mode` | string | (vereist) | `encode` of `decode`. |
| `urlSafe` | boolean | `false` | Gebruik bij het coderen het URL-veilige alfabet (`-` en `_`) en laat de `=`-opvulling weg. Wordt genegeerd bij het decoderen. |

## Example Request {#example-request}

Coderen:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Decoderen:

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

- Tekst wordt als UTF-8 gecodeerd, dus letters met accenten, CJK en emoji komen ongeschonden door de heen-en-terugconversie.
- Bij het decoderen worden spaties en regeleinden genegeerd, dus Base64 dat op 76 kolommen is afgebroken (e-mail, PEM-bodies) wordt gedecodeerd zoals het is geplakt.
- Decoderen accepteert invoer met of zonder `=`-opvulling, in het standaardalfabet (`+`, `/`) of het URL-veilige alfabet (`-`, `_`), maar niet in een mix van beide.
- Invoer die geen Base64 is, mislukt met een 400 en de code `ENCODED_TEXT_INVALID`. Geldig Base64 dat naar binaire gegevens (een afbeelding, een ZIP) in plaats van UTF-8-tekst wordt gedecodeerd, mislukt met `DECODED_DATA_NOT_TEXT`.
