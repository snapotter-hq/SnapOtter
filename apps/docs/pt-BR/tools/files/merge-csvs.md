---
description: "Combine vários arquivos CSV ou TSV com colunas correspondentes em um só."
i18n_source_hash: 109b5f399ac8
i18n_provenance: human
i18n_output_hash: c564dc63c256
---

# Mesclar CSVs {#merge-csvs}

Combine vários arquivos CSV ou TSV com colunas correspondentes em um único arquivo mesclado. Todos os arquivos de entrada devem ter os mesmos cabeçalhos de coluna.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/merge-csvs`

Aceita dados de formulário multipart com dois ou mais arquivos CSV. Não é necessário nenhum campo de configurações.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie de 2 a 20 arquivos CSV ou TSV com cabeçalhos de coluna correspondentes.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/merge-csvs \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@january.csv" \
  -F "file=@february.csv" \
  -F "file=@march.csv"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/merged.csv",
  "originalSize": 30000,
  "processedSize": 28500
}
```

## Observações {#notes}

- Requer entre 2 e 20 arquivos de entrada.
- Todos os arquivos devem compartilhar os mesmos cabeçalhos de coluna. A mesclagem falhará se as colunas não corresponderem.
- A linha de cabeçalho é incluída uma vez na saída; as linhas de dados de todos os arquivos são concatenadas na ordem de envio.
- Arquivos CSV e TSV são aceitos, mas todos os arquivos em uma única requisição devem usar o mesmo delimitador.
