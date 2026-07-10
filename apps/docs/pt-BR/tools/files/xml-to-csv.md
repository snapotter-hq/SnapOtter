---
description: "Extraia elementos repetidos de um XML para uma tabela CSV."
i18n_source_hash: 3ab1019bff8a
i18n_provenance: human
i18n_output_hash: 6d89acb448c5
---

# XML para CSV {#xml-to-csv}

Extraia elementos repetidos de um arquivo XML para uma tabela CSV plana. A ferramenta encontra automaticamente o primeiro array de objetos na árvore XML e mapeia cada elemento para uma linha.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/xml-to-csv`

Aceita dados de formulário multipart com um arquivo XML. Não é necessário nenhum campo de configurações.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. O elemento repetido é detectado automaticamente a partir da estrutura do XML.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/xml-to-csv \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@catalog.xml"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/catalog.csv",
  "originalSize": 4500,
  "processedSize": 1800
}
```

## Observações {#notes}

- Apenas arquivos `.xml` são aceitos como entrada.
- A ferramenta varre a árvore XML em busca do primeiro conjunto repetido de elementos irmãos e os usa como linhas.
- Cada nome único de elemento filho ou atributo se torna um cabeçalho de coluna do CSV.
- Esta é uma conversão de mão única. Para conversão bidirecional entre JSON/XML, use a ferramenta [JSON para XML](/pt-BR/tools/files/json-xml).
