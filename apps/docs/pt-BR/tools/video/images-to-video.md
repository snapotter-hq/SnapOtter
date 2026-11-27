---
description: "Transforme um conjunto de imagens em um vídeo de slideshow, um GIF animado ou um WebP animado."
i18n_source_hash: 43a4e21c76c0
i18n_provenance: machine
i18n_output_hash: c8f2a57d7e33
i18n_hash_version: 2
---

# Images to Video {#images-to-video}

Transforma um conjunto de imagens em um vídeo de slideshow com duração por imagem, resolução e taxa de quadros configuráveis, ou em um GIF ou WebP animado com tempo fixo por quadro e número de repetições.

## API Endpoint {#api-endpoint}

`POST /api/v1/tools/video/images-to-video`

Aceita dados de formulário multipart com dois ou mais arquivos de imagem e um campo JSON `settings`.

## Parameters {#parameters}

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|-----------|------|----------|---------|-------------|
| outputFormat | string | Não | `"mp4"` | Formato de saída: `mp4`, `gif`, `webp` |
| secondsPerImage | number | Não | `2` | Somente MP4. Duração de exibição por imagem em segundos (0.5-10) |
| resolution | string | Não | `"720p"` | Somente MP4. Resolução de saída: `1080p`, `720p`, `square` |
| fps | integer | Não | `30` | Somente MP4. Taxa de quadros de saída (10-60) |
| frameDelayMs | integer | Não | `500` | Somente GIF e WebP. Tempo de exibição de cada imagem, em milissegundos (20-10000) |
| loop | integer | Não | `0` | Somente GIF e WebP. Quantas vezes a animação é reproduzida; `0` repete para sempre (0-100) |

## Example Request {#example-request}

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@slide1.jpg" \
  -F "file=@slide2.jpg" \
  -F "file=@slide3.jpg" \
  -F "file=@slide4.jpg" \
  -F 'settings={"secondsPerImage": 3, "resolution": "1080p"}'
```

Para criar um GIF animado que mostra cada imagem por 200 ms:

```bash
curl -X POST http://localhost:1349/api/v1/tools/video/images-to-video \
  -H "Authorization: Bearer si_your-api-key" \
  -F "file=@frame1.png" \
  -F "file=@frame2.png" \
  -F "file=@frame3.png" \
  -F 'settings={"outputFormat": "gif", "frameDelayMs": 200}'
```

## Example Response {#example-response}

```json
{
  "jobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "downloadUrl": "/api/v1/download/a1b2c3d4-e5f6-7890-abcd-ef1234567890/slideshow.mp4",
  "originalSize": 3500000,
  "processedSize": 1200000
}
```

## Notes {#notes}

- Aceita 2-60 arquivos de imagem por requisição. As imagens aparecem no vídeo na ordem de upload.
- Em MP4, as imagens são redimensionadas e preenchidas para caber na resolução de destino, preservando a proporção.
- A opção de resolução `square` produz um vídeo 1080x1080, útil para redes sociais.
- A saída MP4 é H.264, com o nome `slideshow.mp4`.
- A saída GIF e WebP usa o tamanho da primeira imagem. Imagens de outros tamanhos são reduzidas para caber nela, e a área restante fica transparente. O arquivo se chama `slideshow.gif` ou `slideshow.webp`.
- O GIF guarda os tempos de quadro em centésimos de segundo, então `frameDelayMs` é arredondado para os 10 ms mais próximos em um GIF. O WebP mantém o valor exato.
- Animações grandes são recusadas em vez de geradas: o tamanho do quadro vezes o número de imagens precisa ficar abaixo do mesmo limite de pixels usado pelas ferramentas de GIF.
