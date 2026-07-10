---
description: "Adicione bordas, espaçamento, cantos arredondados e sombras às imagens em uma ordem previsível e controlável."
i18n_source_hash: 8845150736a9
i18n_provenance: human
i18n_output_hash: 3f91f78162f2
---

# Borda e Moldura {#border-frame}

Adicione bordas, espaçamento, cantos arredondados e sombras às imagens. A ferramenta aplica os efeitos nesta ordem: espaçamento, borda, raio dos cantos e depois sombra.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/border`

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| borderWidth | number | Não | 10 | Espessura da borda em pixels (0 a 2000) |
| borderColor | string | Não | `"#000000"` | Cor da borda em hex (por exemplo, `#FF0000`) |
| padding | number | Não | 0 | Espaçamento interno entre a imagem e a borda em pixels (0 a 200) |
| paddingColor | string | Não | `"#FFFFFF"` | Cor de preenchimento do espaçamento em hex |
| cornerRadius | number | Não | 0 | Raio dos cantos em pixels (0 a 2000) |
| shadow | boolean | Não | `false` | Se deve adicionar uma sombra |
| shadowBlur | number | Não | 15 | Raio de desfoque da sombra (1 a 200) |
| shadowOffsetX | number | Não | 0 | Deslocamento horizontal da sombra (-50 a 50) |
| shadowOffsetY | number | Não | 5 | Deslocamento vertical da sombra (-50 a 50) |
| shadowColor | string | Não | `"#000000"` | Cor da sombra em hex |
| shadowOpacity | number | Não | 40 | Porcentagem de opacidade da sombra (0 a 100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/border \
  -F "file=@photo.jpg" \
  -F 'settings={"borderWidth":20,"borderColor":"#333333","cornerRadius":16,"shadow":true,"shadowBlur":25,"shadowOpacity":50}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 456789,
  "processedSize": 523456
}
```

## Observações {#notes}

- Usa a fábrica padrão `createToolRoute`. Aceita um único arquivo de imagem via upload multipart.
- Suporta os formatos de entrada HEIC, RAW, PSD e SVG (decodificados automaticamente).
- Ordem de processamento: o espaçamento é adicionado primeiro, depois a borda envolve a imagem, em seguida o raio dos cantos é aplicado e por fim a sombra é composta.
- Quando `cornerRadius` ou `shadow` está ativado, a saída é forçada para PNG (independentemente do formato de entrada) para preservar a transparência. Formatos que suportam alfa (PNG, WebP, AVIF) mantêm seu formato original.
- A sombra é sensível ao formato: ela acompanha os cantos arredondados em vez de criar uma sombra retangular.
- Definir `borderWidth` como 0 e usar apenas `cornerRadius` + `shadow` cria um efeito de sombra arredondada sem moldura.
