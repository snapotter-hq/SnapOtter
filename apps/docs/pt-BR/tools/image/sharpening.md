---
description: "Realce imagens usando os métodos adaptativo, máscara de nitidez (unsharp mask) ou passa-alta, com redução de ruído opcional."
i18n_source_hash: 66dce4068899
i18n_provenance: human
i18n_output_hash: 4d24bdae0af1
---

# Aplicar Nitidez na Imagem {#sharpening}

Ferramenta avançada de nitidez com três métodos: adaptativo (inteligente, sensível a bordas), máscara de nitidez (unsharp mask, com raio/quantidade clássicos) e passa-alta (ênfase em textura). Inclui redução de ruído embutida para evitar artefatos de nitidez.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/sharpening`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| method | string | Não | `"adaptive"` | Algoritmo de nitidez: `adaptive`, `unsharp-mask`, `high-pass` |
| sigma | number | Não | `1.0` | Adaptativo: sigma gaussiano (0.5 a 10) |
| m1 | number | Não | `1.0` | Adaptativo: nitidez em áreas planas (0 a 10) |
| m2 | number | Não | `3.0` | Adaptativo: nitidez em áreas irregulares (0 a 20) |
| x1 | number | Não | `2.0` | Adaptativo: limiar plano/irregular (0 a 10) |
| y2 | number | Não | `12` | Adaptativo: nitidez máxima em áreas planas (0 a 50) |
| y3 | number | Não | `20` | Adaptativo: nitidez máxima em áreas irregulares (0 a 50) |
| amount | number | Não | `100` | Máscara de nitidez: quantidade de nitidez (0 a 1000) |
| radius | number | Não | `1.0` | Máscara de nitidez: raio de desfoque em pixels (0.1 a 5) |
| threshold | number | Não | `0` | Máscara de nitidez: diferença mínima de brilho para aplicar nitidez (0 a 255) |
| strength | number | Não | `50` | Passa-alta: intensidade do filtro (0 a 100) |
| kernelSize | number | Não | `3` | Passa-alta: tamanho do kernel de convolução (3 ou 5) |
| denoise | string | Não | `"off"` | Redução de ruído antes da nitidez: `off`, `light`, `medium`, `strong` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "adaptive", "sigma": 1.5}'
```

Máscara de nitidez com limiar para proteger áreas suaves:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/sharpening \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"method": "unsharp-mask", "amount": 150, "radius": 1.5, "threshold": 10}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2510000
}
```

## Notas {#notes}

- Apenas os parâmetros relevantes ao método escolhido são usados. Por exemplo, `amount`, `radius` e `threshold` são ignorados quando `method` é `adaptive`.
- O método adaptativo usa a nitidez adaptativa embutida do Sharp, com comportamento configurável para regiões planas/irregulares.
- A opção `denoise` aplica redução de ruído antes da nitidez para evitar a amplificação de ruído/granulação.
- A nitidez passa-alta extrai detalhes finos subtraindo uma versão desfocada do original e, em seguida, mesclando de volta.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
