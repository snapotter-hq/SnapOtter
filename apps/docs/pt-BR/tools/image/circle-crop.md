---
description: "Recorte uma imagem em um círculo centralizado com cantos transparentes."
i18n_source_hash: 06c50ccd96b2
i18n_provenance: human
i18n_output_hash: 185deacd8a14
---

# Recorte Circular {#circle-crop}

Recorte uma imagem em um círculo centralizado com cantos transparentes. Suporta zoom, deslocamento, borda e tamanho de saída ajustáveis.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/image/circle-crop`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| zoom | number | Não | `1` | Fator de zoom (1-5); valores mais altos recortam mais de perto |
| offsetX | number | Não | `0.5` | Posição horizontal do centro (0-1) |
| offsetY | number | Não | `0.5` | Posição vertical do centro (0-1) |
| borderWidth | integer | Não | `0` | Largura da borda em pixels (0-200) |
| borderColor | string | Não | `"#ffffff"` | Cor hex da borda |
| background | string | Não | `"transparent"` | Preenchimento dos cantos: `"transparent"` ou uma cor hex |
| outputSize | integer | Não | - | Dimensão quadrada final em pixels (16-4096) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/circle-crop \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"zoom": 1.2, "borderWidth": 4, "borderColor": "#333333"}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.png",
  "originalSize": 2450000,
  "processedSize": 185000
}
```

## Observações {#notes}

- A saída é sempre PNG para preservar os cantos transparentes (a menos que `background` seja definido como uma cor sólida).
- O círculo é inscrito na menor dimensão da imagem. Use `zoom` para recortar mais de perto e `offsetX`/`offsetY` para deslocar a área visível.
- Quando `outputSize` é fornecido, o resultado é redimensionado para essa dimensão quadrada após o recorte.
- Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
