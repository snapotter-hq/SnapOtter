---
description: "Adicione números de página a cada página de um PDF."
i18n_source_hash: 58342d6ac8d2
i18n_provenance: human
i18n_output_hash: 79901ced3a4e
---

# PDF Page Numbers {#pdf-page-numbers}

Adicione números de página "Página N de M" a cada página de um PDF.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/pdf-page-numbers`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| position | string | Não | `"bc"` | Posicionamento do número de página: `bl`, `bc`, `br`, `tl`, `tc`, `tr` |
| fontSize | integer | Não | `10` | Tamanho da fonte em pontos (6-24) |

### Position Values {#position-values}

- `tl` superior-esquerda, `tc` superior-centro, `tr` superior-direita
- `bl` inferior-esquerda, `bc` inferior-centro, `br` inferior-direita

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/pdf-page-numbers \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"position": "bc", "fontSize": 12}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 2470000
}
```

## Notes {#notes}

- Os números de página são renderizados no formato "Página 1 de 10".
- Os números são adicionados a cada página, incluindo quaisquer páginas de título ou de capa existentes.
- A posição padrão `"bc"` coloca os números na parte inferior central de cada página.
