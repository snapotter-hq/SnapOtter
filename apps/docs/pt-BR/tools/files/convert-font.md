---
description: "Converta fontes entre TTF, OTF, WOFF e WOFF2."
i18n_source_hash: a17c8ef18e42
i18n_provenance: machine
i18n_output_hash: 2af64ab111c4
i18n_hash_version: 2
---

# Converter Fonte {#convert-font}

Converte um arquivo de fonte entre TrueType (TTF), OpenType CFF (OTF), WOFF e WOFF2. Use para transformar uma fonte de desktop em uma fonte web, ou para obter um TTF a partir de um OTF para um aplicativo que só aceita TrueType.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/files/convert-font`

Aceita dados de formulário multipart com um arquivo `.ttf`, `.otf`, `.woff` ou `.woff2` e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| format | string | Não | `ttf` | Formato de saída: `ttf`, `otf`, `woff` ou `woff2` |

## Exemplo de Requisição {#example-request}

OTF para TTF:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.otf" \
  -F 'settings={"format": "ttf"}'
```

TTF para WOFF2 para a web:

```bash
curl -X POST http://localhost:1349/api/v1/tools/files/convert-font \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@MyFont.ttf" \
  -F 'settings={"format": "woff2"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/MyFont.ttf",
  "originalSize": 48120,
  "processedSize": 61344
}
```

## Observações {#notes}

- WOFF e WOFF2 são invólucros compactados em torno dos mesmos dados de fonte, então converter de ou para eles mantém os contornos inalterados.
- OTF para TTF converte curvas cúbicas (CFF) em curvas quadráticas TrueType. Cada curva fica a menos de 1 unidade de fonte da original, o que é invisível em tamanhos normais, mas a conversão não é exatamente reversível. TTF para OTF mantém o formato das curvas e só arredonda os pontos de controle para unidades de fonte inteiras.
- As permissões de incorporação da fonte (o campo OS/2 `fsType`) são mantidas como estão.
- Coleções de fontes (`.ttc`) não são suportadas. Fontes TrueType variáveis não podem ser convertidas para OTF, e fontes CFF2 variáveis não podem ser convertidas para TTF; converta essas para WOFF ou WOFF2.
- A conversão roda no worker de documentos em Python, com o mesmo tempo limite das outras ferramentas de documentos, e não dentro do processo da API.
