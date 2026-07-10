---
description: "Extraia arquivos de um arquivo ZIP com segurança, com proteção contra zip bombs."
i18n_source_hash: 484a1f1051b8
i18n_provenance: human
i18n_output_hash: 08695f8520ba
---

# Extrair ZIP {#extract-zip}

Extraia arquivos de um arquivo ZIP com segurança. Arquivos ZIP de um único arquivo retornam o arquivo contido diretamente; arquivos ZIP com vários arquivos retornam um ZIP plano com o conteúdo extraído.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/extract-zip`

Aceita dados de formulário multipart com um arquivo ZIP. Nenhum campo de configurações é necessário.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie um arquivo `.zip` para extrair.

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/extract-zip \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@archive.zip"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/archive_extracted.zip",
  "originalSize": 2800000,
  "processedSize": 3500000
}
```

## Notas {#notes}

- Apenas arquivos `.zip` são aceitos como entrada.
- Se o arquivo contiver um único arquivo, esse arquivo é retornado diretamente (sem ser empacotado em um ZIP).
- Se o arquivo contiver vários arquivos, um ZIP plano é retornado com todos os arquivos extraídos para o nível raiz (a estrutura de diretórios aninhados é achatada).
- A proteção interna contra zip bombs rejeita arquivos com taxas de compressão ou quantidades de arquivos excessivas, para evitar o esgotamento de recursos.
