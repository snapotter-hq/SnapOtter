---
description: "Koda text till Base64 eller avkoda Base64 tillbaka till text."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: ca2f2d1cd688
i18n_hash_version: 2
---

# Base64-kodning och avkodning {#base64}

Klistra in text för att få Base64, eller klistra in Base64 för att få tillbaka texten, och kopiera sedan resultatet. Texten skickas till din egen SnapOtter-server och ingen annanstans.

Om du vill göra om en bild till Base64, använd [Bild till Base64](/sv/tools/image/image-to-base64) i stället.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Tar emot en JSON-kropp, inte multipart-formulärdata, och svarar med den konverterade texten i stället för en fil att ladda ner.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (obligatorisk) | Text att koda, eller Base64 att avkoda. Upp till 1 000 000 tecken. |
| `mode` | string | (obligatorisk) | `encode` eller `decode`. |
| `urlSafe` | boolean | `false` | Vid kodning används det URL-säkra alfabetet (`-` och `_`) och utfyllnaden `=` utelämnas. Ignoreras vid avkodning. |

## Example Request {#example-request}

Koda:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Avkoda:

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

- Text kodas som UTF-8, så bokstäver med accent, CJK och emoji överlever kodning och avkodning intakta.
- Avkodning ignorerar blanksteg och radbrytningar, så Base64 som är radbrutet vid 76 kolumner (e-post, PEM-innehåll) avkodas som det klistrades in.
- Avkodning accepterar indata med eller utan `=`-utfyllnad, i antingen standardalfabetet (`+`, `/`) eller det URL-säkra alfabetet (`-`, `_`), men inte en blandning av de två.
- Indata som inte är Base64 misslyckas med ett 400 och koden `ENCODED_TEXT_INVALID`. Giltig Base64 som avkodas till binärdata (en bild, en ZIP) i stället för UTF-8-text misslyckas med `DECODED_DATA_NOT_TEXT`.
