---
description: "Compare duas imagens lado a lado com visualização de diferença em nível de pixel e pontuação de similaridade."
i18n_source_hash: cc0a02bd75c6
i18n_provenance: human
i18n_output_hash: 2fb767442686
---

# Comparar Imagens {#image-compare}

Envie duas imagens para calcular um mapa de diferença em nível de pixel e uma porcentagem numérica de similaridade. A saída é uma imagem de diferença que destaca em vermelho as regiões alteradas.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/compare`

Aceita dados de formulário multipart com **duas** imagens. Nenhum campo de configuração é necessário.

## Parâmetros {#parameters}

Esta ferramenta não tem parâmetros configuráveis. Envie exatamente duas imagens.

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|----------|-------------|
| file (primeira) | file | Sim | A primeira imagem |
| file (segunda) | file | Sim | A segunda imagem |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compare \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@original.jpg" \
  -F "file=@modified.jpg"
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "similarity": 94.52,
  "dimensions": { "width": 1920, "height": 1080 },
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/diff.png",
  "originalSize": 4900000,
  "processedSize": 280000
}
```

## Campos da Resposta {#response-fields}

| Campo | Tipo | Descrição |
|-------|------|-------------|
| jobId | string | Identificador do trabalho para baixar a imagem de diferença |
| similarity | number | Porcentagem de similaridade entre as duas imagens (0 a 100) |
| dimensions | object | Largura e altura usadas na comparação |
| downloadUrl | string | URL para baixar a imagem de diferença gerada |
| originalSize | number | Tamanho combinado de ambas as imagens de entrada em bytes |
| processedSize | number | Tamanho da imagem de diferença de saída em bytes |

## Notas {#notes}

- Ambas as imagens são redimensionadas para as mesmas dimensões (o máximo de cada eixo) antes da comparação.
- A imagem de diferença destaca as diferenças em vermelho com opacidade proporcional à magnitude da mudança. Pixels idênticos ou quase idênticos (diferença < 10) são exibidos como versões semitransparentes do original.
- A similaridade é calculada como o inverso da diferença média de pixels em todos os pixels, expressa como porcentagem.
- Uma similaridade de 100% significa que as imagens são idênticas pixel a pixel (na resolução de comparação).
- A saída de diferença é sempre no formato PNG, independentemente dos formatos de entrada.
- Ambas as imagens são validadas e decodificadas (HEIC, RAW, PSD, SVG suportados) antes da comparação.
- A orientação EXIF é aplicada automaticamente em ambas as imagens antes do processamento.
