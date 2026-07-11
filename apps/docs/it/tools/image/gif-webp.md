---
description: "Converti GIF animate in WebP e viceversa, preservando tutti i fotogrammi."
i18n_source_hash: 20946e5001cb
i18n_provenance: human
i18n_output_hash: e571530ed5df
---

# Convertitore GIF/WebP {#gif-webp-converter}

Converti file GIF animati in WebP e viceversa, preservando tutti i fotogrammi e la temporizzazione dell'animazione. Le animazioni WebP sono in genere più piccole del 25-35% rispetto alle GIF equivalenti.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/image/gif-webp`

Accetta dati di form multipart con un file GIF o WebP e un campo JSON `settings`.

## Parametri {#parameters}

| Parametro | Tipo | Obbligatorio | Predefinito | Descrizione |
|-----------|------|----------|---------|-------------|
| quality | integer | No | `80` | Qualità dell'output per la codifica WebP (1-100) |
| lossless | boolean | No | `false` | Usa la compressione WebP senza perdita |
| resizePercent | integer | No | `100` | Scala l'output per percentuale (10-100) |

## Richiesta di Esempio {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/gif-webp \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@animation.gif" \
  -F 'settings={"quality": 85, "resizePercent": 50}'
```

## Risposta di Esempio {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/animation.webp",
  "originalSize": 3500000,
  "processedSize": 2200000
}
```

## Note {#notes}

- Sono accettati solo file `.gif` e `.webp`. Altri formati immagine non sono supportati da questo strumento.
- La direzione della conversione è automatica: l'input GIF produce output WebP, e l'input WebP produce output GIF.
- Le opzioni `quality` e `lossless` si applicano solo durante la codifica in WebP. Durante la conversione in GIF, l'output usa la palette GIF standard.
- Usa `resizePercent` per ridurre le dimensioni (e la dimensione del file) di animazioni di grandi dimensioni.
