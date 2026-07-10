---
description: "Gere códigos de barras nos formatos Code 128, EAN-13, UPC-A, Code 39, ITF-14 e Data Matrix."
i18n_source_hash: e84b1df40c7e
i18n_provenance: human
i18n_output_hash: 64dcfffc6349
---

# Gerador de Código de Barras {#barcode-generator}

Gere imagens de código de barras a partir de texto. Suporta os formatos Code 128, EAN-13, UPC-A, Code 39, ITF-14 e Data Matrix.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/barcode-generate`

Aceita um corpo `application/json` (não multipart). O código de barras é gerado a partir do texto fornecido, não de um arquivo enviado.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| text | string | Sim | - | Texto a codificar no código de barras (1-256 caracteres) |
| type | string | Não | `"code128"` | Formato do código de barras: `code128`, `ean13`, `upca`, `code39`, `itf14`, `datamatrix` |
| scale | integer | Não | `3` | Fator de escala da imagem (1-8) |
| includeText | boolean | Não | `true` | Se o texto deve ser renderizado abaixo do código de barras |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/barcode-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "5901234123457", "type": "ean13", "scale": 4}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/barcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Observações {#notes}

- Diferente da maioria das ferramentas, este endpoint aceita um corpo JSON, não dados de formulário multipart, já que os códigos de barras são gerados a partir de texto e não de um arquivo enviado.
- O EAN-13 requer exatamente 12 ou 13 dígitos. O UPC-A requer exatamente 11 ou 12 dígitos. Se um dígito verificador for omitido, ele é calculado automaticamente.
- O Code 128 é o formato mais flexível e suporta todo o conjunto de caracteres ASCII.
- O Data Matrix produz um código de barras 2D adequado para codificar strings mais longas em um quadrado compacto.
