---
description: "Converta entre CSV e JSON, em ambas as direções."
i18n_source_hash: 5b24abf5e9d2
i18n_provenance: human
i18n_output_hash: 7728bd323ee3
---

# CSV para JSON {#csv-to-json}

Converta entre os formatos CSV e JSON em ambas as direções. Envie um arquivo CSV ou TSV para obter um array JSON de objetos, ou envie JSON (um array de objetos, ou um objeto que contenha um) para obter um arquivo CSV.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/csv-json`

Aceita dados de formulário multipart com um arquivo CSV, TSV ou JSON e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Não | `true` | Formatar a saída JSON de forma legível, com indentação |

## Exemplo de Requisição {#example-request}

CSV para JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.csv" \
  -F 'settings={"pretty": true}'
```

JSON para CSV:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/csv-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@users.json" \
  -F 'settings={}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/users.json",
  "originalSize": 1500,
  "processedSize": 2200
}
```

## Notas {#notes}

- A direção da conversão é detectada automaticamente pela extensão do arquivo de entrada: `.csv` ou `.tsv` produz `.json`, e `.json` produz `.csv`.
- O parâmetro `pretty` afeta apenas a saída JSON. Quando definido como `false`, a saída é uma string JSON compacta de linha única.
- A entrada JSON pode ser um array de objetos, um objeto com uma única chave que contenha um array desse tipo (como `{"data": [...]}`) ou um objeto plano de valores escalares. Cada objeto se torna uma linha, e cada chave se torna um cabeçalho de coluna. Um objeto plano gera uma tabela de duas colunas `key,value`. Objetos com várias chaves de nível superior e arrays vazios são rejeitados.
- Arquivos TSV (valores separados por tabulação) são suportados junto com CSV.
