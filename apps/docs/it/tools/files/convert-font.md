---
description: "Converte i font tra TTF, OTF, WOFF e WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 94d758042ef8
i18n_hash_version: 2
---

# Converti Font {#convert-font}

Converte un file di font tra TrueType (TTF), OpenType CFF (OTF), WOFF e WOFF2. Usalo per trasformare un font desktop in un web font, o per ottenere un TTF da un OTF per un'app che accetta solo TrueType.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Accetta dati di form multipart con un file `.ttf`, `.otf`, `.woff` o `.woff2` e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| format | string | No | `ttf` | Formato di output: `ttf`, `otf`, `woff` o `woff2` |

## Esempio di richiesta {#example-request}

Da OTF a TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

Da TTF a WOFF2 per il web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Note {#notes}

- WOFF e WOFF2 sono involucri compressi attorno agli stessi dati del font, quindi convertire da o verso questi formati lascia invariati i contorni.
- Da OTF a TTF converte le curve cubiche (CFF) in curve quadratiche TrueType. Ogni curva resta entro 1 unità di font dall'originale, il che è invisibile alle dimensioni normali, ma la conversione non è esattamente reversibile. Da TTF a OTF mantiene la forma delle curve e arrotonda solo i punti di controllo a unità di font intere.
- I permessi di incorporamento del font (il campo OS/2 `fsType`) vengono mantenuti così come sono.
- Le raccolte di font (`.ttc`) non sono supportate. I font TrueType variabili non possono essere convertiti in OTF e i font CFF2 variabili non possono essere convertiti in TTF; in questi casi convertili in WOFF o WOFF2.
- La conversione viene eseguita nel worker Python dei documenti, con lo stesso timeout degli altri strumenti per documenti, e non all'interno del processo API.
