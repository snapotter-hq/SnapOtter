---
description: "Preencha uma imagem até uma proporção alvo com um fundo de cor sólida, transparente ou desfocado."
i18n_source_hash: 796122da3dae
i18n_provenance: human
i18n_output_hash: 74b1a079453c
---

# Preencher Imagem {#image-pad}

Preencha uma imagem até uma proporção alvo adicionando um fundo de cor sólida, transparente ou desfocado ao seu redor. Útil para ajustar imagens a proporções fixas para redes sociais ou impressão sem recortar.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/image-pad`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| target | string | Não | `"1:1"` | Proporção alvo: `16:9`, `9:16`, `1:1`, `4:3`, `3:4` ou `custom` |
| ratioW | integer | Não | `1` | Largura da proporção personalizada (1-100, usada quando target é `custom`) |
| ratioH | integer | Não | `1` | Altura da proporção personalizada (1-100, usada quando target é `custom`) |
| background | string | Não | `"color"` | Modo de fundo: `color`, `transparent` ou `blur` |
| color | string | Não | `"#ffffff"` | Cor hexadecimal de fundo (quando background é `color`) |
| padding | integer | Não | `0` | Preenchimento extra como percentual da tela (0-50) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/image-pad \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"target": "16:9", "background": "blur", "padding": 5}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 3100000
}
```

## Observações {#notes}

- O modo de fundo `blur` cria uma cópia desfocada da imagem original como preenchimento, produzindo um resultado visualmente coeso.
- Ao usar o fundo `transparent`, a saída é convertida para PNG para preservar o canal alfa.
- O formato de saída corresponde ao formato de entrada, a menos que haja transparência envolvida. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
- Defina `target` como `custom` e forneça `ratioW` e `ratioH` para proporções arbitrárias (por exemplo, `ratioW: 3, ratioH: 2` para 3:2).
