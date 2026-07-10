---
description: "Gere um gráfico de histograma RGB com estatísticas por canal a partir de uma imagem."
i18n_source_hash: 57aa610206a5
i18n_provenance: human
i18n_output_hash: 482b3a5a6e05
---

# Histograma {#histogram}

Gere um gráfico de histograma RGB a partir de uma imagem. Retorna uma imagem PNG do histograma junto com estatísticas por canal e dados brutos de histograma de 256 bins no JSON da resposta.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/histogram`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| scale | string | Não | `"linear"` | Escala do eixo Y: `linear` ou `log` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/histogram \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"scale": "linear"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/histogram.png",
  "originalSize": 2450000,
  "processedSize": 12000,
  "bins": {
    "r": [0, 12, 45, "... (256 values)"],
    "g": [0, 8, 38, "... (256 values)"],
    "b": [2, 15, 52, "... (256 values)"],
    "lum": [0, 10, 40, "... (256 values)"]
  },
  "stats": {
    "r": { "mean": 128, "median": 132, "stdev": 48.5 },
    "g": { "mean": 119, "median": 121, "stdev": 44.2 },
    "b": { "mean": 105, "median": 108, "stdev": 51.3 },
    "lum": { "mean": 118, "median": 120, "stdev": 45.1 }
  },
  "mean": { "r": 128, "g": 119, "b": 105 },
  "max": { "r": 4200, "g": 3800, "b": 4100 }
}
```

## Observações {#notes}

- O `downloadUrl` aponta para um gráfico de histograma PNG renderizado mostrando as distribuições de R, G, B e luminância.
- `bins` contém arrays brutos de 256 valores para cada canal (vermelho, verde, azul, luminância), adequados para renderizar visualizações personalizadas.
- `stats` fornece média, mediana e desvio padrão por canal.
- `mean` e `max` são campos abreviados compatíveis com versões anteriores.
- Use a escala `log` quando o histograma for dominado por alguns picos e você quiser ver detalhes nos bins mais baixos.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes da análise.
