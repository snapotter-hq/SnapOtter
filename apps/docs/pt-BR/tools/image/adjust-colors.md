---
description: "Ajuste brilho, contraste, saturação, temperatura, matiz, canais e aplique efeitos de cor."
i18n_source_hash: 41b35fe5c2ba
i18n_provenance: human
i18n_output_hash: 476f7ea72efd
---

# Ajustar Cores {#adjust-colors}

Ferramenta abrangente de ajuste de cores que combina brilho, contraste, exposição, saturação, temperatura, tonalidade, rotação de matiz, níveis por canal e efeitos de um clique (escala de cinza, sépia, inverter) em um único endpoint.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/adjust-colors`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| brightness | number | Não | `0` | Ajuste de brilho (-100 a 100) |
| contrast | number | Não | `0` | Ajuste de contraste (-100 a 100) |
| exposure | number | Não | `0` | Exposição / gama dos tons médios (-100 a 100) |
| saturation | number | Não | `0` | Saturação de cor (-100 a 100) |
| temperature | number | Não | `0` | Balanço de branco: frio/azul a quente/laranja (-100 a 100) |
| tint | number | Não | `0` | Deslocamento de tonalidade: verde a magenta (-100 a 100) |
| hue | number | Não | `0` | Rotação de matiz em graus (-180 a 180) |
| sharpness | number | Não | `0` | Intensidade da nitidez (0 a 100) |
| red | number | Não | `100` | Nível do canal vermelho (0 a 200, 100 = inalterado) |
| green | number | Não | `100` | Nível do canal verde (0 a 200, 100 = inalterado) |
| blue | number | Não | `100` | Nível do canal azul (0 a 200, 100 = inalterado) |
| effect | string | Não | `"none"` | Efeito de cor: `none`, `grayscale`, `sepia`, `invert` |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"brightness": 20, "contrast": 10, "saturation": -30, "effect": "none"}'
```

Aplique um visual vintage quente:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/adjust-colors \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"temperature": 40, "saturation": -15, "contrast": 10, "effect": "sepia"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2380000
}
```

## Observações {#notes}

- Todos os parâmetros têm valores neutros como padrão, para que você ajuste apenas o que precisar.
- Os ajustes são aplicados nesta ordem: brilho, contraste, exposição, saturação/matiz, temperatura/tonalidade, nitidez, canais, efeitos.
- A temperatura usa uma matriz 3x3 de recombinação de cores nos eixos azul-laranja e verde-magenta.
- A exposição é mapeada para a função gama do Sharp (valores positivos clareiam os tons médios, negativos os escurecem).
- Este endpoint também responde nos caminhos legados `/api/v1/tools/image/brightness-contrast`, `/api/v1/tools/image/saturation`, `/api/v1/tools/image/color-channels` e `/api/v1/tools/image/color-effects`. Todos usam o mesmo esquema.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
