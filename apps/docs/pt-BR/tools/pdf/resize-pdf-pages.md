---
description: "Redimensiona todas as páginas de um PDF para A4, Carta, uma etiqueta de envio de 4x6 pol. ou um tamanho personalizado."
i18n_source_hash: 9db88016c07b
i18n_provenance: machine
i18n_output_hash: bf588bf4bb4b
i18n_hash_version: 2
---

# Resize PDF Pages {#resize-pdf-pages}

Altera o tamanho de todas as páginas de um PDF. O conteúdo é dimensionado para caber na nova página e centralizado, de modo que texto, arte vetorial e códigos de barras permaneçam nítidos. Use para transformar uma etiqueta de envio em uma página de 4x6 pol. para uma impressora térmica, ou para passar um documento entre A4 e US Letter.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/pdf/resize-pdf-pages`

Aceita dados de formulário multipart com um arquivo PDF e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| pageSize | string | Não | `"4x6in"` | Tamanho de destino: `4x6in`, `100x150mm`, `a4`, `a5`, `a6`, `letter`, `legal` ou `custom` |
| width | number | Não | `4` | Largura personalizada da página, usada quando `pageSize` é `custom` |
| height | number | Não | `6` | Altura personalizada da página, usada quando `pageSize` é `custom` |
| unit | string | Não | `"in"` | Unidade do tamanho personalizado: `in` ou `mm` |
| keepOrientation | boolean | Não | `false` | Gira o tamanho de destino para acompanhar a orientação de cada página, em vez de forçar largura por altura |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/pdf/resize-pdf-pages \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@label.pdf" \
  -F 'settings={"pageSize": "4x6in"}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/label_resized.pdf",
  "originalSize": 84200,
  "processedSize": 85100
}
```

## Notes {#notes}

- As páginas são dimensionadas para caber, nunca esticadas. Quando a proporção é diferente, o espaço restante fica em branco.
- Redimensionar não recorta. Uma etiqueta impressa em um quarto de uma página Carta ou A4 continua preenchendo apenas um quarto da nova página.
- Os tamanhos personalizados devem ter de 0,5 a 200 pol. (12,7 a 5080 mm) em cada lado.
- A página é redimensionada a partir da sua caixa de recorte, quando ela tem uma, então uma página recortada mantém apenas a região recortada.
