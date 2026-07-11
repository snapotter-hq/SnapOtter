---
description: "Crie gráficos de barras, de linhas ou de pizza a partir de dados CSV ou JSON."
i18n_source_hash: d3c39384457b
i18n_provenance: human
i18n_output_hash: fc015d596192
---

# Criador de Gráficos {#chart-maker}

Crie gráficos de barras, de linhas ou de pizza a partir de dados CSV ou JSON. Retorna uma imagem PNG do gráfico renderizado.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/chart-maker`

Aceita dados de formulário multipart com um arquivo CSV ou JSON e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| kind | string | Não | `"bar"` | Tipo de gráfico: `bar`, `line`, `pie` |
| title | string | Não | - | Título do gráfico (máximo 120 caracteres) |
| width | integer | Não | `960` | Largura do gráfico em pixels (320-2048) |
| height | integer | Não | `540` | Altura do gráfico em pixels (240-1536) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/chart-maker \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@sales.csv" \
  -F 'settings={"kind": "line", "title": "Monthly Sales", "width": 960, "height": 540}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/sales_chart.png",
  "originalSize": 1024,
  "processedSize": 48500
}
```

## Notas {#notes}

- A entrada deve ser um arquivo `.csv` ou `.json`. Arquivos CSV devem ter uma linha de cabeçalho com os nomes das colunas.
- A primeira coluna é usada como rótulo de categoria; a segunda coluna deve ser numérica e fornece os valores dos dados. Apenas duas colunas são usadas.
- A entrada JSON deve ser um array de objetos `{label, value}`, ou um objeto simples cujas chaves se tornam rótulos e cujos valores se tornam pontos de dados.
- Máximo de 100 pontos de dados. Todos os valores devem ser zero ou maiores.
- A saída é sempre uma imagem PNG, independentemente do formato de entrada.
