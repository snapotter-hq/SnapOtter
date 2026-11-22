---
description: "Codifica il testo in Base64 o decodifica il Base64 in testo."
i18n_source_hash: 0e26f17348d3
i18n_provenance: machine
i18n_output_hash: 16049d6ab1ab
i18n_hash_version: 2
---

# Codifica / decodifica Base64 {#base64}

Incolla del testo per ottenere il Base64, oppure incolla del Base64 per riavere il testo, poi copia il risultato. Il testo va al tuo server SnapOtter e da nessun'altra parte.

Per trasformare un'immagine in Base64, usa invece [Image to Base64](/it/tools/image/image-to-base64).

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/base64`

Accetta un corpo JSON, non dati form multipart, e risponde con il testo convertito invece di un file da scaricare.

## Parameters {#parameters}

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `text` | string | (obbligatorio) | Testo da codificare, oppure Base64 da decodificare. Fino a 1.000.000 di caratteri. |
| `mode` | string | (obbligatorio) | `encode` o `decode`. |
| `urlSafe` | boolean | `false` | In codifica, usa l'alfabeto sicuro per gli URL (`-` e `_`) e omette il padding `=`. Ignorato in decodifica. |

## Example Request {#example-request}

Codifica:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/base64 \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, World!", "mode": "encode"}'
```

Decodifica:

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

- Il testo viene codificato come UTF-8, quindi lettere accentate, CJK ed emoji sopravvivono all'andata e ritorno.
- La decodifica ignora spazi e a capo, quindi il Base64 spezzato a 76 colonne (email, corpi PEM) si decodifica così come è stato incollato.
- La decodifica accetta input con o senza padding `=`, sia nell'alfabeto standard (`+`, `/`) sia in quello sicuro per gli URL (`-`, `_`), ma non un misto dei due.
- Un input che non è Base64 fallisce con un 400 e il codice `ENCODED_TEXT_INVALID`. Un Base64 valido che si decodifica in dati binari (un'immagine, uno ZIP) invece che in testo UTF-8 fallisce con `DECODED_DATA_NOT_TEXT`.
