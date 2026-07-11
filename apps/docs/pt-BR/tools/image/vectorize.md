---
description: "Converte imagens raster em SVG com vetorização em preto e branco (potrace) e multicamadas em cores completas."
i18n_source_hash: f3e4777188ad
i18n_provenance: human
i18n_output_hash: 0314e857b390
---

# Imagem para SVG {#image-to-svg}

Vetoriza imagens raster em SVG usando algoritmos de traçado. Suporta traçado em preto e branco (potrace) e vetorização multicamadas em cores completas.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/vectorize`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| colorMode | string | Não | `"bw"` | Modo de traçado: `bw` (preto e branco) ou `color` (camadas multicoloridas) |
| threshold | number | Não | 128 | Limiar de brilho para o modo P&B (0 a 255). Pixels abaixo tornam-se pretos. |
| colorPrecision | number | Não | 6 | Precisão da quantização de cores para o modo colorido (1 a 16). Valores maiores produzem mais camadas de cores distintas. |
| layerDifference | number | Não | 6 | Diferença mínima de cor entre camadas no modo colorido (1 a 128) |
| filterSpeckle | number | Não | 4 | Área mínima para formas traçadas em pixels (1 a 256). Remove ruído/manchas. |
| pathMode | string | Não | `"spline"` | Suavização de caminho: `none` (irregular), `polygon` (segmentos retos), `spline` (curvas suaves) |
| cornerThreshold | number | Não | 60 | Limiar de ângulo para detecção de cantos no modo colorido (0 a 180 graus) |
| invert | boolean | Não | `false` | Inverte a imagem antes do traçado (troca preto/branco) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@logo.png" \
  -F 'settings={"colorMode":"bw","threshold":128,"filterSpeckle":4,"pathMode":"spline"}'
```

### Vetorização em Cores {#color-vectorization}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vectorize \
  -F "file=@illustration.png" \
  -F 'settings={"colorMode":"color","colorPrecision":8,"layerDifference":6,"filterSpeckle":4}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/logo.svg",
  "originalSize": 45678,
  "processedSize": 12345
}
```

## Notas {#notes}

- A saída é sempre um arquivo SVG, independentemente do formato de entrada.
- Suporta os formatos de entrada HEIC, RAW, PSD e SVG (decodificados automaticamente para raster antes do traçado).
- O modo P&B usa o algoritmo potrace. A imagem é primeiro convertida em tons de cinza e, em seguida, submetida a limiar para preto/branco puro antes do traçado.
- O modo colorido usa uma abordagem multicamadas: a imagem é quantizada em camadas de cor, cada uma traçada separadamente e empilhada na saída SVG.
- Valores menores de `filterSpeckle` preservam mais detalhes, mas produzem arquivos SVG maiores com mais caminhos.
- A configuração `pathMode` afeta significativamente o tamanho do arquivo: `none` produz o maior número de caminhos, `spline` produz a saída mais suave (e geralmente menor).
- Para melhores resultados com logotipos e ícones, use o modo P&B com uma entrada limpa e de alto contraste. Para fotografias ou ilustrações, use o modo colorido com um valor maior de `colorPrecision`.
