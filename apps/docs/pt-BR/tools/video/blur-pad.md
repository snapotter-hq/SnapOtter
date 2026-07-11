---
description: "Preencha as barras com uma cópia desfocada do vídeo."
i18n_source_hash: 0c72aaefc6de
i18n_provenance: human
i18n_output_hash: 04228291a6b2
---

# Blur Pad {#blur-pad}

Ajuste um vídeo a uma proporção alvo preenchendo a área de preenchimento com uma cópia desfocada e redimensionada do vídeo, em vez de barras de cor sólida.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/blur-pad`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| target | string | Não | `"16:9"` | Proporção alvo: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` |
| blur | number | Não | `20` | Sigma de desfoque gaussiano para o plano de fundo (2-50) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/blur-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"target": "16:9", "blur": 30}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 14100000
}
```

## Notes {#notes}

- Valores de desfoque mais altos produzem um plano de fundo mais suave e abstrato. Valores mais baixos mantêm mais detalhes visíveis.
- Se o vídeo já corresponder à proporção alvo, o arquivo é retornado sem alteração.
- Para preenchimento de cor sólida, use a ferramenta Aspect Pad.
