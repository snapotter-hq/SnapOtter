---
description: "Adiciona um efeito de vinheta com intensidade, cor e posição ajustáveis."
i18n_source_hash: 0b9795fea2eb
i18n_provenance: human
i18n_output_hash: 6e90448feb6a
---

# Vinheta (Vignette) {#vignette}

Adiciona um efeito de vinheta que escurece ou tinge as bordas de uma imagem. Suporta intensidade, cor, raio, suavidade, arredondamento e posição do centro ajustáveis.

## Endpoint da API {#api-endpoint}

`POST /api/v1/tools/image/vignette`

Aceita dados de formulário multipart com um arquivo de imagem e um campo JSON `settings`.

## Parâmetros {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| strength | number | Não | `0.5` | Opacidade da vinheta (0.1-1) |
| color | string | Não | `"#000000"` | Cor da vinheta em hexadecimal |
| radius | integer | Não | `70` | Raio externo como percentual da meia-diagonal (0-100) |
| softness | integer | Não | `50` | Suavidade da difusão (0-100); valores maiores produzem um desvanecimento mais gradual |
| roundness | integer | Não | `100` | Forma: 100 = círculo, 0 = elipse correspondente à proporção da imagem |
| centerX | integer | Não | `50` | Posição horizontal do centro como percentual (0-100) |
| centerY | integer | Não | `50` | Posição vertical do centro como percentual (0-100) |

## Exemplo de Requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/vignette \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@photo.jpg" \
  -F 'settings={"strength": 0.7, "radius": 60, "softness": 70}'
```

## Exemplo de Resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/photo.jpg",
  "originalSize": 2450000,
  "processedSize": 2410000
}
```

## Notas {#notes}

- Um(a) `radius` menor escurece mais da imagem; um raio maior confina a vinheta às bordas extremas.
- Use uma cor `color` não preta (por exemplo, tons brancos ou sépia) para efeitos criativos de vinheta.
- Ajustar `centerX` e `centerY` permite posicionar a área clara fora do centro, útil para direcionar o foco a um sujeito que não está no meio do quadro.
- O formato de saída corresponde ao formato de entrada. Entradas HEIC, RAW, PSD e SVG são decodificadas automaticamente antes do processamento.
