---
description: "Gere QR codes com cores personalizadas e níveis de correção de erros."
i18n_source_hash: 096ef4d90da5
i18n_provenance: human
i18n_output_hash: 99f1023a35f9
---

# Gerador de QR Code {#qr-code-generator}

Gere imagens de QR code a partir de texto ou URLs com tamanho configurável, nível de correção de erros e cores personalizadas de primeiro plano/fundo.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/qr-generate`

Aceita um **corpo JSON** (não multipart). Nenhum upload de arquivo é necessário.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| text | string | Sim | - | Conteúdo a codificar no QR code (1 a 2000 caracteres) |
| size | number | Não | `400` | Largura/altura da imagem de saída em pixels (100 a 10000) |
| errorCorrection | string | Não | `"M"` | Nível de correção de erros: `L` (7%), `M` (15%), `Q` (25%), `H` (30%) |
| foreground | string | Não | `"#000000"` | Cor de primeiro plano/módulo do QR code em hexadecimal (`#RRGGBB`) |
| background | string | Não | `"#FFFFFF"` | Cor de fundo do QR code em hexadecimal (`#RRGGBB`) |
| logoDataUri | string | Não | - | Imagem do logo como um data URI (`data:image/png;base64,...` ou `data:image/jpeg;base64,...`, máximo de 700 KB). Centralizado no QR code a 22% do tamanho do QR. Força a correção de erros para `H` |

### Níveis de Correção de Erros {#error-correction-levels}

| Nível | Recuperação | Caso de Uso |
|-------|----------|----------|
| `L` | ~7% | Densidade máxima de dados |
| `M` | ~15% | Equilibrado (padrão) |
| `Q` | ~25% | Bom para códigos impressos |
| `H` | ~30% | Melhor para códigos com logos sobrepostos |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "https://snapotter.com", "size": 500, "errorCorrection": "H"}'
```

QR code com marca e cores personalizadas:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/qr-generate \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello World", "size": 300, "foreground": "#1a365d", "background": "#f7fafc"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/qrcode.png",
  "originalSize": 0,
  "processedSize": 4520
}
```

## Notas {#notes}

- Este endpoint aceita JSON, e não dados de formulário multipart, pois nenhum upload de imagem é necessário.
- A saída é sempre uma imagem PNG.
- O nome do arquivo de saída é sempre `qrcode.png`.
- `originalSize` é sempre 0, já que esta ferramenta gera imagens do zero.
- Uma zona de silêncio (margem) de 2 módulos é incluída ao redor do QR code.
- O comprimento máximo do texto é 2000 caracteres. A capacidade real depende do nível de correção de erros e da codificação de caracteres.
- Níveis mais altos de correção de erros permitem que o QR code permaneça legível mesmo se parcialmente obscurecido, mas reduzem a capacidade de dados.
- Quando um `logoDataUri` é fornecido, a correção de erros é forçada automaticamente para `H` (30%), de modo que o QR code permaneça legível apesar do logo ocultar o centro.
