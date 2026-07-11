---
description: "Referência do motor de IA com todas as ferramentas de ML locais. Remoção de fundo, ampliação, OCR, detecção de rostos, restauração de fotos e muito mais."
i18n_source_hash: 14728c1dcd05
i18n_provenance: machine
i18n_output_hash: 9c63b9ba2ca7
---

# Referência do Motor de IA {#ai-engine-reference}

O pacote `@snapotter/ai` conecta o Node.js a um **sidecar Python persistente** para todas as operações de ML. O processo despachante permanece ativo entre as requisições para um desempenho rápido com início a quente. O NVIDIA CUDA é detectado automaticamente na inicialização e usado quando disponível; caso contrário, as ferramentas de IA rodam na CPU.

A aceleração por iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA hoje. Mapear `/dev/dri` em um contêiner não acelera essas ferramentas do sidecar Python a menos que uma GPU NVIDIA compatível com CUDA esteja disponível.

19 ferramentas de IA no sidecar Python em quatro modalidades (imagem, áudio, vídeo, documento), mais 2 ferramentas com capacidades opcionais de IA. Todos os modelos rodam localmente - nenhuma conexão com a internet é necessária após o download inicial do modelo.

## Arquitetura {#architecture}

```
Node.js Tool Route
      |
      v
 @snapotter/ai bridge.ts
      | (stdin/stdout JSON + stderr progress events)
      v
 Python dispatcher (persistent process, "ai" profile)
      |
      |-- remove_bg.py        (rembg / BiRefNet)
      |-- upscale.py          (RealESRGAN)
      |-- inpaint.py          (LaMa ONNX)
      |-- outpaint.py         (LaMa canvas expansion)
      |-- ocr.py              (PaddleOCR / Tesseract)
      |-- ocr_pdf.py          (page-by-page document OCR)
      |-- ocr_preprocess.py   (image enhancement for OCR)
      |-- detect_faces.py     (MediaPipe)
      |-- face_landmarks.py   (MediaPipe landmarks)
      |-- enhance_faces.py    (GFPGAN / CodeFormer)
      |-- colorize.py         (DDColor)
      |-- noise_removal.py    (SCUNet / tiered denoising)
      |-- red_eye_removal.py  (landmark + color analysis)
      |-- restore.py          (scratch repair + enhancement + denoising)
      |-- transcribe.py       (faster-whisper speech-to-text)
      +-- install_feature.py  (on-demand bundle installer)
```

Um perfil de despachante "docs" separado substitui a lista de permissões de IA por scripts de processamento de documentos (`doc_pagecount`, `doc_health`, `doc_flatten`, `doc_redact`, `doc_text`, `doc_to_word`, `doc_metadata`, `doc_html_pdf`) e pula as importações pesadas de ML.

**Tempos limite:** 300 s por padrão; OCR e remoção de fundo com BiRefNet recebem 600 s.

## Pacotes de Recursos {#feature-bundles}

Os modelos de IA são empacotados por pilha de dependências compartilhada, e não um arquivo por ferramenta. Um pacote de recursos pode habilitar várias ferramentas quando elas usam a mesma família de modelos, os mesmos wheels Python ou as mesmas bibliotecas nativas. Isso mantém a imagem Docker de lançamento menor e evita armazenar cópias duplicadas dos mesmos modelos de matting de fundo, detecção de rostos, OCR, restauração e fala.

A imagem Docker inclui a aplicação mais o runtime comum. Arquivos grandes de modelos são baixados sob demanda para o volume persistente `/data/ai`, e depois reutilizados por todas as ferramentas que precisam deles. Se um pacote já estiver instalado porque outra ferramenta precisou dele, habilitar uma nova ferramenta dependente não baixa esse pacote novamente.

Cada ferramenta de IA requer um ou mais pacotes de recursos antes de poder rodar. A interface de administração instala por ferramenta através de `POST /api/v1/admin/tools/:toolId/features/install`, que resolve a lista completa de pacotes, pula os pacotes já instalados e enfileira apenas os downloads que faltam. Por exemplo, habilitar Foto para Passaporte em uma instância nova enfileira `background-removal` e `face-detection`; habilitá-la depois que a Remoção de Fundo já estiver instalada enfileira apenas `face-detection`.

| Pacote | Tamanho | Grupo de dependências compartilhado | Ferramentas que o usam |
|--------|------|-------------------------|-------------------|
| `background-removal` | 4-5 GB | matting de fundo rembg / BiRefNet | remove-background, passport-photo, transparency-fixer, background-replace, blur-background |
| `face-detection` | 200-300 MB | detecção de rostos e marcos faciais do MediaPipe | blur-faces, red-eye-removal, smart-crop |
| `object-eraser-colorize` | 1-2 GB | inpainting/outpainting LaMa e DDColor | erase-object, colorize, ai-canvas-expand |
| `upscale-enhance` | 5-6 GB | RealESRGAN, GFPGAN / CodeFormer, remoção de ruído | upscale, enhance-faces, noise-removal |
| `photo-restoration` | 4-5 GB | reparo de arranhões e pipeline de restauração | restore-photo |
| `ocr` | 5-6 GB | pilha de OCR PaddleOCR / Tesseract | ocr, ocr-pdf |
| `transcription` | ~600 MB | modelos de fala para texto faster-whisper | transcribe-audio, auto-subtitles |

Ferramentas com dependências entre pacotes:

| Ferramenta | Pacotes necessários | Por quê |
|------|------------------|-----|
| `passport-photo` | `background-removal`, `face-detection` | Remove o fundo e depois usa marcos faciais para enquadrar o recorte conforme as regras de fotos de passaporte e documentos de identidade. |
| `enhance-faces` | `upscale-enhance`, `face-detection` | Detecta rostos antes de rodar o realce GFPGAN ou CodeFormer nas regiões de rosto selecionadas. |

Uma ferramenta fica disponível apenas quando todos os seus pacotes necessários estão instalados. Instalações parciais são válidas e tratadas de forma incremental: pacotes instalados são reutilizados, pacotes que faltam são mostrados como downloads e as instalações enfileiradas rodam uma de cada vez para que o ambiente Python compartilhado não seja modificado simultaneamente.

---

## Remoção de Fundo {#background-removal}

**Rota da ferramenta:** `remove-background`  
**Modelo:** rembg com BiRefNet (padrão) ou variantes U2-Net

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `model` | string | - | Variante do modelo (substituição opcional) |
| `backgroundType` | string | `"transparent"` | Um de: `transparent`, `color`, `gradient`, `blur`, `image` |
| `backgroundColor` | string | - | Cor hex para fundo sólido |
| `gradientColor1` | string | - | Primeira cor do gradiente |
| `gradientColor2` | string | - | Segunda cor do gradiente |
| `gradientAngle` | number | - | Ângulo do gradiente em graus |
| `blurEnabled` | boolean | - | Ativar efeito de desfoque de fundo |
| `blurIntensity` | number (0-100) | - | Intensidade do desfoque |
| `shadowEnabled` | boolean | - | Ativar sombra projetada no sujeito |
| `shadowOpacity` | number (0-100) | - | Opacidade da sombra |
| `outputFormat` | string | - | Formato de saída: `png`, `webp` ou `avif` |
| `edgeRefine` | integer (0-3) | - | Nível de refinamento das bordas |
| `decontaminate` | boolean | - | Remover sangramento de cor das bordas |

## Substituir Fundo {#background-replace}

**Rota da ferramenta:** `background-replace`  
**Modelo:** rembg / BiRefNet (compartilhado com remove-background)

Remove o fundo e o substitui por uma cor sólida ou gradiente.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `backgroundType` | `"color"` \| `"gradient"` | `"color"` | Modo de fundo |
| `color` | string | `"#ffffff"` | Cor hex do fundo (quando `backgroundType` é `color`) |
| `gradientColor1` | string | - | Primeira cor hex do gradiente |
| `gradientColor2` | string | - | Segunda cor hex do gradiente |
| `gradientAngle` | integer (0-360) | `180` | Ângulo do gradiente em graus |
| `feather` | integer (0-20) | `0` | Raio de suavização das bordas |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato de saída |

## Desfocar Fundo {#blur-background}

**Rota da ferramenta:** `blur-background`  
**Modelo:** rembg / BiRefNet (compartilhado com remove-background)

Desfoca o fundo mantendo o sujeito nítido.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `intensity` | integer (1-100) | `50` | Intensidade do desfoque |
| `feather` | integer (0-20) | `0` | Raio de suavização das bordas |
| `format` | `"png"` \| `"webp"` | `"png"` | Formato de saída |

## Ampliação de Imagem {#image-upscaling}

**Rota da ferramenta:** `upscale`  
**Modelo:** RealESRGAN (com fallback Lanczos quando indisponível)

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `scale` | number | `2` | Fator de ampliação |
| `model` | string | `"auto"` | Variante do modelo |
| `faceEnhance` | boolean | `false` | Aplicar passada de realce de rosto GFPGAN |
| `denoise` | number | `0` | Força da remoção de ruído |
| `format` | string | `"auto"` | Substituição do formato de saída |
| `quality` | number | `95` | Qualidade de saída (1-100) |

## OCR / Extração de Texto {#ocr-text-extraction}

**Rota da ferramenta:** `ocr`  
**Modelos:** Tesseract (rápido), PaddleOCR PP-OCRv5 (equilibrado), PaddleOCR-VL 1.5 (melhor)

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Nível de processamento |
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `enhance` | boolean | `true` | Pré-processar a imagem para melhorar a precisão do OCR |
| `engine` | string | - | Obsoleto. Mapeia `tesseract` para `fast`, `paddleocr` para `balanced` |

Retorna resultados estruturados com caixas delimitadoras, pontuações de confiança e blocos de texto extraídos.

## OCR de PDF {#pdf-ocr}

**Rota da ferramenta:** `ocr-pdf`  
**Modelos:** Mesmo sistema de níveis do OCR de imagem

Extrai texto de documentos PDF digitalizados usando OCR com IA, página por página.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `quality` | `"fast"` \| `"balanced"` \| `"best"` | `"balanced"` | Nível de processamento |
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko` |
| `pages` | string | `"all"` | Seleção de páginas: `"all"`, `"1-3"`, `"1,3,5"` |

## Desfoque de Rosto / PII {#face-pii-blur}

**Rota da ferramenta:** `blur-faces`  
**Modelo:** detecção de rostos do MediaPipe

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `blurRadius` | number (1-100) | `30` | Raio do desfoque gaussiano |
| `sensitivity` | number (0-1) | `0.5` | Limiar de confiança da detecção |

## Realce de Rosto {#face-enhancement}

**Rota da ferramenta:** `enhance-faces`  
**Modelos:** GFPGAN, CodeFormer

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `model` | `"auto"` \| `"gfpgan"` \| `"codeformer"` | `"auto"` | Modelo de realce |
| `strength` | number (0-1) | `0.8` | Força do realce |
| `sensitivity` | number (0-1) | `0.5` | Limiar de detecção de rosto |
| `onlyCenterFace` | boolean | `false` | Realçar apenas o rosto mais central |

## Colorização por IA {#ai-colorization}

**Rota da ferramenta:** `colorize`  
**Modelo:** DDColor (com fallback OpenCV DNN)

Converte fotos em preto e branco ou tons de cinza para cores completas.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `intensity` | number (0-1) | `1.0` | Força da saturação de cor |
| `model` | `"auto"` \| `"ddcolor"` \| `"opencv"` | `"auto"` | Variante do modelo |

## Remoção de Ruído {#noise-removal}

**Rota da ferramenta:** `noise-removal`  
**Modelo:** SCUNet (pipeline de remoção de ruído por níveis)

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `tier` | `"quick"` \| `"balanced"` \| `"quality"` \| `"maximum"` | `"balanced"` | Nível de processamento |
| `strength` | number (0-100) | `50` | Força da remoção de ruído |
| `detailPreservation` | number (0-100) | `50` | Quanto detalhe preservar; valores maiores mantêm mais textura |
| `colorNoise` | number (0-100) | `30` | Força da redução de ruído de cor |
| `format` | string | `"original"` | Formato de saída: `original`, `png`, `jpeg`, `webp`, `avif`, `jxl` |
| `quality` | number (1-100) | `90` | Qualidade de codificação da saída |

## Remoção de Olhos Vermelhos {#red-eye-removal}

**Rota da ferramenta:** `red-eye-removal`

Detecta marcos faciais, localiza as regiões dos olhos e corrige a saturação excessiva no canal vermelho.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `sensitivity` | number (0-100) | `50` | Limiar de detecção de pixels vermelhos |
| `strength` | number (0-100) | `70` | Força da correção |
| `format` | string | - | Substituição do formato de saída (opcional) |
| `quality` | number (1-100) | `90` | Qualidade de saída |

## Restauração de Fotos {#photo-restoration}

**Rota da ferramenta:** `restore-photo`

Pipeline de múltiplas etapas para fotos antigas ou danificadas: detecção e reparo de arranhões/rasgos, realce de rosto, remoção de ruído e colorização opcional.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `scratchRemoval` | boolean | `true` | Detectar e reparar arranhões e rasgos |
| `faceEnhancement` | boolean | `true` | Aplicar passada de realce de rosto |
| `fidelity` | number (0-1) | `0.7` | Força do realce de rosto (maior = mais conservador) |
| `denoise` | boolean | `true` | Aplicar passada de remoção de ruído |
| `denoiseStrength` | number (0-100) | `25` | Força da remoção de ruído |
| `colorize` | boolean | `false` | Colorir após a restauração |
| `colorizeStrength` | number (0-100) | `85` | Intensidade da colorização |

## Foto para Passaporte {#passport-photo}

**Rota da ferramenta:** `passport-photo`  
**Modelos:** marcos faciais do MediaPipe + remoção de fundo com BiRefNet

Fluxo de trabalho em duas fases: analisar (detectar rosto + remover fundo) e depois gerar (recortar, redimensionar, distribuir em grade). Suporta mais de 37 países em 6 regiões.

### Fase 1: Analisar {#phase-1-analyze}

`POST /api/v1/tools/image/passport-photo/analyze`

Aceita um arquivo de imagem (multipart). Retorna os dados dos marcos faciais, uma pré-visualização em base64 e as dimensões da imagem.

### Fase 2: Gerar {#phase-2-generate}

`POST /api/v1/tools/image/passport-photo/generate`

Aceita um corpo JSON com os resultados da Fase 1 mais as configurações de geração:

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `jobId` | string | (obrigatório) | ID do job da Fase 1 |
| `filename` | string | (obrigatório) | Nome do arquivo original da Fase 1 |
| `countryCode` | string | (obrigatório) | Código de país ISO (ex.: `US`, `GB`, `IN`) |
| `documentType` | string | `"passport"` | Tipo de documento |
| `bgColor` | string | `"#FFFFFF"` | Cor de fundo em hex |
| `printLayout` | string | `"none"` | Layout de impressão: `none`, `4x6`, `a4`, `letter` |
| `maxFileSizeKb` | number | `0` | Tamanho máximo do arquivo em KB (0 = sem limite) |
| `dpi` | number (72-1200) | `300` | DPI de saída |
| `customWidthMm` | number | - | Largura personalizada em mm (substitui a especificação do país) |
| `customHeightMm` | number | - | Altura personalizada em mm (substitui a especificação do país) |
| `zoom` | number (0.5-3) | `1` | Fator de zoom |
| `adjustX` | number | `0` | Ajuste de posição horizontal |
| `adjustY` | number | `0` | Ajuste de posição vertical |
| `landmarks` | object | (obrigatório) | Marcos faciais da Fase 1 |
| `imageWidth` | number | (obrigatório) | Largura da imagem da Fase 1 |
| `imageHeight` | number | (obrigatório) | Altura da imagem da Fase 1 |

## Apagar Objetos (Inpainting) {#object-erasing-inpainting}

**Rota da ferramenta:** `erase-object`  
**Modelo:** LaMa via ONNX Runtime

A máscara é enviada como uma **segunda parte de arquivo** (nome do campo `mask`), não como base64. Pixels brancos na máscara indicam áreas a apagar. As configurações `format` e `quality` são enviadas como campos de formulário de nível superior.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `file` | file | (obrigatório) | Imagem de origem (multipart) |
| `mask` | file | (obrigatório) | Imagem da máscara (multipart, nome do campo `mask`, branco = apagar) |
| `format` | string | `"auto"` | Formato de saída: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualidade de saída |

Acelerado por CUDA quando uma GPU NVIDIA está disponível.

## Expansão de Tela por IA {#ai-canvas-expand}

**Rota da ferramenta:** `ai-canvas-expand`  
**Modelo:** outpainting baseado em LaMa

Expande a tela de uma imagem em qualquer direção e preenche as novas áreas com conteúdo gerado por IA que combina com a imagem existente.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `extendTop` | integer | `0` | Pixels a estender no topo |
| `extendRight` | integer | `0` | Pixels a estender à direita |
| `extendBottom` | integer | `0` | Pixels a estender na parte inferior |
| `extendLeft` | integer | `0` | Pixels a estender à esquerda |
| `tier` | `"fast"` \| `"balanced"` \| `"high"` | `"balanced"` | Nível de qualidade |
| `format` | string | `"auto"` | Formato de saída: `auto`, `png`, `jpg`, `jpeg`, `webp`, `tiff`, `gif`, `avif`, `heic`, `heif`, `jxl` |
| `quality` | integer (1-100) | `95` | Qualidade de saída |

Pelo menos uma direção de extensão deve ser maior que 0.

## Recorte Inteligente {#smart-crop}

**Rota da ferramenta:** `smart-crop`  
**Modelo:** detecção de rostos do MediaPipe (apenas no modo de rosto)

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `mode` | string | `"subject"` | Estratégia de recorte: `subject`, `face`, `trim` |
| `strategy` | `"attention"` \| `"entropy"` | `"attention"` | Estratégia para o modo de sujeito |
| `width` | integer | - | Largura de saída |
| `height` | integer | - | Altura de saída |
| `padding` | integer (0-50) | `0` | Porcentagem de preenchimento ao redor do sujeito |
| `facePreset` | string | `"head-shoulders"` | Enquadramento predefinido quando `mode=face` |
| `sensitivity` | number (0-1) | `0.5` | Limiar de detecção de rosto |
| `threshold` | integer (0-255) | `30` | Limiar de detecção de fundo (modo de recorte de bordas) |
| `padToSquare` | boolean | `false` | Preencher o resultado recortado até um quadrado |
| `padColor` | string | `"#ffffff"` | Cor de fundo para o preenchimento quadrado |
| `targetSize` | integer | - | Tamanho alvo para a saída preenchida (pixels) |
| `quality` | integer (1-100) | - | Qualidade de saída |

Os valores legados de `mode`, `attention` e `content`, são aceitos e mapeados para `subject` e `trim` respectivamente.

**Predefinições de rosto:**

| Predefinição | Melhor para |
|--------|---------|
| `closeup` | Retratos de rosto |
| `head-shoulders` | Fotos de perfil |
| `upper-body` | LinkedIn / formal |
| `half-body` | Parte superior do corpo completa |

## Transcrever Áudio {#transcribe-audio}

**Rota da ferramenta:** `transcribe-audio`  
**Modelo:** faster-whisper

Converte fala em texto. Suporta os formatos de saída texto simples, SRT e VTT.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `outputFormat` | `"txt"` \| `"srt"` \| `"vtt"` | `"txt"` | Formato de saída |

## Legendas Automáticas {#auto-subtitles}

**Rota da ferramenta:** `auto-subtitles`  
**Modelo:** faster-whisper (extrai o áudio do vídeo e depois transcreve)

Gera arquivos de legenda a partir da trilha de áudio de um vídeo.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `language` | string | `"auto"` | Idioma: `auto`, `en`, `de`, `fr`, `es`, `zh`, `ja`, `ko`, `id`, `th`, `vi` |
| `format` | `"srt"` \| `"vtt"` | `"srt"` | Formato de saída da legenda |

## Corretor de Transparência PNG {#png-transparency-fixer}

**Rota da ferramenta:** `transparency-fixer`  
**Modelo:** matting HR do BiRefNet (resolução 2048x2048)

Corrige PNGs de "falsa transparência" onde o fundo foi removido, mas deixou franjas, halos ou artefatos semitransparentes. Usa o modelo de matting de alta resolução do BiRefNet para produzir um canal alfa limpo e depois aplica um processamento de remoção de franjas configurável para eliminar a contaminação de cor ao longo das bordas.

**Cadeia de fallback em caso de OOM:** Se o matting HR do BiRefNet exceder a memória disponível, a ferramenta recorre automaticamente a `birefnet-general` e depois a `u2net`.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `defringe` | number (0-100) | `30` | Força da remoção de franjas nas bordas para eliminar contaminação de cor |
| `outputFormat` | `"png"` \| `"webp"` | `"png"` | Formato da imagem de saída |
| `removeWatermark` | boolean | `false` | Aplicar pré-processamento de remoção de marca d'água (filtro de mediana) |

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/transparency-fixer \
  -H "Authorization: Bearer <token>" \
  -F "file=@fake-transparent.png" \
  -F 'settings={"defringe":30,"outputFormat":"png"}'
```

---

## Ferramentas com Capacidades Opcionais de IA {#tools-with-optional-ai-capabilities}

As ferramentas a seguir não são ferramentas do sidecar Python, mas usam recursos de IA quando certas opções estão habilitadas.

### Realce de Imagem {#image-enhancement}

**Rota da ferramenta:** `image-enhancement`  
**Motor:** baseado em análise (histograma e estatísticas do Sharp)

Analisa a imagem e aplica correções automáticas de exposição, contraste, balanço de branco, saturação, nitidez e ruído. Suporta modos específicos de cena.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `mode` | `"auto"` \| `"portrait"` \| `"landscape"` \| `"low-light"` \| `"food"` \| `"document"` | `"auto"` | Modo de cena para ajustar as correções |
| `intensity` | number (0-100) | `50` | Força geral da correção |
| `corrections.exposure` | boolean | `true` | Aplicar correção de exposição |
| `corrections.contrast` | boolean | `true` | Aplicar correção de contraste |
| `corrections.whiteBalance` | boolean | `true` | Aplicar correção de balanço de branco |
| `corrections.saturation` | boolean | `true` | Aplicar correção de saturação |
| `corrections.sharpness` | boolean | `true` | Aplicar correção de nitidez |
| `corrections.denoise` | boolean | `true` | Aplicar remoção de ruído |
| `deepEnhance` | boolean | `false` | Ativar remoção de ruído por IA via SCUNet (requer o pacote `upscale-enhance`) |

Um endpoint de análise adicional está disponível em `POST /api/v1/tools/image/image-enhancement/analyze`, que retorna as correções detectadas sem aplicá-las.

### Redimensionamento com Reconhecimento de Conteúdo (Seam Carving) {#content-aware-resize-seam-carving}

**Rota da ferramenta:** `content-aware-resize`  
**Motor:** binário Go `caire` (não Python - sem benefício de GPU)

Redimensiona imagens de forma inteligente removendo costuras de baixa energia, preservando o conteúdo importante.

| Parâmetro | Tipo | Padrão | Descrição |
|-----------|------|---------|-------------|
| `width` | number | - | Largura alvo |
| `height` | number | - | Altura alvo |
| `protectFaces` | boolean | `false` | Proteger as regiões de rosto detectadas (requer o pacote `face-detection`) |
| `blurRadius` | number (0-20) | `4` | Desfoque prévio para o cálculo de energia |
| `sobelThreshold` | number (1-20) | `2` | Limiar de sensibilidade das bordas |
| `square` | boolean | `false` | Forçar saída quadrada |
