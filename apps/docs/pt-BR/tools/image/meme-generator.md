---
description: "Crie memes com templates ou imagens personalizadas, caixas de texto estilizadas e opções de fonte."
i18n_source_hash: 0a4970112ca6
i18n_provenance: human
i18n_output_hash: 2975f7e63209
---

# Gerador de Memes {#meme-generator}

Crie memes usando templates integrados ou imagens personalizadas. Adicione texto com o estilo clássico de meme (texto em negrito e contornado), vários presets de layout e opções de fonte.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/meme-generator`

Aceita:
- **Dados de formulário multipart** com um arquivo de imagem e um campo JSON `settings` (modo de imagem personalizada)
- **Corpo JSON** com um `templateId` (modo de template, sem necessidade de upload de arquivo)

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| templateId | string | Não | - | ID do template de meme integrado. Se fornecido, não é necessário upload de imagem |
| textLayout | string | Não | `"top-bottom"` | Layout da caixa de texto: `top-bottom`, `top-only`, `bottom-only`, `center`, `side-by-side` |
| textBoxes | array | Não | `[]` | Array de objetos de caixa de texto com os campos `id` e `text` |
| fontFamily | string | Não | `"anton"` | Fonte: `anton`, `arial-black`, `comic-sans`, `montserrat`, `bebas-neue`, `permanent-marker`, `roboto` |
| fontSize | number | Não | auto | Tamanho da fonte em pixels (8 a 200). Calculado automaticamente se omitido |
| textColor | string | Não | `"#ffffff"` | Cor de preenchimento do texto |
| strokeColor | string | Não | `"#000000"` | Cor do traço/contorno do texto |
| textAlign | string | Não | `"center"` | Alinhamento do texto: `left`, `center`, `right` |
| allCaps | boolean | Não | `true` | Converter texto para maiúsculas |

### Caixas de Texto {#text-boxes}

Cada entrada no array `textBoxes` deve ter:

| Campo | Tipo | Descrição |
|-------|------|-------------|
| id | string | Identificador da caixa correspondente ao layout (por exemplo, `"top"`, `"bottom"`, `"left"`, `"right"`, `"center"`) |
| text | string | O texto do meme a ser exibido |

### IDs das Caixas por Layout de Texto {#text-layout-box-ids}

| Layout | IDs de Caixa Disponíveis |
|--------|-------------------|
| `top-bottom` | `top`, `bottom` |
| `top-only` | `top` |
| `bottom-only` | `bottom` |
| `center` | `center` |
| `side-by-side` | `left`, `right` |

## Exemplo de Requisição {#example-request}

Imagem personalizada com texto superior e inferior:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"textLayout": "top-bottom", "textBoxes": [{"id": "top", "text": "When the code works"}, {"id": "bottom", "text": "On the first try"}], "fontFamily": "anton", "allCaps": true}'
```

Usando um template integrado (corpo JSON, sem upload de arquivo):

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/meme-generator \
  -H "Authorization: Bearer si_your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"templateId": "drake", "textBoxes": [{"id": "top", "text": "Manual testing"}, {"id": "bottom", "text": "Automated tests"}]}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/meme-drake.png",
  "originalSize": 450000,
  "processedSize": 520000
}
```

## Notas {#notes}

- É necessário fornecer `templateId` ou um arquivo de imagem enviado. Se ambos forem fornecidos, o template é usado.
- Os templates definem suas próprias posições de caixa de texto; o parâmetro `textLayout` é ignorado ao usar templates.
- O texto é renderizado como SVG com contornos de traço para o visual clássico de meme.
- O tamanho da fonte é calculado automaticamente para caber na caixa de texto se não for definido explicitamente.
- Caixas de texto vazias são ignoradas (nenhuma renderização ocorre se todas as caixas estiverem vazias).
- O nome do arquivo de saída inclui o ID do template ao usar templates (por exemplo, `meme-drake.png`).
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
