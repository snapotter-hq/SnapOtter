---
description: "Converte file di sottotitoli tra SRT, WebVTT e ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 9fcedff0c547
i18n_hash_version: 2
---

# Converti sottotitoli {#convert-subtitles}

Converte un file di sottotitoli tra SRT, WebVTT e ASS. Temporizzazione e testo vengono mantenuti; il posizionamento e gli effetti ASS no.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Accetta dati form multipart con un file di sottotitoli (`.srt`, `.vtt` o `.ass`) e un campo JSON `settings` facoltativo.

## Parameters {#parameters}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Formato di output: `srt`, `vtt` o `ass` |
| `encoding` | string | `"auto"` | Codifica del testo dell'input: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` o `euc-kr` |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/convert-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@episode.ass" \
  -F 'settings={"format":"srt"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/episode.srt",
  "originalSize": 2048,
  "processedSize": 1536
}
```

## Notes {#notes}

- La conversione da ASS mantiene la temporizzazione, il testo dei dialoghi e la formattazione di base che il formato di destinazione può contenere: SRT conserva corsivo, grassetto, colore e dimensione del carattere come tag, WebVTT conserva corsivo, grassetto e sottolineato. Il posizionamento sullo schermo, le animazioni e gli altri effetti ASS vengono scartati.
- L'output è sempre UTF-8. Con `encoding` impostato su `auto`, un file UTF-8 valido viene letto così com'è e qualsiasi altro file viene letto come Windows-1252, la codifica consueta dei vecchi file SRT dell'Europa occidentale. Se i caratteri accentati o non latini risultano alterati, imposta `encoding` sulla codifica reale del file (per esempio `gb18030` per il cinese semplificato o `windows-1251` per il cirillico).
- Il caricamento dei sottotitoli è limitato a 1 MB per impostazione predefinita. Alza o rimuovi il limite con `MAX_SUBTITLE_SIZE_MB`.
