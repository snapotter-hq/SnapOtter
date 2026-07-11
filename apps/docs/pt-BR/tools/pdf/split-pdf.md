---
description: "Extraia páginas ou divida um PDF em partes."
i18n_source_hash: 5c8d8041d219
i18n_provenance: human
i18n_output_hash: 1db35b82cee8
---

# Split PDF {#split-pdf}

Extraia um intervalo de páginas para um novo PDF ou divida um documento em blocos de N páginas.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/split-pdf`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `"range"` | Modo de divisão: `range` ou `every` |
| range | string | Quando o modo é `range` | - | Intervalo de páginas na sintaxe qpdf, por exemplo `"1-5,8,10-z"` |
| everyN | integer | Quando o modo é `every` | - | Divide em blocos de N páginas (1-500) |

## Example Request {#example-request}

Extrair páginas específicas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "range", "range": "1-5,8"}'
```

Dividir em blocos de 10 páginas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/split-pdf \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@document.pdf" \
  -F 'settings={"mode": "every", "everyN": 10}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/document.pdf",
  "originalSize": 2450000,
  "processedSize": 980000
}
```

## Notes {#notes}

- No modo `range`, é retornado um único PDF contendo as páginas selecionadas.
- No modo `every`, o resultado é um arquivo ZIP contendo as partes individuais.
- Os intervalos de páginas usam a sintaxe qpdf: `1-5` para as páginas 1 a 5, `z` para a última página, e vírgulas para combinar intervalos (por exemplo `1-3,7,10-z`).
