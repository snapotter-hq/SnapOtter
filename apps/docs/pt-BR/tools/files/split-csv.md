---
description: "Divida um CSV em arquivos menores por contagem de linhas."
i18n_source_hash: a35dce4a99a3
i18n_provenance: human
i18n_output_hash: 477c07b546cd
---

# Dividir CSV {#split-csv}

Divida um arquivo CSV ou TSV grande em arquivos menores por contagem de linhas. Retorna um arquivo ZIP contendo as partes.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/split-csv`

Aceita dados de formulário multipart com um arquivo CSV e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| rowsPerFile | integer | Não | `1000` | Número de linhas de dados por arquivo de saída (1-1.000.000) |
| keepHeader | boolean | Não | `true` | Repetir a linha de cabeçalho em cada arquivo de saída |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/split-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@large-dataset.csv" \
  -F 'settings={"rowsPerFile": 500, "keepHeader": true}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/large-dataset_parts.zip",
  "originalSize": 1048576,
  "processedSize": 1050000
}
```

## Observações {#notes}

- A saída é sempre um arquivo ZIP contendo as partes CSV divididas, nomeadas sequencialmente (por exemplo, `part-1.csv`, `part-2.csv`).
- Quando `keepHeader` é `true`, cada parte inclui a linha de cabeçalho original, para que cada arquivo possa ser usado de forma independente.
- Arquivos CSV e TSV são aceitos como entrada.
- A contagem de linhas refere-se apenas às linhas de dados; a linha de cabeçalho não é contada.
