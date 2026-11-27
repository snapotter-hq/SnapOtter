---
description: "Converte arquivos de legenda entre SRT, WebVTT e ASS."
i18n_source_hash: 497ff19cf9be
i18n_provenance: machine
i18n_output_hash: 81f9127cc035
i18n_hash_version: 2
---

# Convert Subtitles {#convert-subtitles}

Converte um arquivo de legenda entre SRT, WebVTT e ASS. O tempo e o texto são mantidos; o posicionamento e os efeitos do ASS não.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/convert-subtitles`

Aceita dados de formulário multipart com um arquivo de legenda (`.srt`, `.vtt` ou `.ass`) e um campo JSON `settings` opcional.

## Parameters {#parameters}

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `format` | string | `"srt"` | Formato de saída: `srt`, `vtt` ou `ass` |
| `encoding` | string | `"auto"` | Codificação de texto da entrada: `auto`, `utf-8`, `windows-1252`, `windows-1250`, `windows-1251`, `windows-1256`, `iso-8859-2`, `gb18030`, `big5`, `shift_jis` ou `euc-kr` |

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

- Converter de ASS mantém o tempo, o texto dos diálogos e a formatação básica que o formato de destino consegue guardar: o SRT mantém itálico, negrito, cor e tamanho da fonte como tags, e o WebVTT mantém itálico, negrito e sublinhado. O posicionamento na tela, a animação e outros efeitos do ASS são descartados.
- A saída é sempre UTF-8. Com `encoding` definido como `auto`, um arquivo que seja UTF-8 válido é lido como está e qualquer outro é lido como Windows-1252, a codificação usual de arquivos SRT mais antigos da Europa Ocidental. Se caracteres acentuados ou não latinos saírem corrompidos, defina `encoding` com a codificação real do arquivo (por exemplo, `gb18030` para chinês simplificado ou `windows-1251` para cirílico).
- Os envios de legendas são limitados a 1 MB por padrão. Aumente ou remova o limite com `MAX_SUBTITLE_SIZE_MB`.
