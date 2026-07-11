---
description: "Multiplexa uma faixa de legenda no contêiner do vídeo."
i18n_source_hash: be272730fff5
i18n_provenance: human
i18n_output_hash: 57fd310a985d
---

# Embed Subtitles {#embed-subtitles}

Multiplexa um arquivo de legenda no contêiner do vídeo como uma faixa de legenda soft que os espectadores podem ativar ou desativar.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/embed-subtitles`

Aceita dados de formulário multipart com um arquivo de vídeo e um arquivo de legenda, além de um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| language | string | Não | `"eng"` | Código de idioma ISO 639-2/B (3 letras minúsculas, por exemplo `"eng"`, `"fra"`, `"deu"`) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/embed-subtitles \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F "file=@subtitles.srt" \
  -F 'settings={"language": "fra"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12520000
}
```

## Notes {#notes}

- Envie dois arquivos: o primeiro deve ser um vídeo, o segundo deve ser um arquivo de legenda (.srt, .vtt ou .ass).
- As legendas embutidas (soft) podem ser ativadas e desativadas pelo espectador no seu reprodutor de mídia. Para legendas permanentemente visíveis, use a ferramenta Burn Subtitles.
- O código de idioma é armazenado como metadado no contêiner e ajuda os reprodutores de mídia a rotular a faixa de legenda.
