---
description: "Grava uma marca d'água de texto nos quadros do vídeo."
i18n_source_hash: 937bb075b894
i18n_provenance: human
i18n_output_hash: d219586f1d35
---

# Watermark Video {#watermark-video}

Grava uma marca d'água de texto em cada quadro de um vídeo com posição, tamanho, opacidade e cor configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/watermark-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| text | string | Sim | - | Texto da marca d'água (1-200 caracteres) |
| position | string | Não | `"br"` | Posição no quadro: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Não | `36` | Tamanho da fonte em pixels (8-120) |
| opacity | number | Não | `0.5` | Opacidade da marca d'água (0.05-1) |
| color | string | Não | `"#ffffff"` | Cor hexadecimal do texto (por exemplo `"#ffffff"`) |

### Position Values {#position-values}

- **tl** - Superior esquerdo, **tc** - Superior centro, **tr** - Superior direito
- **l** - Meio esquerdo, **c** - Centro, **r** - Meio direito
- **bl** - Inferior esquerdo, **bc** - Inferior centro, **br** - Inferior direito

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/watermark-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"text": "PREVIEW", "position": "c", "fontSize": 48, "opacity": 0.3}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 12400000
}
```

## Notes {#notes}

- A marca d'água é renderizada permanentemente nos quadros do vídeo e não pode ser removida após o processamento.
- A marca d'água usa uma fonte sans-serif embutida no FFmpeg.
- Para marcas d'água de imagem, use a ferramenta Watermark de imagem.
