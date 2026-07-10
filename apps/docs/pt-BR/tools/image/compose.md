---
description: "Sobreponha imagens com posição, opacidade e modos de mesclagem para composição."
i18n_source_hash: c5d09eb13fde
i18n_provenance: human
i18n_output_hash: 8aee6442d54e
---

# Composição de Imagens {#image-composition}

Sobreponha uma imagem de sobreposição em cima de uma imagem base com posição, opacidade e modo de mesclagem configuráveis. Útil para compor logotipos, gráficos ou combinar várias imagens.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/compose`

Aceita dados de formulário multipart com **duas** imagens e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| x | number | Não | `0` | Deslocamento horizontal da sobreposição a partir do canto superior esquerdo em pixels (mín. 0) |
| y | number | Não | `0` | Deslocamento vertical da sobreposição a partir do canto superior esquerdo em pixels (mín. 0) |
| opacity | number | Não | `100` | Porcentagem de opacidade da sobreposição (0 a 100) |
| blendMode | string | Não | `"over"` | Modo de mesclagem da composição |

### Modos de Mesclagem {#blend-modes}

| Valor | Descrição |
|-------|-------------|
| `over` | Sobreposição normal (padrão) |
| `multiply` | Escurece multiplicando os valores dos pixels |
| `screen` | Clareia invertendo, multiplicando e invertendo novamente |
| `overlay` | Combina multiplicação e clareamento com base no brilho da base |
| `darken` | Mantém o pixel mais escuro de cada camada |
| `lighten` | Mantém o pixel mais claro de cada camada |
| `hard-light` | Sobreposição de forte contraste |
| `soft-light` | Sobreposição de contraste sutil |
| `difference` | Diferença absoluta entre as camadas |
| `exclusion` | Semelhante à diferença, mas com menor contraste |

### Campos de Arquivo {#file-fields}

| Nome do Campo | Obrigatório | Descrição |
|------------|----------|-------------|
| file | Sim | A imagem base/de fundo |
| overlay | Sim | A imagem de sobreposição/primeiro plano |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@background.jpg" \
  -F "overlay=@graphic.png" \
  -F 'settings={"x": 100, "y": 50, "opacity": 80, "blendMode": "over"}'
```

Usando o modo de mesclagem multiplicação:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compose \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F "overlay=@texture.jpg" \
  -F 'settings={"x": 0, "y": 0, "opacity": 50, "blendMode": "multiply"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/background.jpg",
  "originalSize": 3200000,
  "processedSize": 3450000
}
```

## Notas {#notes}

- Ambas as imagens são validadas e decodificadas (HEIC, RAW, PSD, SVG suportados) antes da composição.
- A sobreposição é posicionada nas coordenadas exatas de pixel especificadas por `x` e `y`. Ela não é redimensionada para caber.
- Se a opacidade for menor que 100, uma máscara alfa é aplicada à sobreposição antes da mesclagem.
- A sobreposição pode se estender além dos limites da imagem base (ela será recortada).
- A orientação EXIF é aplicada automaticamente em ambas as imagens antes do processamento.
- As dimensões de saída correspondem às dimensões da imagem base.
