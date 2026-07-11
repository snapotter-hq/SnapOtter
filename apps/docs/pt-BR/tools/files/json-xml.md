---
description: "Converta entre JSON e XML, em ambas as direções."
i18n_source_hash: b3a6ded0c64a
i18n_provenance: human
i18n_output_hash: d95833b7f730
---

# JSON para XML {#json-to-xml}

Converta entre os formatos JSON e XML em ambas as direções. Envie um arquivo JSON para obter XML, ou envie um arquivo XML para obter JSON.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/json-xml`

Aceita dados de formulário multipart com um arquivo JSON ou XML e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| pretty | boolean | Não | `true` | Formatar a saída de forma legível, com indentação |

## Exemplo de Requisição {#example-request}

JSON para XML:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.json" \
  -F 'settings={"pretty": true}'
```

XML para JSON:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/json-xml \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@config.xml" \
  -F 'settings={"pretty": true}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/config.xml",
  "originalSize": 850,
  "processedSize": 1200
}
```

## Notas {#notes}

- A direção da conversão é detectada automaticamente pela extensão do arquivo de entrada: `.json` produz `.xml`, e `.xml` produz `.json`.
- O parâmetro `pretty` se aplica a ambas as direções. Quando `false`, a saída é compacta, sem indentação.
- Atributos XML e estruturas aninhadas são preservados durante a conversão de ida e volta sempre que possível.
