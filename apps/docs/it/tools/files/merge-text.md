---
description: "Unisci più file di testo o Markdown in uno solo, nell'ordine che scegli."
i18n_source_hash: 9b3ddd1eba68
i18n_provenance: machine
i18n_output_hash: 2d9719791ce0
i18n_hash_version: 2
---

# Unisci file di testo {#merge-text}

Unisci più file di testo o Markdown in un unico file. I file vengono uniti nell'ordine di caricamento, quindi riordinali nell'elenco prima di avviare l'operazione se l'ordine è importante.

## Endpoint API {#api-endpoint}

`POST /api/v1/tools/files/merge-text`

Accetta dati di modulo multipart con due o più file di testo e una stringa JSON `settings` facoltativa.

## Parametri {#parameters}

| Parametro | Tipo | Predefinito | Descrizione |
|-----------|------|---------|-------------|
| `separator` | string | `"blank-line"` | Cosa va tra i file: `"blank-line"`, `"rule"` (una riga `---`) oppure `"filename-heading"` (il nome di ogni file come intestazione) |

## Esempio di richiesta {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-text \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@chapter-1.md" \
  -F "file=@chapter-2.md" \
  -F 'settings={"separator":"filename-heading"}'
```

## Esempio di risposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.md",
  "originalSize": 8200,
  "processedSize": 8240
}
```

## Note {#notes}

- Accetta file `.txt`, `.md`, `.markdown`, `.csv` e `.log`, da 2 a 50 per richiesta.
- Ogni file deve essere testo UTF-8. Un file binario o non UTF-8 viene rifiutato e il suo nome compare nell'errore.
- Quando tutti gli input hanno la stessa estensione, l'output la mantiene (`merged.md`, `merged.log`). Input misti producono `merged.txt`.
- Con `filename-heading`, l'output Markdown usa intestazioni `# name.md`; l'output in testo semplice usa righe marcatore `==> name.txt <==`.
- Le righe vuote finali vengono rimosse da ogni file, così il separatore si colloca in modo pulito tra i documenti. Un byte-order mark iniziale viene scartato.
- I file CSV vengono uniti come testo semplice. Usa [Unisci CSV](./merge-csvs) per combinare tabelle con una sola riga di intestazione.
- I file email `.eml` non sono ancora supportati.
