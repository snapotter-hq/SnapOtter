---
description: "Adicione uma marca d'água de texto a cada página de um PDF."
i18n_source_hash: f1f7d8912fbd
i18n_provenance: human
i18n_output_hash: fbc23166e0b6
---

# Watermark PDF {#watermark-pdf}

Aplique uma marca d'água de texto em cada página de um PDF com posição, tamanho, opacidade e rotação configuráveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/watermark-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| text | string | Sim | - | Texto da marca d'água (1-200 caracteres) |
| position | string | Não | `"c"` | Posicionamento na página: `tl`, `tc`, `tr`, `l`, `c`, `r`, `bl`, `bc`, `br` |
| fontSize | integer | Não | `48` | Tamanho da fonte em pontos (6-72) |
| opacity | number | Não | `0.3` | Opacidade da marca d'água (0.05-1) |
| rotation | number | Não | `45` | Ângulo de rotação em graus (-180 a 180) |

### Position Values {#position-values}

- `tl` superior-esquerda, `tc` superior-centro, `tr` superior-direita
- `l` centro-esquerda, `c` centro, `r` centro-direita
- `bl` inferior-esquerda, `bc` inferior-centro, `br` inferior-direita

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/watermark-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"text": "CONFIDENTIAL", "position": "c", "opacity": 0.2, "rotation": 45}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2500000
}
```

## Notes {#notes}

- A marca d'água é renderizada como uma sobreposição de texto em cada página.
- O mesmo texto, posição e estilo de marca d'água são aplicados uniformemente a todas as páginas.
- Use valores de opacidade mais baixos (0.1-0.3) para marcas d'água sutis que não obscurecem o conteúdo.
