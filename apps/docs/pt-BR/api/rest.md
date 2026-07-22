---
description: "Referência completa da API REST. Endpoints de ferramentas, processamento em lote, pipelines, biblioteca de arquivos, autenticação, times e operações administrativas."
i18n_output_hash: cf7876adfe84
i18n_source_hash: 7e0a0db4abe0
i18n_provenance: human
---

# Referência da API REST {#rest-api-reference}

A documentação interativa da API, com exemplos de requisição/resposta, está disponível em [http://localhost:1349/api/docs](http://localhost:1349/api/docs).

Especificações legíveis por máquina:
- `/api/v1/openapi.yaml` - Especificação OpenAPI 3.1
- `/llms.txt` - Resumo amigável para LLM
- `/llms-full.txt` - Documentação completa amigável para LLM

## Autenticação {#authentication}

Todos os endpoints exigem autenticação, a menos que `AUTH_ENABLED=false`.

### Token de sessão {#session-token}

```bash
# Login
curl -X POST http://localhost:1349/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Returns: {"token":"<session-token>"}

# Use token
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer <session-token>"
```

As sessões expiram após 7 dias (configurável via `SESSION_DURATION_HOURS`).

### Chaves de API {#api-keys}

```bash
# Create a key (returns key once - store it)
curl -X POST http://localhost:1349/api/v1/api-keys \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-script"}'
# Returns: {"key":"si_<96 hex chars>","id":"...","name":"my-script"}

# Use the key
curl http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-key>"
```

As chaves têm o prefixo `si_` e são armazenadas como hashes scrypt. A chave bruta é exibida uma única vez e nunca mais pode ser recuperada.

### Endpoints de autenticação {#auth-endpoints}

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `POST` | `/api/auth/login` | Público | Login, obter token de sessão |
| `POST` | `/api/auth/logout` | Autenticado | Destruir a sessão atual |
| `GET` | `/api/auth/session` | Autenticado | Validar a sessão atual |
| `POST` | `/api/auth/change-password` | Autenticado | Alterar a própria senha (invalida todas as outras sessões + chaves de API) |
| `GET` | `/api/auth/users` | Admin | Listar todos os usuários |
| `POST` | `/api/auth/register` | Admin | Criar um novo usuário |
| `PUT` | `/api/auth/users/:id` | Admin | Atualizar o papel ou o time do usuário |
| `POST` | `/api/auth/users/:id/reset-password` | Admin | Redefinir a senha do usuário |
| `DELETE` | `/api/auth/users/:id` | Admin | Excluir um usuário |
| `GET` | `/api/v1/config/auth` | Público | Verificar se a autenticação está habilitada (`{ authEnabled: bool }`) |
| `POST` | `/api/auth/mfa/enroll` | Autenticado | Iniciar o cadastro de MFA TOTP. Requer o recurso enterprise `mfa` |
| `POST` | `/api/auth/mfa/verify` | Autenticado | Confirmar o cadastro de MFA com um código TOTP |
| `POST` | `/api/auth/mfa/complete` | Público | Concluir um desafio de login MFA pendente |
| `POST` | `/api/auth/mfa/disable` | Autenticado | Desabilitar o MFA para o usuário atual |
| `POST` | `/api/auth/users/:id/mfa/reset` | Admin (`users:manage`) | Redefinir o MFA de um usuário |
| `GET` | `/api/auth/oidc/login` | Público | Iniciar o login OIDC quando o OIDC estiver habilitado |
| `GET` | `/api/auth/oidc/callback` | Público | Callback de autorização OIDC |
| `GET` | `/api/auth/saml/metadata` | Público | XML de metadados do SP SAML quando o SAML estiver habilitado |
| `GET` | `/api/auth/saml/login` | Público | Iniciar o login SAML |
| `POST` | `/api/auth/saml/callback` | Público | Serviço consumidor de asserções SAML |

Quando o MFA está habilitado para um usuário, `POST /api/auth/login` retorna `{"requiresMfa":true,"mfaToken":"...","mfaRequired":true|false}` em vez de um token de sessão. Envie esse `mfaToken` junto com um código TOTP ou de recuperação para `/api/auth/mfa/complete`.

### Permissões {#permissions}

| Permissão | Admin | Usuário |
|-----------|:-----:|:----:|
| Usar ferramentas | ✓ | ✓ |
| Próprios arquivos/pipelines/chaves de API | ✓ | ✓ |
| Ver arquivos/pipelines/chaves de todos os usuários | ✓ | - |
| Gravar configurações | ✓ | - |
| Gerenciar usuários e times | ✓ | - |
| Gerenciar branding | ✓ | - |

## Health Check {#health-check}

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/health` | Público | Verificação básica de saúde. Retorna `{"status":"healthy","version":"..."}` com 200, ou `{"status":"unhealthy"}` com 503 se o banco de dados estiver inacessível. |
| `GET` | `/api/v1/readyz` | Público | Sonda de prontidão. Verifica PostgreSQL, Redis, espaço em disco e S3 quando configurado. Retorna 503 quando a instância não deve receber tráfego. |
| `GET` | `/api/v1/admin/health` | Admin (`system:health`) | Diagnósticos detalhados, incluindo uptime, modo de armazenamento, status do banco de dados, estado da fila e disponibilidade de GPU. |

## Usando ferramentas {#using-tools}

Toda ferramenta segue o mesmo padrão:

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId> \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'settings={"width":800,"height":600}'

# Batch (returns ZIP)
curl -X POST http://localhost:1349/api/v1/tools/<section>/<toolId>/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'settings={...}'
```

`<section>` é um de `image`, `video`, `audio`, `pdf` ou `files`.

- O upload é `multipart/form-data`.
- `settings` é uma string JSON com opções específicas da ferramenta.
- `clientJobId` é um campo de formulário opcional para correlação de progresso fornecida pelo chamador.
- `fileId` é um campo de formulário opcional que referencia um item existente da biblioteca de arquivos. Quando presente, a saída processada é salva como uma nova versão e a resposta inclui `savedFileId`.
- **Ferramentas rápidas** normalmente retornam 200 JSON: `{"jobId":"...","downloadUrl":"/api/v1/download/<jobId>/<filename>","originalSize":1234,"processedSize":567}`. Obtenha o arquivo processado em `downloadUrl`.
- **Qualquer ferramenta enfileirada** pode retornar 202 JSON se for de longa duração ou exceder a janela de espera síncrona: `{"jobId":"...","async":true}`. Conecte-se ao SSE para acompanhar o progresso e faça o download quando concluído (consulte [Acompanhamento de progresso](#progress-tracking)).
- **As rotas de lote** retornam um arquivo ZIP transmitido diretamente (com o cabeçalho `X-Job-Id`) para ferramentas registradas no registro genérico de lote.

## Referência de ferramentas {#tools-reference}

### Presets de conversão {#conversion-presets}

O catálogo compartilhado inclui 83 endpoints dedicados a presets de conversão, como `jpg-to-png`, `mov-to-mp4`, `m4a-to-mp3`, `pdf-to-jpg` e `excel-to-csv`. Os presets são rotas de ferramentas de primeira classe:

`POST /api/v1/tools/<section>/<presetId>`

Cada preset trava o formato de saída e delega a uma ferramenta base como `convert`, `convert-video`, `extract-audio`, `convert-audio`, `image-to-pdf`, `pdf-to-image`, `svg-to-raster` ou `convert-spreadsheet`. Consulte [Presets de conversão](/pt-BR/tools/conversion-presets) para a tabela completa de rotas e as configurações opcionais.

### Essenciais {#essentials}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `resize` | Redimensionar | `width`, `height`, `fit` (cover/contain/fill/inside/outside), `percentage`, `withoutEnlargement`, mais 23 presets de redes sociais |
| `crop` | Recortar | `left`, `top`, `width`, `height`, `unit` (px/percent) |
| `rotate` | Girar e Espelhar | `angle`, `horizontal` (bool), `vertical` (bool) |
| `convert` | Converter | `format` (jpg/png/webp/avif/tiff/gif/heic/heif), `quality` |
| `compress` | Comprimir | `mode` (quality/targetSize), `quality` (1–100), `targetSizeKb` |

### Otimização {#optimization}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `optimize-for-web` | Otimizar para Web | `format` (webp/jpeg/avif/png), `quality`, `maxWidth`, `maxHeight`, `progressive`, `stripMetadata` |
| `strip-metadata` | Remover Metadados | - |
| `edit-metadata` | Editar Metadados | `title`, `description`, `author`, `copyright`, `keywords`, `gps` (lat/lon), `dateTime` |
| `bulk-rename` | Renomear em Massa | `pattern` (suporta `{n}`, `{date}`, `{original}`), `startIndex`, `padding` |
| `image-to-pdf` | Imagem para PDF | `pageSize` (A4/Letter/...), `orientation`, `margin`, `targetSize` ({value, unit}) |
| `favicon` | Gerador de Favicon | `padding`, `backgroundColor`, `borderRadius` - gera todos os tamanhos padrão |

### Ajustes {#adjustments}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `adjust-colors` | Ajustar Cores | `brightness`, `contrast`, `exposure`, `saturation`, `temperature`, `tint`, `hue`, `sharpness`, `red`, `green`, `blue`, `effect` (none/grayscale/sepia/invert) |
| `sharpening` | Nitidez | `method` (adaptive/unsharp-mask/high-pass), `sigma`, `m1`, `m2`, `x1`, `y2`, `y3`, `amount`, `radius`, `threshold`, `strength`, `kernelSize` (3/5), `denoise` (off/light/medium/strong) |
| `replace-color` | Substituir Cor | `sourceColor`, `targetColor` (substituição), `makeTransparent`, `tolerance` |
| `color-blindness` | Simulação de Daltonismo | `simulationType` (protanopia/deuteranopia/tritanopia/protanomaly/deuteranomaly/tritanomaly/achromatopsia/blueConeMonochromacy, padrão "deuteranomaly") |
| `duotone` | Duotom | `shadow` (hex), `highlight` (hex), `intensity` (0-100) |
| `pixelate` | Pixelizar | `blockSize` (2-128), `region` ({left, top, width, height} para pixelização parcial) |
| `vignette` | Vinheta | `strength` (0.1-1), `color` (hex), `radius`, `softness`, `roundness`, `centerX`, `centerY` |

### Ferramentas de IA {#ai-tools}

Todas as ferramentas de IA rodam no seu hardware: CPU por padrão ou NVIDIA CUDA quando uma GPU NVIDIA compatível estiver disponível. A aceleração por iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA hoje. Não requer internet.

| ID da ferramenta | Nome | Modelo de IA | Principais configurações |
|---------|------|---------|-------------|
| `remove-background` | Remover Fundo | rembg (BiRefNet / U2-Net) | `model`, `backgroundType` (transparent/color/gradient/blur/image), `backgroundColor`, `gradientColor1`, `gradientColor2`, `gradientAngle`, `blurEnabled`, `blurIntensity`, `shadowEnabled`, `shadowOpacity` |
| `upscale` | Ampliação de Imagem | RealESRGAN | `scale` (2/4), `model`, `faceEnhance`, `denoise`, `format`, `quality` |
| `erase-object` | Apagador de Objetos | LaMa (ONNX) | Máscara enviada como segunda parte de arquivo (fieldname `mask`), `format`, `quality` |
| `ocr` | OCR / Extração de texto | Tesseract (rápido); RapidOCR + PP-OCR ONNX (equilibrado/melhor) | `quality` (rápido/equilibrado/melhor), `language`, `enhance` |
| `blur-faces` | Desfoque de Rosto / PII | MediaPipe | `blurRadius`, `sensitivity` |
| `smart-crop` | Recorte Inteligente | MediaPipe + Sharp | `mode` (subject/face/trim), `strategy` (attention/entropy), `width`, `height`, `padding`, `facePreset` (closeup/head-shoulders/upper-body/half-body), `sensitivity`, `threshold`, `padToSquare`, `padColor`, `targetSize`, `quality` |
| `image-enhancement` | Aprimoramento de Imagem | Baseado em análise | `mode` (auto/exposure/contrast/color/sharpness), `strength` |
| `enhance-faces` | Aprimoramento de Rosto | GFPGAN / CodeFormer | `model` (gfpgan/codeformer), `strength`, `sensitivity`, `centerFace` |
| `colorize` | Colorização por IA | DDColor | `intensity`, `model` |
| `noise-removal` | Remoção de Ruído | Redução de ruído em camadas | `tier` (quick/balanced/quality/maximum), `strength`, `detailPreservation`, `colorNoise`, `format`, `quality` |
| `red-eye-removal` | Remoção de Olhos Vermelhos | Pontos de referência facial + análise de cor | `sensitivity`, `strength` |
| `restore-photo` | Restauração de Fotos | Pipeline de múltiplas etapas | `mode` (auto/light/heavy), `scratchRemoval`, `faceEnhancement`, `fidelity`, `denoise`, `denoiseStrength`, `colorize` |
| `passport-photo` | Foto de Passaporte | Pontos de referência do MediaPipe | Fluxo em duas fases. A análise usa multipart `file`; a geração usa JSON com `countryCode`, `bgColor`, `printLayout` (none/4x6/a4), pontos de referência e dimensões da imagem |
| `content-aware-resize` | Redimensionamento Sensível ao Conteúdo | Seam carving (caire) | `width`, `height`, `protectFaces`, `blurRadius`, `sobelThreshold`, `square` |
| `transparency-fixer` | Corretor de Transparência PNG | BiRefNet HR-matting | `defringe` (0-100), `outputFormat` (png/webp) |
| `background-replace` | Substituir Fundo | rembg (BiRefNet) | `backgroundType` (color/gradient), `color` (hex), `gradientColor1`, `gradientColor2`, `gradientAngle`, `feather` (0-20), `format` (png/webp) |
| `blur-background` | Desfocar Fundo | rembg (BiRefNet) | `intensity` (1-100), `feather` (0-20), `format` (png/webp) |
| `ai-canvas-expand` | Expansão de Tela por IA | LaMa (outpainting) | `extendTop`, `extendRight`, `extendBottom`, `extendLeft` (px), `tier` (fast/balanced/high), `format`, `quality` |

### Marca-d'água e Sobreposição {#watermark-overlay}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `watermark-text` | Marca-d'água de Texto | `text`, `font`, `fontSize`, `color`, `opacity`, `position`, `rotation`, `tile` |
| `watermark-image` | Marca-d'água de Imagem | `opacity`, `position`, `scale` - o segundo arquivo é a marca-d'água |
| `text-overlay` | Sobreposição de Texto | `text`, `font`, `fontSize`, `color`, `x`, `y`, `background`, `padding`, `borderRadius` |
| `compose` | Composição de Imagem | `x`, `y`, `opacity`, `blend` - o segundo arquivo é sobreposto por cima |
| `meme-generator` | Gerador de Memes | `templateId`, `textLayout` (top-bottom/top-only/bottom-only/center/side-by-side), `textBoxes` ([{id, text}]), `fontFamily` (anton/arial-black/comic-sans/montserrat/bebas-neue/permanent-marker/roboto), `fontSize`, `textColor`, `strokeColor`, `textAlign`, `allCaps`. Suporta o modo de template (corpo JSON com `templateId`) ou o modo de imagem personalizada (multipart com arquivo). |

### Utilitários {#utilities}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `info` | Informações da Imagem | - (retorna largura, altura, formato, tamanho, canais, hasAlpha, DPI, EXIF) |
| `compare` | Comparar Imagens | `mode` (side-by-side/overlay/diff), `diffThreshold` - o segundo arquivo é o alvo da comparação |
| `find-duplicates` | Encontrar Duplicatas | `threshold` (distância de hash perceptual, padrão 8) - múltiplos arquivos |
| `color-palette` | Paleta de Cores | `count` (contagem de cores dominantes), `format` (hex/rgb) |
| `qr-generate` | Gerador de QR Code | `data`, `size`, `margin`, `colorDark`, `colorLight`, `errorCorrectionLevel`, `dotStyle`, `cornerStyle`, `logo` (arquivo opcional) |
| `barcode-read` | Leitor de Código de Barras | - (detecta automaticamente QR, EAN, Code128, DataMatrix, etc.) |
| `image-to-base64` | Imagem para Base64 | `format` (data-uri/plain), `mimeType` |
| `html-to-image` | HTML para Imagem | `url`, `format` (png/jpg/webp), `quality`, `fullPage`, `devicePreset` (desktop/tablet/mobile/custom), `viewportWidth`, `viewportHeight` |
| `histogram` | Histograma | `scale` (linear/log) - retorna o gráfico de histograma RGB + estatísticas por canal |
| `lqip-placeholder` | Placeholder LQIP | `width` (4-64), `blur`, `strategy` (blur/pixelate/solid), `format` (webp/png/jpeg), `quality` |
| `barcode-generate` | Gerador de Código de Barras | `text`, `type` (code128/ean13/upca/code39/itf14/datamatrix), `scale` (1-8), `includeText` (bool). Corpo JSON, sem upload de arquivo. |

### Layout e Composição {#layout-composition}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `collage` | Colagem / Grade | `template` (25+ layouts), `gap`, `backgroundColor`, `borderRadius` - múltiplos arquivos |
| `stitch` | Costurar / Combinar | `direction` (horizontal/vertical/grid), `gap`, `backgroundColor`, `alignment` - múltiplos arquivos |
| `split` | Dividir Imagem | `mode` (grid/rows/cols), `rows`, `cols`, `tileWidth`, `tileHeight` |
| `border` | Borda e Moldura | `width`, `color`, `style` (solid/gradient/pattern), `borderRadius`, `padding`, `shadow` |
| `beautify` | Embelezar Captura de Tela | `backgroundType` (solid/linear-gradient/radial-gradient/image/transparent), `gradientStops`, `padding`, `borderRadius`, `shadowPreset`, `frame` (none/macos-light/macos-dark/windows-light/windows-dark/browser-light/browser-dark/iphone/macbook/ipad/...), `socialPreset` (none/twitter/linkedin/instagram-square/instagram-story/facebook/producthunt), `watermarkText`, `outputFormat` |
| `circle-crop` | Recorte Circular | `zoom` (1-5), `offsetX`, `offsetY`, `borderWidth`, `borderColor`, `background` (transparent/hex), `outputSize` |
| `image-pad` | Preencher Imagem | `target` (16:9/9:16/1:1/4:3/3:4/custom), `ratioW`, `ratioH`, `background` (color/transparent/blur), `color` (hex), `padding` (0-50%) |
| `sprite-sheet` | Sprite Sheet | `columns` (1-16), `padding`, `background` (hex), `format` (png/webp/jpeg), `quality` - múltiplos arquivos (2-64 imagens) |

### Formato e Conversão {#format-conversion}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `svg-to-raster` | SVG para Raster | `format` (png/jpeg/webp/avif/tiff/gif/heif), `width`, `height`, `scale`, `dpi`, `background` |
| `vectorize` | Imagem para SVG | `colorMode` (bw/color), `threshold`, `colorPrecision`, `filterSpeckle`, `pathMode` (none/polygon/spline) |
| `gif-tools` | Ferramentas de GIF | `action` (resize/optimize/reverse/speed/extract-frames/rotate/add-text), parâmetros específicos da ação |
| `gif-webp` | Conversor GIF/WebP | `quality` (1-100), `lossless` (bool), `resizePercent` (10-100) |

### Ferramentas de Vídeo {#video-tools}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `convert-video` | Converter Vídeo | `format` (mp4/mov/webm/avi/mkv), `quality` (high/balanced/small) |
| `compress-video` | Comprimir Vídeo | `quality` (light/balanced/strong), `resolution` (original/1080p/720p/480p) |
| `trim-video` | Cortar Vídeo | `startS`, `endS`, `precise` (bool, corte com precisão de quadro) |
| `mute-video` | Silenciar Vídeo | - |
| `video-to-gif` | Vídeo para GIF | `fps` (1-30), `width`, `startS`, `durationS` (máx. 60s) |
| `resize-video` | Redimensionar Vídeo | `width`, `height`, `preset` (custom/2160p/1440p/1080p/720p/480p/360p) |
| `crop-video` | Recortar Vídeo | `width`, `height`, `x`, `y` |
| `rotate-video` | Girar Vídeo | `transform` (cw90/ccw90/180/hflip/vflip) |
| `change-fps` | Alterar FPS | `fps` (1-120) |
| `video-color` | Cor de Vídeo | `brightness`, `contrast`, `saturation`, `gamma` |
| `video-speed` | Velocidade de Vídeo | `factor` (0.25-4), `keepPitch` (bool) |
| `reverse-video` | Inverter Vídeo | - (máx. 5 minutos) |
| `video-loudnorm` | Normalizar Áudio | - (EBU R128) |
| `aspect-pad` | Preenchimento por Proporção | `target` (16:9/9:16/1:1/4:3/3:4), `color` (hex) |
| `blur-pad` | Preenchimento com Desfoque | `target` (16:9/9:16/1:1/4:3/3:4), `blur` (2-50) |
| `watermark-video` | Marca-d'água em Vídeo | `text`, `position`, `fontSize`, `opacity`, `color` |
| `stabilize-video` | Estabilizar Vídeo | `smoothing` (5-60, em quadros) |
| `gif-to-video` | GIF para Vídeo | `format` (mp4/webm/mov) |
| `video-to-webp` | Vídeo para WebP | `fps`, `width`, `quality`, `loop` (bool) |
| `video-to-frames` | Vídeo para Quadros | `mode` (all/nth/timestamps), `n`, `timestamps`, `format` (png/jpg) |
| `merge-videos` | Mesclar Vídeos | - (múltiplos arquivos, normalizados para a resolução do primeiro vídeo) |
| `replace-audio` | Substituir Áudio | - (vídeo + arquivo de áudio, dois arquivos) |
| `burn-subtitles` | Gravar Legendas | `fontSize` (8-72) - vídeo + arquivo de legenda |
| `embed-subtitles` | Incorporar Legendas | `language` (código ISO 639-2/B) - vídeo + arquivo de legenda |
| `extract-subtitles` | Extrair Legendas | - (gera SRT) |
| `images-to-video` | Imagens para Vídeo | `secondsPerImage` (0.5-10), `resolution` (1080p/720p/square), `fps` - múltiplos arquivos |
| `video-metadata` | Limpar Metadados de Vídeo | - |
| `auto-subtitles` | Legendas Automáticas (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `format` (srt/vtt) |
| `extract-audio` | Extrair Áudio | `format` (mp3/wav/m4a/ogg) |

### Ferramentas de Áudio {#audio-tools}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `convert-audio` | Converter Áudio | `format` (mp3/wav/ogg/flac/m4a), `bitrateKbps` (32-320) |
| `trim-audio` | Cortar Áudio | `startS`, `endS` |
| `volume-adjust` | Ajustar Volume | `gainDb` (-30 a 30) |
| `normalize-audio` | Normalizar Áudio | - (EBU R128, -16 LUFS) |
| `fade-audio` | Fade de Áudio | `fadeInS` (0-30), `fadeOutS` (0-30) |
| `reverse-audio` | Inverter Áudio | - |
| `audio-speed` | Velocidade de Áudio | `factor` (0.25-4) |
| `pitch-shift` | Alterar Tom | `semitones` (-12 a 12) |
| `audio-channels` | Canais de Áudio | `mode` (stereo-to-mono/mono-to-stereo/swap) |
| `silence-removal` | Remoção de Silêncio | `thresholdDb` (-80 a -20), `minSilenceS` (0.1-5) |
| `noise-reduction` | Redução de Ruído | `strength` (light/medium/strong) |
| `merge-audio` | Mesclar Áudio | `format` (mp3/wav/flac/m4a) - múltiplos arquivos |
| `split-audio` | Dividir Áudio | `mode` (time/parts/silence), `segmentS`, `parts`, `thresholdDb`, `minSilenceS` |
| `ringtone-maker` | Criador de Toque | `startS`, `durationS` (1-30) |
| `waveform-image` | Imagem de Forma de Onda | `width`, `height`, `color` (hex) |
| `audio-metadata` | Metadados de Áudio | `strip` (bool), `title`, `artist`, `album` |
| `transcribe-audio` | Transcrever Áudio (IA) | `language` (auto/en/de/fr/es/zh/ja/ko/id/th/vi), `outputFormat` (txt/srt/vtt) |

### Ferramentas de Documentos {#document-tools}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `merge-pdf` | Mesclar PDFs | - (múltiplos arquivos, até 20 PDFs) |
| `split-pdf` | Dividir PDF | `mode` (range/every), `range`, `everyN` (1-500) |
| `compress-pdf` | Comprimir PDF | `mode` (quality/targetSize), `quality` (1-100), `targetSizeKb` |
| `rotate-pdf` | Girar PDF | `angle` (90/180/270), `range` (intervalo de páginas) |
| `extract-pages` | Extrair Páginas | `range` (sintaxe qpdf, ex. "1-5,8,10-z") |
| `remove-pages` | Remover Páginas | `pages` (intervalo qpdf a remover) |
| `organize-pdf` | Organizar PDF | `order` (ordem de páginas qpdf, ex. "3,1,2,5-z") |
| `protect-pdf` | Proteger PDF | `userPassword`, `ownerPassword` (AES-256) |
| `unlock-pdf` | Desbloquear PDF | `password` |
| `repair-pdf` | Reparar PDF | - |
| `linearize-pdf` | Otimizar PDF para Web | - (lineariza para visualização web rápida) |
| `grayscale-pdf` | PDF em Tons de Cinza | - |
| `pdfa-convert` | Converter para PDF/A | - (PDF/A-2 para arquivamento) |
| `crop-pdf` | Recortar PDF | `margin` (0-2000 pontos) |
| `nup-pdf` | PDF N-up | `perSheet` (2/3/4/8/9/12/16) |
| `booklet-pdf` | PDF em Livreto | `perSheet` (2/4/6/8) |
| `watermark-pdf` | Marca-d'água em PDF | `text`, `position`, `fontSize`, `opacity`, `rotation` |
| `pdf-page-numbers` | Números de Página de PDF | `position` (bl/bc/br/tl/tc/tr), `fontSize` |
| `flatten-pdf` | Achatar PDF | - (incorpora formulários e anotações) |
| `redact-pdf` | Editar/Ocultar PDF | `terms` (string[]), `caseSensitive` (bool) |
| `sign-pdf` | Assinar PDF | Rota multipart personalizada com o PDF `file`, arquivos de assinatura `sig0`, `sig1` e o array JSON `placements` |
| `pdf-to-text` | PDF para Texto | - |
| `pdf-to-word` | PDF para Word | - |
| `pdf-metadata` | Metadados de PDF | `title`, `author`, `subject`, `keywords` |
| `convert-document` | Converter Documento | `format` (docx/odt/rtf/txt) |
| `convert-presentation` | Converter Apresentação | `format` (pptx/odp) |
| `convert-spreadsheet` | Converter Planilha | `format` (xlsx/ods/csv) |
| `excel-to-pdf` | Excel para PDF | - |
| `word-to-pdf` | Word para PDF | - |
| `powerpoint-to-pdf` | PowerPoint para PDF | - |
| `html-to-pdf` | HTML para PDF | - (recursos remotos desabilitados) |
| `markdown-to-docx` | Markdown para Word | - |
| `markdown-to-html` | Markdown para HTML | - |
| `markdown-to-pdf` | Markdown para PDF | - (recursos remotos desabilitados) |
| `epub-convert` | Converter EPUB | `format` (pdf/docx/html/md) |
| `to-epub` | Converter para EPUB | - (aceita .docx, .md, .html, .txt) |
| `ocr-pdf` | OCR de PDF (IA) | `quality` (fast/balanced/best), `language` (auto/en/de/fr/es/zh/ja/ko), `pages` |
| `pdf-to-image` | PDF para Imagem | `pages` (all/range), `format`, `dpi`, `quality` |
| `pdf-to-jpg` | PDF para JPG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-png` | PDF para PNG | `pages`, `dpi`, `quality`, `colorMode` |
| `pdf-to-tiff` | PDF para TIFF | `pages`, `dpi`, `quality`, `colorMode` |

### Ferramentas de Arquivo {#file-tools}

| ID da ferramenta | Nome | Principais configurações |
|---------|------|-------------|
| `chart-maker` | Criador de Gráficos | `kind` (bar/line/pie), `title`, `width`, `height` |
| `csv-excel` | CSV para Excel | `sheet` (número da planilha para entrada XLSX) - bidirecional |
| `csv-json` | CSV para JSON | `pretty` (bool) - bidirecional |
| `json-xml` | JSON para XML | `pretty` (bool) - bidirecional |
| `split-csv` | Dividir CSV | `rowsPerFile` (1-1000000), `keepHeader` (bool) |
| `merge-csvs` | Mesclar CSVs | - (múltiplos arquivos, colunas correspondentes) |
| `yaml-json` | YAML / JSON | - (bidirecional) |
| `xml-to-csv` | XML para CSV | - (encontra automaticamente elementos repetidos) |
| `excel-to-csv` | Excel para CSV | preset de conversão dedicado, baseado em `convert-spreadsheet` |
| `create-zip` | Criar ZIP | - (múltiplos arquivos, 2-50 arquivos) |
| `extract-zip` | Extrair ZIP | - (protegido contra bomb) |

### HTML para Imagem {#html-to-image}

Captura uma página web como imagem. Diferente de outras ferramentas, este endpoint aceita `application/json` em vez de dados de formulário multipart (não é necessário upload de arquivo).

**Endpoint:** `POST /api/v1/tools/image/html-to-image`

**Content-Type:** `application/json`

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `url` | string | (obrigatório) | URL a capturar (apenas http/https) |
| `format` | string | `"png"` | Formato de saída: `jpg`, `png`, `webp` |
| `quality` | number | `90` | Qualidade 1-100 (apenas JPG/WebP) |
| `fullPage` | boolean | `false` | Capturar a página inteira com rolagem |
| `devicePreset` | string | `"desktop"` | `desktop`, `tablet`, `mobile`, `custom` |
| `viewportWidth` | number | `1280` | Largura personalizada da viewport 320-3840 |
| `viewportHeight` | number | `720` | Altura personalizada da viewport 320-2160 |

**Exemplo:**

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/html-to-image \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://snapotter.com", "format": "png", "devicePreset": "desktop"}'
```

**Resposta:**

```json
{
  "jobId": "uuid",
  "downloadUrl": "/api/v1/download/{jobId}/screenshot.png",
  "originalSize": 0,
  "processedSize": 54321
}
```

### Sub-rotas de ferramentas {#tool-sub-routes}

Algumas ferramentas expõem endpoints adicionais além da rota padrão `POST /api/v1/tools/<section>/<toolId>`:

| Método | Caminho | Descrição |
|--------|------|-------------|
| `GET` | `/api/v1/tools/popular` | Retorna os IDs de ferramentas populares, recorrendo a uma lista padrão curada quando os dados de uso são escassos |
| `POST` | `/api/v1/tools/image/remove-background/effects` | Aplica efeitos de fundo (cor/gradiente/desfoque/sombra) sem reexecutar a IA. Usa a máscara em cache da remoção inicial. |
| `POST` | `/api/v1/tools/image/edit-metadata/inspect` | Lê metadados EXIF/IPTC/XMP existentes de uma imagem |
| `POST` | `/api/v1/tools/image/strip-metadata/inspect` | Inspeciona os campos de metadados antes da remoção |
| `POST` | `/api/v1/tools/image/passport-photo/analyze` | Fase 1: detecção de rosto por IA + remoção de fundo. Retorna pontos de referência do rosto e dados em cache. |
| `POST` | `/api/v1/tools/image/passport-photo/generate` | Fase 2: recorte, redimensionamento e ladrilhamento usando a análise em cache. Sem reexecução da IA. |
| `POST` | `/api/v1/tools/image/gif-tools/info` | Obtém os metadados do GIF (contagem de quadros, dimensões, duração) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/info` | Obtém os metadados do PDF (contagem de páginas, dimensões) |
| `POST` | `/api/v1/tools/pdf/pdf-to-image/preview` | Gera uma prévia de uma página específica do PDF |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/info` | Obtém os metadados do PDF para o preset JPG dedicado |
| `POST` | `/api/v1/tools/pdf/pdf-to-jpg/preview` | Gera uma prévia de página do PDF para o preset JPG |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/info` | Obtém os metadados do PDF para o preset PNG dedicado |
| `POST` | `/api/v1/tools/pdf/pdf-to-png/preview` | Gera uma prévia de página do PDF para o preset PNG |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/info` | Obtém os metadados do PDF para o preset TIFF dedicado |
| `POST` | `/api/v1/tools/pdf/pdf-to-tiff/preview` | Gera uma prévia de página do PDF para o preset TIFF |
| `POST` | `/api/v1/tools/image/svg-to-raster/batch` | Converte múltiplos SVGs em raster em lote |
| `POST` | `/api/v1/tools/image/image-enhancement/analyze` | Analisa a qualidade da imagem e retorna recomendações de aprimoramento |
| `POST` | `/api/v1/tools/image/optimize-for-web/preview` | Prévia leve para ajuste de parâmetros ao vivo. Retorna a imagem otimizada com cabeçalhos de tamanho. |

## Processamento em Lote {#batch-processing}

Aplica uma ferramenta genérica habilitada para lote a vários arquivos de uma vez. Retorna um arquivo ZIP. Rotas personalizadas de múltiplos arquivos ou de múltiplas etapas, como assinatura de PDF e as rotas de preset de PDF para imagem, usam seu próprio contrato de endpoint em vez da rota genérica `/batch`.

A ferramenta `ocr-pdf` oferece suporte a esta rota genérica `/batch`.

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/compress/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F "files=@c.jpg" \
  -F 'settings={"quality":80}'
```

A concorrência é controlada por `CONCURRENT_JOBS` (padrão: detectado automaticamente a partir dos núcleos de CPU). `MAX_BATCH_SIZE` limita o número de arquivos por lote (padrão: 100; defina 0 para ilimitado).

## Pipelines {#pipelines}

### Executar um pipeline {#execute-a-pipeline}

```bash
# Single file
curl -X POST http://localhost:1349/api/v1/pipeline/execute \
  -H "Authorization: Bearer <token>" \
  -F "file=@input.jpg" \
  -F 'pipeline={"steps":[
    {"toolId":"resize","settings":{"width":1200}},
    {"toolId":"compress","settings":{"quality":80}},
    {"toolId":"watermark-text","settings":{"text":"© 2025"}}
  ]}'

# Batch (multiple files → ZIP)
curl -X POST http://localhost:1349/api/v1/pipeline/batch \
  -H "Authorization: Bearer <token>" \
  -F "files=@a.jpg" \
  -F "files=@b.jpg" \
  -F 'pipeline={"steps":[{"toolId":"resize","settings":{"width":800}}]}'
```

A saída de cada etapa é a entrada da etapa seguinte. Os pipelines permitem 20 etapas por padrão, configurável via `MAX_PIPELINE_STEPS`. Defina `MAX_PIPELINE_STEPS=0` para remover o limite.

### Salvar e gerenciar pipelines {#save-and-manage-pipelines}

| Método | Caminho | Descrição |
|--------|------|-------------|
| `POST` | `/api/v1/pipeline/save` | Salva um pipeline nomeado (`name`, `description`, `steps[]`) |
| `GET` | `/api/v1/pipeline/list` | Lista os pipelines salvos (admins veem todos; usuários veem os próprios) |
| `DELETE` | `/api/v1/pipeline/:id` | Exclui (proprietário ou admin) |
| `GET` | `/api/v1/pipeline/tools` | Lista os IDs de ferramentas válidos para etapas de pipeline |

## Acompanhamento de Progresso {#progress-tracking}

Trabalhos de longa duração, ferramentas enfileiradas, trabalhos em lote e pipelines emitem progresso em tempo real via Server-Sent Events. O fluxo de progresso é público e indexado pelo ID do trabalho, então os clientes não precisam enviar um cabeçalho Authorization para lê-lo.

```bash
# Connect to the SSE stream (jobId is in the JSON response body from the tool endpoint)
curl -N http://localhost:1349/api/v1/jobs/<jobId>/progress
```

Formato do evento:
```
data: {"jobId":"...","type":"single","phase":"processing","stage":"Upscaling","percent":42}
data: {"jobId":"...","type":"single","phase":"complete","percent":100,"result":{"downloadUrl":"/api/v1/download/..."}}
data: {"jobId":"...","type":"batch","status":"processing","completedFiles":2,"totalFiles":5,"failedFiles":0,"errors":[]}
```

Você pode solicitar o cancelamento de um trabalho enfileirado ou em execução com `POST /api/v1/jobs/:jobId/cancel`. A resposta é `{"canceled":true|false}`.

## Biblioteca de Arquivos {#file-library}

Armazenamento persistente de arquivos com histórico de versões.

| Método | Caminho | Descrição |
|--------|------|-------------|
| `POST` | `/api/v1/upload` | Envia arquivos para o workspace (processamento temporário) |
| `POST` | `/api/v1/files/upload` | Envia arquivos para a biblioteca de arquivos persistente |
| `POST` | `/api/v1/files/save-result` | Salva o resultado do processamento de uma ferramenta como uma nova versão de arquivo |
| `GET` | `/api/v1/files` | Lista os arquivos salvos (paginado, com busca) |
| `GET` | `/api/v1/files/:id` | Obtém os metadados do arquivo + a cadeia de versões |
| `GET` | `/api/v1/files/:id/download` | Baixa o arquivo |
| `GET` | `/api/v1/files/:id/thumbnail` | Obtém a miniatura JPEG de 300px |
| `DELETE` | `/api/v1/files` | Exclui arquivos em massa e suas cadeias de versões (corpo: `{ ids: [...] }`) |
| `POST` | `/api/v1/fetch-urls` | Busca URLs remotas para o workspace para importações baseadas em URL |
| `POST` | `/api/v1/preview` | Gera uma prévia WebP compatível com navegador (para formatos HEIC/HEIF/RAW) |
| `GET` | `/api/v1/files/:id/preview` | Transmite uma prévia em cache ou gerada, compatível com navegador, para um PDF, documento office, vídeo ou arquivo de áudio salvo |
| `POST` | `/api/v1/preview/generate` | Gera uma prévia MP4 ou MP3 sob demanda para um arquivo de mídia enviado, sem salvá-lo antes |
| `GET` | `/api/v1/download/:jobId/:filename` | Baixa um arquivo processado de um workspace |

Para salvar automaticamente o resultado de uma ferramenta na biblioteca, inclua `fileId` como um campo de formulário multipart referenciando um arquivo existente da biblioteca. O resultado processado será salvo como uma nova versão.

## Gerenciamento de Chaves de API {#api-key-management}

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `POST` | `/api/v1/api-keys` | Autenticado | Gera uma nova chave - exibida uma única vez |
| `GET` | `/api/v1/api-keys` | Autenticado | Lista as chaves (name, id, lastUsedAt - não a chave bruta) |
| `DELETE` | `/api/v1/api-keys/:id` | Autenticado | Exclui a chave |

## Times {#teams}

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/teams` | Admin (`teams:manage`) | Lista os times |
| `POST` | `/api/v1/teams` | Admin (`teams:manage`) | Cria um time |
| `PUT` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Renomeia um time |
| `DELETE` | `/api/v1/teams/:id` | Admin (`teams:manage`) | Exclui um time (não é possível excluir o time padrão ou times com membros) |

## Configurações {#settings}

A configuração de execução usa um conjunto fechado de chaves reconhecidas. A leitura exige `settings:read` e a gravação exige `settings:write`; as chaves de segurança e conformidade também exigem `security:manage` ou `compliance:manage`. Configurações secretas exigem autoridade de administrador completo, enquanto credenciais e estados controlados por endpoints dedicados são somente leitura aqui. As atualizações em massa são validadas antes que qualquer valor seja gravado.

| Método | Caminho | Descrição |
|--------|------|-------------|
| `GET` | `/api/v1/settings` | Obtém todas as configurações |
| `PUT` | `/api/v1/settings` | Atualiza configurações em massa (corpo JSON com pares chave-valor) |
| `GET` | `/api/v1/settings/:key` | Obtém uma configuração específica pela chave |

Chaves representativas: `disabledTools` (array JSON de IDs de ferramentas), `enableExperimentalTools` (booleano), `loginAttemptLimit` (política de segurança) e `auditRetentionDays` (política de conformidade). Chaves desconhecidas são rejeitadas.

## Preferências {#preferences}

As preferências por usuário são separadas das configurações da instância. Qualquer usuário autenticado pode ler e atualizar seu próprio mapa de preferências.

| Método | Caminho | Descrição |
|--------|------|-------------|
| `GET` | `/api/v1/preferences` | Obtém as preferências do usuário atual como `{ "preferences": { ... } }` |
| `PUT` | `/api/v1/preferences` | Insere ou atualiza uma ou mais chaves de preferência para o usuário atual |

## Papéis {#roles}

Gerenciamento de papéis personalizados com permissões granulares.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/roles` | Admin (`audit:read`) | Lista todos os papéis com a contagem de usuários |
| `POST` | `/api/v1/roles` | Admin (`security:manage`) | Cria um papel personalizado (`name`, `description`, `permissions`) |
| `PUT` | `/api/v1/roles/:id` | Admin (`security:manage`) | Atualiza um papel personalizado (não é possível modificar papéis integrados) |
| `DELETE` | `/api/v1/roles/:id` | Admin (`security:manage`) | Exclui um papel personalizado (não é possível excluir papéis integrados; os usuários afetados voltam ao papel `user`) |

Permissões disponíveis (17): `tools:use`, `files:own`, `files:all`, `apikeys:own`, `apikeys:all`, `pipelines:own`, `pipelines:all`, `settings:read`, `settings:write`, `users:manage`, `teams:manage`, `features:manage`, `system:health`, `audit:read`, `compliance:manage`, `webhooks:manage`, `security:manage`.

## Log de Auditoria {#audit-log}

Endpoint exclusivo de admin para revisar ações relevantes à segurança.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/audit-log` | Admin (`audit:read`) | Log de auditoria paginado com filtros opcionais |

Parâmetros de consulta:

| Parâmetro | Descrição |
|-----------|-------------|
| `page` | Número da página (padrão: 1) |
| `limit` | Entradas por página (padrão: 50, máx.: 100) |
| `action` | Filtrar por tipo de ação (ex. `ROLE_CREATED`, `ROLE_DELETED`) |
| `ip` | Filtrar por endereço IP de origem |
| `from` | Filtrar entradas após esta data ISO 8601 |
| `to` | Filtrar entradas antes desta data ISO 8601 |

## Analytics {#analytics}

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/config/analytics` | Público | Obtém a configuração efetiva de analytics (chave do PostHog, DSN do Sentry, taxa de amostragem). As chaves, o DSN e o ID da instância ficam em branco quando o analytics está desligado, seja pelo bake de tempo de compilação ou pela configuração `analyticsEnabled` da instância. |
| `POST` | `/api/v1/feedback` | Autenticado | Envia feedback explícito do usuário para o projeto PostHog configurado como `feedback_submitted`. A rota respeita o gate de analytics, limita a taxa de envios, remove os campos de contato a menos que `contactOk` seja true e nunca aceita conteúdo de arquivos, nomes de arquivos, caminhos de upload ou texto bruto de erro privado. Quando o analytics está desabilitado, retorna `{ "ok": true, "accepted": false }`. |
| `PUT` | `/api/v1/settings` | Admin (`settings:write`) | Define o opt-out em toda a instância. Envie um corpo JSON `{ "analyticsEnabled": "false" }` para desligar o analytics para todos, ou `"true"` para religá-lo. |

## Recursos / Pacotes de IA {#features-ai-bundles}

Gerencia os pacotes de recursos de IA (instala/desinstala pacotes de modelos de IA no ambiente Docker). Prefira o endpoint de instalação em nível de ferramenta ao habilitar uma ferramenta a partir de automação personalizada: algumas ferramentas de IA precisam de mais de um pacote compartilhado, e este endpoint pula os pacotes já instalados enquanto enfileira apenas os que faltam.

OCR é um aprimoramento opcional em vez de uma dependência rígida. Seu nível `fast` Tesseract funciona sem pacote; `POST /api/v1/admin/features/ocr/install` instala o pacote RapidOCR assinado para `balanced` e `best` em Linux amd64 ou arm64. O tempo de execução OCR preciso usa CPU em hosts somente CPU e NVIDIA e requer pelo menos 4 GiB de memória efetiva (o limite cgroup do contêiner configurado, caso contrário, memória do host). SnapOtter relata `requiredMemoryBytes`, `effectiveMemoryBytes` e um motivo de compatibilidade `insufficient-memory` e rejeita uma instalação incompatível antes do download. Este requisito de memória não se aplica ao `fast`. O pacote tem cerca de 208-234 MiB para download e 409-488 MiB instalados, dependendo do destino; o índice assinado vincula os tamanhos exatos aplicados durante a instalação.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/features` | Autenticado | Lista todos os pacotes de recursos e seu status de instalação |
| `POST` | `/api/v1/admin/features/:bundleId/install` | Admin (`features:manage`) | Instala um pacote de recursos (assíncrono, retorna `jobId` para acompanhamento de progresso) |
| `POST` | `/api/v1/admin/tools/:toolId/features/install` | Admin (`features:manage`) | Instala todos os pacotes que uma ferramenta requer; retorna o status enfileirado/pulado por pacote |
| `POST` | `/api/v1/admin/features/:bundleId/uninstall` | Admin (`features:manage`) | Desinstala um pacote de recursos e limpa os arquivos de modelo |
| `GET` | `/api/v1/admin/features/disk-usage` | Admin (`features:manage`) | Obtém o uso total de disco dos modelos de IA |
| `POST` | `/api/v1/admin/features/import` | Administrador (`features:manage`) | Importe um pacote de IA legado (`file`) ou uma versão OCR off-line assinada (`index` mais `archive`) |

Uma importação OCR sem comunicação deve incluir o `ocr-runtime-index.json` assinado da versão e o arquivo da plataforma correspondente. SnapOtter aplica a mesma assinatura Ed25519, hash de artefato, compatibilidade, extração e verificações de teste de fumaça usadas pela instalação online:

```bash
curl -X POST http://localhost:1349/api/v1/admin/features/import \
  -H "Authorization: Bearer <admin-token>" \
  -F "index=@ocr-runtime-index.json" \
  -F "archive=@ocr-linux-amd64-cpu-py312.tar.gz"
```

Use o arquivo `linux-arm64-cpu-py311` em arm64. Um artefato assinado para outro destino é rejeitado em vez de instalado.

## Operações Administrativas {#admin-operations}

Endpoints operacionais para observabilidade, suporte, relatório de uso e status de backup.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Lê o nível de log de tempo de execução atual |
| `POST` | `/api/v1/admin/log-level` | Admin (`settings:write`) | Altera o nível de log de tempo de execução (`fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent`) |
| `GET` | `/api/v1/metrics` | Admin (`system:health`) | Métricas do Prometheus em formato texto |
| `GET` | `/api/v1/admin/support-bundle` | Admin (`system:health`) | Baixa um ZIP de pacote de suporte de diagnóstico com dados redigidos |
| `GET` | `/api/v1/admin/usage` | Admin (`audit:read`) | Dados do painel de uso, com o parâmetro de consulta opcional `days` |
| `GET` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Lê os metadados do último backup e o status de atualidade |
| `POST` | `/api/v1/admin/backup-status` | Admin (`system:health`) | Registra um backup concluído (`type`, `sizeBytes` opcional, `notes` opcional) |

## APIs Enterprise {#enterprise-apis}

Essas rotas são restritas por licença de acordo com o recurso enterprise relacionado. Elas ainda exigem a permissão SnapOtter listada.

**Administrador integrado com autoridade total** significa que a identidade autenticada possui o papel `admin` e o conjunto completo de permissões efetivas de administrador. Um escopo de chave de API que omita qualquer permissão de administrador não se qualifica.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/enterprise/audit/export` | Admin (`audit:read`) | Exporta entradas de auditoria como JSON ou CSV com filtros |
| `GET` | `/api/v1/enterprise/config/export` | Administrador integrado com autoridade total | Exporta a configuração da instância redigida, os papéis personalizados e os times |
| `POST` | `/api/v1/enterprise/config/import` | Administrador integrado com autoridade total | Importa a configuração, com dry run opcional |
| `GET` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Lê a lista de permissões CIDR configurada |
| `PUT` | `/api/v1/enterprise/ip-allowlist` | Admin (`security:manage`) | Atualiza a lista de permissões CIDR com prevenção de autobloqueio |
| `GET` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Lista as retenções legais de usuários e times |
| `PUT` | `/api/v1/enterprise/legal-hold` | Admin (`compliance:manage`) | Aplica ou libera uma retenção legal em um usuário ou time |
| `POST` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Gera um token bearer SCIM, retornado uma única vez |
| `DELETE` | `/api/v1/enterprise/scim/token` | Admin (`users:manage`) | Revoga o token bearer SCIM atual |
| `GET` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Lê a configuração de encaminhamento SIEM |
| `PUT` | `/api/v1/enterprise/siem/config` | Admin (`webhooks:manage`) | Atualiza a configuração de encaminhamento SIEM |
| `GET` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Lista os destinos de webhook |
| `POST` | `/api/v1/enterprise/webhooks` | Admin (`webhooks:manage`) | Cria um destino de webhook |
| `PUT` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Atualiza um destino de webhook |
| `DELETE` | `/api/v1/enterprise/webhooks/:index` | Admin (`webhooks:manage`) | Exclui um destino de webhook |
| `POST` | `/api/v1/enterprise/webhooks/:index/test` | Admin (`webhooks:manage`) | Envia um payload de webhook de teste |
| `POST` | `/api/v1/enterprise/users/:id/export` | Admin (`compliance:manage`) | Inicia um trabalho de exportação de usuário GDPR |
| `GET` | `/api/v1/enterprise/users/:id/export/:jobId` | Admin (`compliance:manage`) | Lê o status da exportação GDPR e a URL de download |
| `DELETE` | `/api/v1/enterprise/users/:id/purge` | Admin (`compliance:manage`) | Purga permanentemente os dados de um usuário após confirmação |
| `DELETE` | `/api/v1/enterprise/teams/:id/purge` | Admin (`compliance:manage`) | Purga permanentemente os dados de um time após confirmação |
| `GET` | `/api/v1/admin/version` | Admin (`system:health`) | Lê os metadados de versão do app, do build, do Node e do schema |
| `GET` | `/api/v1/admin/migrations/pending` | Admin (`system:health`) | Compara as migrações empacotadas com as migrações aplicadas |
| `GET` | `/api/v1/admin/upgrade-check` | Admin (`system:health`) | Executa verificações de prontidão para upgrade |

### SCIM 2.0 {#scim-2-0}

Os endpoints de descoberta SCIM são públicos. Os endpoints de usuários e grupos exigem o token bearer SCIM gerado acima.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/scim/v2/ServiceProviderConfig` | Público | Capacidades do servidor SCIM |
| `GET` | `/api/v1/scim/v2/Schemas` | Público | Descoberta de schema SCIM |
| `GET` | `/api/v1/scim/v2/ResourceTypes` | Público | Descoberta de tipos de recurso SCIM |
| `GET` | `/api/v1/scim/v2/Users` | Token SCIM | Lista os usuários, com filtro SCIM opcional |
| `POST` | `/api/v1/scim/v2/Users` | Token SCIM | Cria um usuário |
| `GET` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Obtém um usuário |
| `PUT` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Substitui um usuário |
| `DELETE` | `/api/v1/scim/v2/Users/:id` | Token SCIM | Desativa um usuário (soft delete) |
| `GET` | `/api/v1/scim/v2/Groups` | Token SCIM | Lista os times como grupos SCIM |
| `POST` | `/api/v1/scim/v2/Groups` | Token SCIM | Cria um time |
| `GET` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Obtém um time |
| `PUT` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Substitui um time e a associação de grupo |
| `DELETE` | `/api/v1/scim/v2/Groups/:id` | Token SCIM | Exclui um time |

## Templates de Meme {#meme-templates}

API de suporte para a ferramenta geradora de memes.

| Método | Caminho | Acesso | Descrição |
|--------|------|--------|-------------|
| `GET` | `/api/v1/meme-templates` | Autenticado | Lista todos os templates de meme disponíveis com as posições das caixas de texto |
| `GET` | `/api/v1/meme-templates/full/:filename` | Autenticado | Serve a imagem do template em tamanho completo |
| `GET` | `/api/v1/meme-templates/thumbs/:filename` | Autenticado | Serve a miniatura do template |
| `GET` | `/api/v1/meme-templates/fonts/:filename` | Autenticado | Serve o arquivo de fonte usado para renderizar o texto do meme |

## Respostas de Erro {#error-responses}

Todos os erros retornam JSON:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE"
}
```

| Status | Significado |
|--------|---------|
| 400 | Requisição inválida / validação falhou |
| 401 | Não autenticado |
| 403 | Permissões insuficientes |
| 404 | Recurso não encontrado |
| 413 | Arquivo grande demais (consulte `MAX_UPLOAD_SIZE_MB`) |
| 422 | O processamento falhou após a validação |
| 429 | Limite de taxa atingido (consulte `RATE_LIMIT_PER_MIN`) |
| 501 | O pacote de recursos de IA necessário não está instalado (`FEATURE_NOT_INSTALLED`) |
| 500 | Erro interno do servidor |
