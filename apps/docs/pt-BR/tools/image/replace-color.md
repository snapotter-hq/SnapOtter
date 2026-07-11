---
description: "Substitua uma cor específica de uma imagem por outra cor ou torne-a transparente."
i18n_source_hash: df55ac451ecb
i18n_provenance: human
i18n_output_hash: 78b1ca6fd377
---

# Substituir e Inverter Cor {#replace-invert-color}

Substitua os pixels que correspondem a uma cor de origem por uma cor de destino, ou torne-os transparentes. Usa a distância euclidiana no espaço RGB com tolerância configurável para uma mesclagem suave nas fronteiras entre cores.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/replace-color`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| sourceColor | string | Não | `"#FF0000"` | Cor hexadecimal a localizar (formato: `#RRGGBB`) |
| targetColor | string | Não | `"#00FF00"` | Cor hexadecimal para substituir (formato: `#RRGGBB`) |
| makeTransparent | boolean | Não | `false` | Tornar os pixels correspondentes transparentes em vez de substituí-los pela cor de destino |
| tolerance | number | Não | `30` | Tolerância de correspondência de cor (0 a 255). Valores mais altos correspondem a uma gama mais ampla de cores semelhantes |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"sourceColor": "#FF0000", "targetColor": "#0000FF", "tolerance": 40}'
```

Tornar um fundo verde transparente:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/replace-color \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@greenscreen.png" \
  -F 'settings={"sourceColor": "#00FF00", "makeTransparent": true, "tolerance": 50}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 2100000
}
```

## Notas {#notes}

- A correspondência de cor usa a distância euclidiana no espaço RGB, escalonada por `tolerance * sqrt(3)`.
- A mesclagem de substituição é proporcional à distância de cor: pixels mais próximos da cor de origem recebem mais da cor de destino, criando transições suaves.
- Quando `makeTransparent` é `true`, a saída é forçada para PNG (ou WebP/AVIF) se o formato de entrada não suportar canais alfa (por exemplo, JPEG).
- Uma tolerância de 0 corresponde apenas à cor de origem exata. Valores mais altos (50+) corresponderão a uma gama mais ampla de matizes semelhantes.
- O formato de saída corresponde ao formato de entrada, a menos que seja necessária transparência e o formato de entrada não tenha suporte a alfa.
