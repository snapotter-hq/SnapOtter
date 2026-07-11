---
description: "Simule como as imagens aparecem para pessoas com diferentes tipos de deficiência de visão de cores."
i18n_source_hash: 0b537628ba79
i18n_provenance: human
i18n_output_hash: 7e208b699d1a
---

# Simulação de Daltonismo {#color-blindness-simulation}

Simule a deficiência de visão de cores (CVD) para pré-visualizar como as imagens aparecem para pessoas com vários tipos de daltonismo. Útil para testes de acessibilidade de designs, gráficos e interfaces.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/color-blindness`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| simulationType | string | Não | `"deuteranomaly"` | Tipo de deficiência de visão de cores a simular |

### Tipos de Simulação {#simulation-types}

| Valor | Condição | Descrição |
|-------|-----------|-------------|
| `protanopia` | Cego para vermelho | Ausência completa de cones vermelhos |
| `deuteranopia` | Cego para verde | Ausência completa de cones verdes |
| `tritanopia` | Cego para azul | Ausência completa de cones azuis |
| `protanomaly` | Fraqueza para vermelho | Sensibilidade reduzida dos cones vermelhos |
| `deuteranomaly` | Fraqueza para verde | Sensibilidade reduzida dos cones verdes (mais comum) |
| `tritanomaly` | Fraqueza para azul | Sensibilidade reduzida dos cones azuis |
| `achromatopsia` | Daltonismo total | Ausência completa de visão de cores |
| `blueConeMonochromacy` | Apenas cones azuis | Apenas os cones azuis funcionais |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/color-blindness \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@design.png" \
  -F 'settings={"simulationType": "deuteranopia"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/design.png",
  "originalSize": 1850000,
  "processedSize": 1820000
}
```

## Notas {#notes}

- A deuteranomalia (fraqueza para verde) é o padrão por ser a forma mais comum de deficiência de visão de cores, afetando cerca de 6% dos homens.
- A simulação usa matrizes de transformação de cores que modelam como os fotorreceptores de cone reduzidos ou ausentes alteram as cores percebidas.
- Esta ferramenta é não destrutiva e produz apenas uma pré-visualização. Ela não modifica a imagem original para acessibilidade.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
