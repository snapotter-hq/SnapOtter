---
description: "Estrutura do monorepo, arquitetura de apps e pacotes, ciclo de vida das requisições e uso de recursos do SnapOtter."
i18n_output_hash: 93555b8e15c0
i18n_source_hash: 733cb3c10884
i18n_provenance: human
---

# Arquitetura {#architecture}

O SnapOtter é um monorepo gerenciado com pnpm workspaces e Turborepo. Ele é implantado como uma pilha Docker Compose de 3 contêineres: a imagem do app SnapOtter, o PostgreSQL 17 e o Redis 8.

## Estrutura do projeto {#project-structure}

```
snapotter/
├── apps/
│   ├── api/          # Fastify backend
│   ├── web/          # React + Vite frontend
│   └── docs/         # This VitePress site
├── packages/
│   ├── image-engine/ # Sharp-based image operations
│   ├── media-engine/ # FFmpeg spawn + progress parsing
│   ├── doc-engine/   # qpdf, LibreOffice, ghostscript wrappers
│   ├── ai/           # Python AI model bridge
│   └── shared/       # Types, constants, i18n
└── docker/           # Dockerfile and Compose config
```

## Pacotes {#packages}

### `@snapotter/image-engine` {#snapotter-image-engine}

A biblioteca principal de processamento de imagem construída sobre o [Sharp](https://sharp.pixelplumbing.com/). Ela lida com todas as operações que não são de IA: redimensionar, recortar, girar, espelhar, converter, comprimir, remover metadados e ajustes de cor (brilho, contraste, saturação, escala de cinza, sépia, inversão, canais de cor).

Este pacote não tem dependências de rede e roda inteiramente em processo.

### `@snapotter/ai` {#snapotter-ai}

Uma camada de ponte que chama tempos de execução nativos e Python ML. A maioria das ferramentas Python usa um dispatcher persistente que pré-importa bibliotecas pesadas (PIL, NumPy, MediaPipe, rembg) para que as chamadas subsequentes ignorem a sobrecarga de importação. OCR é isolado desse ambiente compartilhado mutável: `fast` invoca Tesseract nativo, enquanto `balanced` e `best` usam um JSONL dispatcher persistente dedicado fixado na geração RapidOCR/ONNX ativa e imutável. Cada solicitação contém um generation lease. A ativação primeiro executa um smoke test em um candidato e depois alterna atomicamente para seu dispatcher. O dispatcher anterior é drenado antes que sua geração seja coletada como lixo.

**Os modelos não são pré-carregados.** Cada script de ferramenta carrega os pesos do seu modelo do disco no momento da requisição e os descarta quando a requisição termina. Consulte [Uso de recursos](#resource-footprint) para o perfil de memória completo.

Operações suportadas: remoção de fundo (rembg/BiRefNet), upscaling (RealESRGAN), desfoque de rosto (MediaPipe), aprimoramento de rosto (GFPGAN/CodeFormer), apagamento de objeto (LaMa ONNX), OCR (Tesseract e RapidOCR com modelos PP-OCR ONNX), colorização (DDColor), remoção de ruído, remoção de olhos vermelhos, restauração de fotos, foto de passaporte geração, correção de transparência (BiRefNet HR-matting) e redimensionamento com reconhecimento de conteúdo (Go caire binário).

Os scripts Python residem em `packages/ai/python/`. Grandes pacotes de modelos opcionais são instalados sob demanda no volume `/data/ai` persistente. O OCR preciso usa artefatos assinados e específicos da plataforma; a camada Tesseract integrada não requer download de pacote de modelo.

### `@snapotter/shared` {#snapotter-shared}

Tipos TypeScript compartilhados, constantes (como `APP_VERSION` e as definições de ferramentas) e strings de tradução i18n usadas tanto pelo frontend quanto pelo backend.

## Aplicações {#applications}

### API (`apps/api`) {#api-apps-api}

Um servidor Fastify v5 que expõe 241 rotas de ferramentas em cinco modalidades (image, video, audio, PDF, file) e lida com:
- Uploads de arquivos, gerenciamento de espaço de trabalho temporário e armazenamento persistente de arquivos
- Biblioteca de arquivos do usuário com cadeias de versão (tabela `user_files`) - cada resultado processado remete de volta ao seu arquivo de origem e registra qual ferramenta foi aplicada, com miniaturas geradas automaticamente para a página Files
- Execução de ferramentas (roteia cada requisição de ferramenta para o motor de imagem ou para a ponte de IA)
- Orquestração de pipelines (encadeamento de várias ferramentas em sequência)
- Processamento em lote com controle de concorrência via filas de jobs do BullMQ (pools: image, media, ai, docs, system)
- Autenticação de usuários, RBAC (funções admin/user com um conjunto completo de permissões), gerenciamento de chaves de API e limitação de taxa
- Gerenciamento de equipes - CRUD apenas para admin; os usuários são atribuídos a uma equipe por meio do campo `team` no seu perfil
- Configurações de runtime - um armazenamento chave-valor na tabela `settings` que controla `disabledTools`, `enableExperimentalTools`, `loginAttemptLimit` e outros parâmetros operacionais sem reimplantar
- Marca personalizada e preferências de runtime por meio de configurações respaldadas pelo banco de dados
- Documentação Scalar/OpenAPI em `/api/docs`
- Serviço do frontend compilado como uma SPA em produção

Dependências principais: Fastify, Drizzle ORM (pg-core, node-postgres), Sharp, BullMQ, ioredis, Zod para validação.

O servidor lida com o encerramento gracioso em SIGTERM/SIGINT: ele drena as conexões HTTP, para os workers do BullMQ, desliga o dispatcher Python e fecha a conexão com o banco de dados.

### Web (`apps/web`) {#web-apps-web}

Um app de página única em React 19 construído com Vite. Usa Zustand para gerenciamento de estado, Tailwind CSS v4 para estilização e Lucide para ícones. Comunica-se com a API por REST e SSE (para acompanhamento de progresso).

As páginas incluem um espaço de trabalho de ferramentas, uma página Files para gerenciar uploads e resultados persistentes, um construtor de automação/pipelines e um painel de configurações de admin.

O frontend compilado é servido pelo backend Fastify em produção, portanto não há um servidor web separado no contêiner Docker.

### Docs (`apps/docs`) {#docs-apps-docs}

Este site VitePress. Implantado no Cloudflare Pages automaticamente a cada push para `main`.

## Como uma requisição flui {#how-a-request-flows}

1. O usuário escolhe uma ferramenta na interface web e envia um arquivo.
2. O frontend envia um POST multipart para `/api/v1/tools/:section/:toolId` com o arquivo e as configurações.
3. A rota da API valida a entrada com o Zod e depois despacha o processamento.
4. Para ferramentas padrão, o job é enfileirado no pool BullMQ apropriado (image, media ou docs, conforme a modalidade). O worker BullMQ em processo orienta automaticamente a imagem com base nos metadados EXIF, executa a função de processamento da ferramenta e retorna o resultado.
5. Para a maioria das ferramentas de IA, a ponte TypeScript envia uma solicitação ao Python dispatcher persistente. Em vez disso, o OCR rápido invoca Tesseract, e o OCR preciso inicia o executável fixado a partir da geração OCR imutável ativa. A camada OCR solicitada é fixada na entrada e nunca é alterada silenciosamente durante a execução.
6. O progresso do job é persistido na tabela `jobs` no PostgreSQL, de modo que o estado sobrevive a reinícios do contêiner. As atualizações em tempo real são entregues via SSE em `/api/v1/jobs/:jobId/progress`.
7. A API retorna um `jobId` e um `downloadUrl`. O usuário baixa o arquivo processado de `/api/v1/download/:jobId/:filename`.

Para pipelines, a API alimenta a saída de cada etapa como entrada da próxima, executando-as em sequência.

Para o processamento em lote, a API usa flows do BullMQ com jobs filhos por etapa e retorna um arquivo ZIP com todos os arquivos processados.

## Uso de recursos {#resource-footprint}

O SnapOtter foi projetado para baixo uso de memória em repouso. Nada é pré-carregado ou mantido aquecido na inicialização.

### Em repouso {#at-idle}

O processo Node.js/Fastify, o PostgreSQL e o Redis estão em execução. A RAM típica em repouso é de **cerca de 200 a 300 MB** entre os três contêineres (processo Node.js, Postgres e Redis). Sem processo Python, sem pesos de modelo na memória.

### O que inicia, e quando {#what-starts-and-when}

| Componente | Inicia quando | Memória enquanto ativo |
|-----------|-------------|---------------------|
| Servidor Fastify + Postgres + Redis | Início do contêiner | ~200-300 MB no total |
| Workers do BullMQ | Início do contêiner (em processo) | Um worker por pool (image, media, ai, docs, system) |
| Dispatcher Python | Primeira requisição de ferramenta de IA | Interpretador Python + bibliotecas pré-importadas (PIL, NumPy, MediaPipe, rembg) - sem pesos de modelo |
| Pesos de modelo de IA | Durante a requisição da ferramenta específica | Carregados do disco, liberados quando a requisição termina |

### Carregamento de modelos {#model-loading}

Todos os arquivos de pesos de modelo (somando vários GB) ficam no disco em `/opt/models/` o tempo todo. Cada script de ferramenta de IA carrega na memória apenas o(s) seu(s) próprio(s) modelo(s) durante uma requisição e depois os libera. Alguns scripts chamam explicitamente `del model` e `torch.cuda.empty_cache()` após a inferência para garantir que a memória seja devolvida imediatamente.

Não há cache de modelo entre requisições. Executar a mesma ferramenta de IA em sequência recarrega o modelo a cada vez. Isso mantém a memória em repouso próxima de zero, ao custo de um atraso de carregamento do modelo em cada requisição de IA.

### Cold start da primeira requisição de IA {#first-ai-request-cold-start}

O dispatcher Python não está em execução quando o contêiner inicia. A primeira requisição de IA dispara duas coisas em paralelo: o dispatcher começa a aquecer em segundo plano e a própria requisição recorre a gerar um subprocesso Python único e avulso. Assim que o dispatcher sinaliza que está pronto, todas as requisições de IA subsequentes o usam diretamente e evitam o custo de gerar subprocessos.
