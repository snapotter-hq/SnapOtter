---
description: "Converta entre YAML e JSON, nos dois sentidos."
i18n_source_hash: acf8ca21ee99
i18n_provenance: human
i18n_output_hash: 7b61b929445e
---

# YAML / JSON {#yaml-json}

Converta entre os formatos YAML e JSON nos dois sentidos. Envie um arquivo YAML para obter JSON, ou envie um arquivo JSON para obter YAML.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/files/yaml-json`

Aceita dados de formulário multipart com um arquivo YAML ou JSON. Não é necessário nenhum campo de configurações.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. O sentido da conversão é determinado pela extensão do arquivo de entrada.

## Exemplo de Requisição {#example-request}

YAML para JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.yaml"
```

JSON para YAML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/yaml-json \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.json",
  "originalSize": 620,
  "processedSize": 780
}
```

## Observações {#notes}

- O sentido da conversão é detectado automaticamente pela extensão do arquivo de entrada: `.yaml` ou `.yml` produz `.json`, e `.json` produz `.yaml`.
- Ambas as extensões `.yaml` e `.yml` são aceitas.
- Apenas o primeiro documento de um arquivo YAML com múltiplos documentos é convertido; documentos adicionais separados por `---` são ignorados.
