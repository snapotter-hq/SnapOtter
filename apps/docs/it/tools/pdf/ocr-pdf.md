---
description: "Estrai testo da documenti PDF usando l'OCR basato sull'IA."
i18n_source_hash: 1431fcba180b
i18n_provenance: human
i18n_output_hash: 123adeee3212
---

# OCR PDF {#pdf-ocr}

Estrai testo da documenti PDF usando il riconoscimento ottico dei caratteri basato sull'IA. Supporta più livelli di qualità e diverse lingue. Richiede l'installazione del bundle della funzionalità OCR.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/ocr-pdf`

Accetta dati di form multipart con un file PDF e un campo JSON opzionale `settings`.

## Parameters {#parameters}

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| quality | string | No | `"balanced"` | Livello di qualità OCR: `fast`, `balanced`, `best` |
| language | string | No | `"auto"` | Lingua del documento: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| pages | string | No | `"all"` | Selezione delle pagine, es. `"all"`, `"1-3"`, `"1,3,5"` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/ocr-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@scanned.pdf" \
  -F 'settings={"quality": "best", "language": "en", "pages": "1-5"}'
```

## Example Response {#example-response}

Restituisce `202 Accepted`. Monitora l'avanzamento tramite SSE su `/api/v1/jobs/{jobId}/progress`.

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "async": true
}
```

## Notes {#notes}

- Formato di input accettato: `.pdf`.
- Questo è uno strumento IA che richiede l'installazione del **bundle della funzionalità OCR**. Se il bundle non è installato, l'API restituisce `501 Not Implemented`.
- Il livello di qualità `fast` usa un modello più leggero per un'elaborazione più rapida; `best` usa un modello più accurato a scapito della velocità.
- L'impostazione della lingua `auto` tenta di rilevare automaticamente la lingua del documento.
- Puoi selezionare pagine specifiche usando intervalli (`"1-3"`), elenchi separati da virgole (`"1,3,5"`), o `"all"` per ogni pagina.
- Per i PDF che contengono già testo selezionabile, considera l'uso dello strumento più veloce [PDF in testo](./pdf-to-text).
