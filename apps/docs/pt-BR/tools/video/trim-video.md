---
description: "Extrai um clipe de um vídeo especificando os tempos de início e fim."
i18n_source_hash: 0385b4e963d0
i18n_provenance: machine
i18n_output_hash: fab2592a9436
i18n_hash_version: 2
---

# Trim Video {#trim-video}

Extrai um clipe de um vídeo. Mantenha a parte entre um tempo de início e um de fim, ou corte uma quantidade fixa do começo e do fim. Há uma opção para cortes precisos por quadro.

No aplicativo, os campos de tempo aceitam segundos simples (`90`), `MM:SS` (`1:30`) ou `HH:MM:SS` (`1:02:03.5`). A API recebe segundos.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/trim-video`

Aceita dados de formulário multipart com um arquivo de vídeo e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| mode | string | Não | `range` | `range` mantém de `startS` até `endS`. `ends` remove `cutStartS` do início e `cutEndS` do fim |
| startS | number | Não | `0` | Modo de intervalo: tempo de início em segundos (deve ser >= 0) |
| endS | number | Modo de intervalo | - | Modo de intervalo: tempo de fim em segundos (deve ser posterior a startS) |
| cutStartS | number | Não | `0` | Modo de extremidades: segundos a remover do início |
| cutEndS | number | Não | `0` | Modo de extremidades: segundos a remover do fim |
| precise | boolean | Não | `false` | Recodifica todo o intervalo para que o início e o fim fiquem exatos no quadro, em vez de copiar a partir do próximo keyframe |

## Exemplo de requisição {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"startS": 5, "endS": 30, "precise": true}'
```

Corte os primeiros 5 segundos e os últimos 10 segundos, qualquer que seja a duração do vídeo:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/trim-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@clip.mp4" \
  -F 'settings={"mode": "ends", "cutStartS": 5, "cutEndS": 10}'
```

## Exemplo de resposta {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/clip.mp4",
  "originalSize": 12500000,
  "processedSize": 4200000
}
```

## Observações {#notes}

- Quando `precise` é `false` (o padrão), o clipe começa exatamente no quadro solicitado. Apenas os quadros entre esse início e o próximo keyframe são recodificados e o restante é copiado, então o processo continua rápido. O fim pode ficar um quadro a mais, porque um fluxo copiado mantém os quadros dos quais os quadros anteriores dependem. Fontes que não podem ser emendadas com segurança (H.264 de 10 bits ou entrelaçado, outros codecs que exigem um início recodificado, ou arquivos AVI, FLV, MPEG e TS) são recodificadas por inteiro.
- Definir `precise` como `true` sempre recodifica todo o intervalo, de modo que as duas extremidades ficam exatas, mas leva mais tempo.
- No modo de intervalo, `endS` deve ser maior que `startS`. Se `endS` estiver além do fim do vídeo, o clipe vai até o final.
- No modo de extremidades, pelo menos um entre `cutStartS` e `cutEndS` deve ser maior que zero, e juntos eles devem deixar parte do vídeo. Como o corte é medido a partir da duração de cada arquivo, uma única configuração funciona em um lote de vídeos com durações diferentes.
