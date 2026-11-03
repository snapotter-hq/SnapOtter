---
description: "Implante o SnapOtter em produção com Docker. Requisitos de hardware, configuração de GPU e configurações de proxy reverso para Nginx, Traefik e Cloudflare."
i18n_source_hash: b8c4ed2cc086
i18n_provenance: machine
i18n_output_hash: 26303aee55c5
i18n_hash_version: 2
---

# Implantação {#deployment}

O SnapOtter é implantado como uma stack Docker Compose de 3 contêineres: a imagem do app SnapOtter, o PostgreSQL 17 e o Redis 8. A imagem do app oferece suporte a **linux/amd64** (com NVIDIA CUDA para aceleração de IA) e **linux/arm64** (CPU), então roda nativamente em servidores Intel/AMD, Macs com Apple Silicon e dispositivos ARM como o Raspberry Pi 4/5. A aceleração por iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é compatível com inferência de IA atualmente.

Consulte [Imagem Docker](./docker-tags) para configuração de GPU, exemplos de Docker Compose e fixação de versão.

## Início rápido (CPU) {#quick-start-cpu}

```yaml
# docker-compose.yml - Copy this file and run: docker compose up -d
services:
  SnapOtter:
    image: snapotter/snapotter:latest    # or ghcr.io/snapotter-hq/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"                # Web UI + API
    volumes:
      - SnapOtter-data:/data           # AI models, user files (PERSISTENT)
      - SnapOtter-workspace:/tmp/workspace  # Temp processing files (can be tmpfs)
    environment:
      # --- Authentication ---
      - AUTH_ENABLED=true          # Set to false to disable login entirely
      - DEFAULT_USERNAME=admin     # First-run admin username
      - DEFAULT_PASSWORD=admin     # First-run admin password (you'll be forced to change it)

      # --- Database + Queue ---
      # Requests are served by a role that can only read and write rows. The
      # owner connects only during boot, to migrate and to grant. Set
      # POSTGRES_APP_PASSWORD and POSTGRES_PASSWORD for any non-local deployment.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=loopback,linklocal,uniquelocal  # Which peers may set the client IP via X-Forwarded-For (default shown)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)

      # --- Engines (empty = the image's own binaries, see Configuration) ---
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"            # Needed for Python ML shared memory
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:       # Named volume - Docker manages permissions automatically
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose up -d
```

O app fica então disponível em `http://localhost:1349`.

A stack acima se conecta como o proprietário do banco de dados. A partir do SnapOtter 2.3.0, você pode atender às requisições com um role que apenas lê e grava linhas; consulte [Roles de privilégio mínimo](./database#least-privilege-roles).

> **Limites de taxa do Docker Hub?** Substitua `snapotter/snapotter:latest` por `ghcr.io/snapotter-hq/snapotter:latest` para baixar do GitHub Container Registry. Os dois registries recebem a mesma imagem a cada lançamento.

## Início rápido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Para aceleração NVIDIA CUDA nas ferramentas de IA compatíveis (remoção de fundo, ampliação, aprimoramento de rostos):

```yaml
# docker-compose-gpu.yml - Requires: NVIDIA GPU + nvidia-container-toolkit
# Install toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html
services:
  SnapOtter:
    image: snapotter/snapotter:latest
    container_name: SnapOtter
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
      - SnapOtter-workspace:/tmp/workspace
    environment:
      - AUTH_ENABLED=true
      - DEFAULT_USERNAME=admin
      - DEFAULT_PASSWORD=admin
      # Runtime role (rows only) and the boot-only owner connection. See the CPU
      # example above.
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@postgres:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@postgres:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Engines (empty = the image's own binaries, see Configuration)
      - FFMPEG_PATH=${FFMPEG_PATH:-}
      - FFPROBE_PATH=${FFPROBE_PATH:-}
      - QPDF_PATH=${QPDF_PATH:-}
      - SOFFICE_PATH=${SOFFICE_PATH:-}
      - PDFCPU_PATH=${PDFCPU_PATH:-}
      - SNAPOTTER_HW_ACCEL=${SNAPOTTER_HW_ACCEL:-}  # nvenc|vaapi, needs your own ffmpeg build
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:1349/api/v1/health"]
      interval: 30s
      timeout: 5s
      start_period: 60s
      retries: 3
    shm_size: "2gb"                # Required for PyTorch CUDA shared memory
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all           # Or set to 1 for a specific GPU
              capabilities: [gpu]
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:17-alpine
    container_name: SnapOtter-postgres
    environment:
      # These describe the owner. The app's own role (POSTGRES_APP_USER,
      # POSTGRES_APP_PASSWORD) is created by SnapOtter at boot, so Postgres is
      # not told about it here.
      POSTGRES_USER: ${POSTGRES_USER:-snapotter}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      POSTGRES_DB: ${POSTGRES_DB:-snapotter}
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-snapotter} -d ${POSTGRES_DB:-snapotter}"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 15s

  redis:
    image: redis:8-alpine
    container_name: SnapOtter-redis
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 10s

volumes:
  SnapOtter-data:
  SnapOtter-workspace:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

```bash
docker compose -f docker-compose-gpu.yml up -d
```

### Verifique a aceleração por GPU {#verify-gpu-acceleration}

Confira a detecção do CUDA nos logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

Se as ferramentas de IA rodarem na CPU mesmo com `--gpus all` e o NVIDIA Container Toolkit configurados corretamente, reinstale o bundle afetado (por exemplo, Remoção de fundo) em **Configurações → Recursos de IA**. O instalador restaura a build com GPU do ONNX Runtime, que uma build somente CPU trazida por outro bundle (como o de transcrição) pode, de outra forma, sobrepor no ambiente de IA compartilhado. Se reinstalar pela interface não restaurar a GPU em uma imagem mais antiga, consulte o reparo manual na [issue #490](https://github.com/snapotter-hq/SnapOtter/issues/490).

## Requisitos de hardware {#hardware-requirements}

Estes números vêm de benchmarks em diversos sistemas, desde uma estação de trabalho amd64 moderna com NVIDIA RTX 4070 até um Raspberry Pi, executando todo o catálogo de ferramentas em cada um e variando os limites de recursos do Docker para encontrar o piso real.

Vai rodar na ponta pequena destas faixas (um Pi, um notebook antigo, uma VPS de 2 GB)? [Configurações de poucos recursos](/pt-BR/guide/low-resource) transforma estes números em um passo a passo concreto com limites ajustados.

### Referência rápida {#quick-reference}

| Faixa | Caso de uso | CPU | RAM | GPU | Armazenamento |
|------|----------|-----|-----|-----|---------|
| Mínimo | Ferramentas sem IA (imagem, arquivos, PDF leve) mais OCR rápido integrado e detecção de rostos; usuário único; lotes pequenos | 2 núcleos | 2 GB | Nenhuma | ~7 GB |
| Recomendado | Todas as cinco modalidades, incluindo vídeo, PDF e bundles de IA padrão na CPU; lotes; alguns usuários | 4 núcleos | 4 GB (8 GB para inpainting HQ) | Nenhuma | ~25 GB |
| Completo | Tudo em alta velocidade, incluindo IA na GPU; lotes grandes; muitos usuários | 6-8 núcleos | 8 GB | NVIDIA com 8 GB+ de VRAM (12 GB com folga) | ~35 GB |

**Arquitetura: somente 64 bits** (`linux/amd64` ou `linux/arm64`). O SnapOtter roda nativamente em servidores Intel/AMD, Macs com Apple Silicon e placas ARM de 64 bits, incluindo o **Raspberry Pi 4 e 5** (4-8 GB). Ele **não** roda em ARM de 32 bits (`armv7`/`armhf`), pois nenhuma imagem é gerada para essa arquitetura, nem em placas da classe de 512 MB, como o Pi Zero, que ficam abaixo do piso de memória (veja abaixo).

### Mínimo (ferramentas de imagem, arquivos e PDF leve; sem IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Recurso | Requisito |
|---|---|
| CPU | 2 núcleos |
| RAM | 2 GB |
| Disco | ~5,5 GB (imagem) + volume de dados |
| GPU | Não necessária |

Todas as 222 ferramentas do catálogo sem IA, entre elas imagem (redimensionar, cortar, converter, comprimir, ajustar, marca d'água), vídeo (aparar, silenciar, remux), áudio (converter, normalizar, aparar), PDF (mesclar, dividir, comprimir, girar, proteger), conversões de arquivos e predefinições de conversão dedicadas, rodam em hardware modesto. A maioria das operações termina em bem menos de um segundo, mesmo com um arquivo grande: uma imagem de 2,7 MB é redimensionada em ~0,05 s e recodificada para WebP em ~2 s.

O piso de memória é real, medido em uma varredura de limites de recursos do Docker: **512 MB não conseguem iniciar a stack** (até um único redimensionamento de imagem é encerrado), **1 GB** dá conta de operações com um único arquivo, mas um lote com vários arquivos fica sem memória, e **2 GB / 2 núcleos** é a menor configuração que lida com lotes sem IA com folga. O OCR rápido integrado e o bundle `face-detection` também cabem em 2 GB, enquanto os bundles de IA maiores (Whisper, LaMa/DDColor, rembg, RealESRGAN, restauração de fotos e inpainting HQ SD1.5) precisam de 4 a 8 GB de RAM e são recusados de imediato quando a memória livre está abaixo do piso de cada bundle.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**A única exceção que exige muito da CPU é a recodificação de vídeo.** Operações de cópia de stream (aparar, silenciar, remux de contêiner) são instantâneas, mas a transcodificação para outro codec depende da CPU. Um clipe de 1080p / 45 segundos recodificado para VP9 (WebM) leva cerca de **~40 s** em uma CPU moderna rápida, ~45 s no Apple Silicon, ~80 s em um notebook antigo de 4 núcleos e **~130 s** em um servidor antigo de 4 núcleos. Se a sua carga é pesada em vídeo, priorize núcleos de CPU e frequência de clock, ou aumente o limite `cpus:` do contêiner: o compose fornecido limita o app a 4 núcleos por padrão (8 no compose de GPU).

### Recomendado (ferramentas de IA na CPU) {#recommended-ai-tools-on-cpu}

| Recurso | Requisito |
|---|---|
| CPU | 4 núcleos |
| RAM | 4 GB |
| Disco | 3 GB (imagem) + cerca de 20 GB (todos os pacotes de IA opcionais) + área de trabalho |
| GPU | Não necessária (fallback para CPU) |

**Instalar e executar os bundles de IA maiores é o que eleva a recomendação para 4 GB de RAM.** Sem nenhum pacote opcional instalado, o app fica ocioso em torno de 360 MB. As ferramentas Python legadas compartilham um sidecar, enquanto o OCR preciso usa um dispatcher dedicado de longa duração, fixado na geração imutável ativa. Antes da ativação, o instalador executa um teste rápido no candidato. Em seguida, ele troca atomicamente para o novo dispatcher e esvazia o dispatcher anterior antes da coleta de lixo. Todo artefato oficial de OCR preciso precisa passar pela suíte de pior caso da versão dentro de um cgroup de 4 GiB, enquanto a recomendação de 4 GB para o host deixa folga para o aplicativo Node.js, o Postgres, o Redis, as filas e o trabalho concorrente.

A maioria das ferramentas de IA é perfeitamente utilizável na CPU; algumas realmente pedem uma GPU. Medido em uma CPU moderna de 4 núcleos:

| Ferramenta de IA | Tempo na CPU | Utilizável na CPU? |
|---|---|---|
| Detecção de rostos (blur-faces, smart-crop, red-eye), noise-removal | menos de 1 s | Sim |
| OCR, transcrição, legendas | 1-3 s | Sim |
| Colorização, aprimoramento de rostos | ~10 s | Sim |
| Remoção / substituição / desfoque de fundo | ~29 s | Sim (você vai esperar) |
| Ampliação por IA (RealESRGAN) | ~33 s em imagens pequenas; minutos em imagens grandes | Marginal: GPU fortemente recomendada |
| Restauração de fotos (pipeline completo) | vários minutos | Não: exige uma GPU ou uma CPU rápida com muitos núcleos |

O SnapOtter intencionalmente não embute esses downloads de modelos na imagem Docker. Os bundles de IA são baixados somente quando um administrador ativa a ferramenta relacionada, ficam armazenados no volume persistente `/data/ai` e são compartilhados por todas as ferramentas que dependem da mesma pilha de modelos. Isso mantém a imagem final do contêiner pequena e, ainda assim, permite que uma instalação completa de IA chegue aos números de armazenamento maiores abaixo.

Algumas ferramentas dependem de mais de um bundle compartilhado. Por exemplo, o Passport Photo precisa de `background-removal` e de `face-detection`; se `background-removal` já estiver instalado, ativar o Passport Photo baixa apenas o bundle `face-detection` que falta. O mesmo reaproveitamento vale para todas as ferramentas de IA.

Armazenamento dos pacotes de IA opcionais e pisos de memória da CPU (o SnapOtter verifica a memória disponível antes de despachar para o sidecar Python e recusa imediatamente execuções abaixo do piso de memória livre do bundle):

| Bundle | Tamanho em disco | Piso de memória da CPU |
|---|---|---|
| Detecção de rostos | 200-300 MB | 2 GB de RAM do host (~0,5 GB livres) |
| Transcrição | ~600 MB | 4 GB de RAM do host (~2 GB livres) |
| Removedor de objetos + Colorização | 1-2 GB | 4 GB de RAM do host (~2 GB livres) |
| OCR preciso (`balanced`/`best`) | ~208-234 MiB de download / ~409-488 MiB instalados | 4 GiB de memória efetiva configurada (`fast` roda com 2 GB) |
| Remoção de fundo | 4-5 GB | 4 GB de RAM do host (~2,5 GB livres) |
| Ampliação + Aprimoramento de rostos + Remoção de ruído | 5-6 GB | 4 GB de RAM do host (~2,5 GB livres) |
| Restauração de fotos | 4-5 GB | 4 GB de RAM do host (~3 GB livres) |
| Inpainting de alta qualidade (`inpaint-hq`) | 5-7 GB | 8 GB de RAM do host (~6 GB livres) |
| **Todos os bundles** | **~25 GB instalados** | **4 GB (8 GB com `inpaint-hq`)** |

O OCR rápido vem integrado à imagem por meio do Tesseract, adiciona cerca de 25 MiB e não exige o pacote opcional de OCR nem o requisito de memória de 4 GiB. O modo rápido oferece suporte a `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, mas não a coreano (`ko`) nem a árabe (`ar`). Ambos usam `balanced` ou `best` e, portanto, exigem o pacote preciso. O pacote preciso está disponível nos contêineres Linux oficiais amd64 e arm64 e executa o ONNX Runtime na CPU. Hosts NVIDIA usam esse mesmo runtime de OCR na CPU, então o OCR não depende da versão do CUDA nem da arquitetura da GPU. O runtime preciso exige pelo menos 4 GiB de memória efetiva: o limite de cgroup configurado do contêiner ou, na falta dele, a memória do host. O SnapOtter rejeita sistemas abaixo desse mínimo de compatibilidade assinado antes de baixar o pacote. A instalação do pacote preciso também é rejeitada em arquivos bare-metal/pré-compilados cuja libc e cuja ABI do Python não possam ser garantidas. Nesses hosts sem suporte, o OCR de coreano e de árabe retorna um erro explícito de incompatibilidade e nunca recorre silenciosamente ao modo rápido.

Réplicas que compartilham o mesmo `DATA_DIR` devem usar a mesma arquitetura de CPU; fixe implantações com várias réplicas usando node affinity. Réplicas mistas amd64/arm64 precisam de volumes de dados separados e de implantações independentes do SnapOtter.

O runtime preciso mantém uma geração ativa e limpa seu cache de download após a ativação. Nesta versão, uma primeira instalação precisa temporariamente de cerca de 620-720 MiB para o arquivo mais a área de preparação, e uma atualização pode chegar perto de 1,2 GiB enquanto a geração antiga continua ativa. O instalador calcula o requisito exato a partir do índice assinado e das gerações atuais antes de baixar ou extrair, e falha cedo se o volume de dados for pequeno demais.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 4G
```

### Completo (ferramentas de IA em NVIDIA CUDA) {#full-ai-tools-on-nvidia-cuda}

| Recurso | Requisito |
|---|---|
| CPU | 6-8 núcleos (a preparação de vídeo e a concorrência rodam na CPU, mesmo com IA na GPU) |
| RAM | 8 GB |
| GPU | NVIDIA com 8+ GB de VRAM (12 GB recomendados) |
| Disco | ~35 GB no total |

Uma GPU NVIDIA (CUDA) acelera drasticamente os modelos de IA mais pesados. Medido em uma RTX 4070 contra uma CPU moderna:

| Ferramenta de IA | Ganho de velocidade com GPU | Observações |
|---|---|---|
| Ampliação por IA (RealESRGAN 2×) | **~47×** | O maior ganho: menos de um segundo contra ~33 s (minutos em imagens grandes) |
| Aprimoramento de rostos (CodeFormer) | **~12×** | ~0,9 s contra ~11 s |
| Transcrição (Whisper) | ~4,5× | |
| Remoção / substituição / desfoque de fundo | ~4× | ~7 s na GPU contra ~29 s na CPU |
| Colorização | ~1,8× | |
| OCR, detecção de rostos, red-eye, noise-removal | ~1× | Já é rápido na CPU: uma GPU não ajuda |
| Restauração de fotos | nenhum | Limitada pela CPU mesmo em uma GPU (0% de utilização da GPU); uma CPU rápida importa mais que uma GPU aqui |

As ferramentas que valem uma GPU são **ampliação, aprimoramento de rostos, transcrição e remoção de fundo**. Detecção de rostos, OCR e red-eye são limitados pela CPU e já são rápidos, então uma GPU não acrescenta nada.

O uso máximo de VRAM chega a 7,5 GB durante a ampliação com aprimoramento de rostos. Uma GPU NVIDIA de 6 GB funciona para a maioria das ferramentas de IA individualmente, mas falha na ampliação. De 8 a 12 GB de VRAM dão conta de tudo.

A aceleração por iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é compatível com inferência de IA atualmente. Mapear `/dev/dri` para dentro do contêiner não ativa a aceleração de IA por GPU; o SnapOtter executará as ferramentas de IA na CPU, a menos que o NVIDIA CUDA esteja disponível.

```yaml
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

### Usuários simultâneos {#concurrent-users}

Requisições paralelas de redimensionamento de imagem contra o contêiner do app padrão, limitado a 4 núcleos:

| Requisições simultâneas | Tempo médio de resposta | Erros |
|---|---|---|
| 1 | 0,4s | 0 |
| 5 | 1,2s | 0 |
| 10 | 2,1s | 0 |

O tempo de resposta degrada de forma sublinear, sem erros, conforme o pool de workers satura. Aumentar o limite `cpus:` do contêiner do app (ou usar um host com mais núcleos) eleva o teto. Observe que tarefas pesadas (transcodificação de vídeo, IA na CPU) ocupam um worker durante toda a sua duração, então dimensione a CPU pelo número esperado de tarefas pesadas simultâneas, não apenas pela contagem de requisições.

### Formatos de imagem compatíveis {#supported-image-formats}

O SnapOtter oferece suporte a **mais de 55 formatos de entrada** e **14 formatos de saída**, incluindo arquivos RAW de mais de 20 marcas de câmeras, formatos profissionais (PSD, EPS, OpenEXR, HDR), codecs modernos (JPEG XL, AVIF, HEIC, QOI) e formatos científicos/de jogos (FITS, DDS).

Consulte a [lista completa de formatos](/pt-BR/guide/supported-formats) para detalhes sobre cada formato compatível, o decodificador usado e os controles de qualidade disponíveis.

### Limitações conhecidas {#known-limitations}

- O **redimensionamento com reconhecimento de conteúdo** trava em imagens grandes (>5 MP) devido a uma limitação no binário caire. Funciona bem com imagens menores.
- A **decodificação de HEIF** leva de 13 a 23 segundos. O HEIC (a variante da Apple) é muito mais rápido, com 0,3 a 0,9 segundo.
- A **ampliação** expira na CPU para qualquer coisa além de imagens pequenas. É necessária uma GPU para uso prático.
- O aprimoramento de rostos com **CodeFormer** é significativamente mais lento que o GFPGAN (53 s contra 2 s na GPU). O GFPGAN é recomendado para a maioria dos casos de uso.

## Volumes {#volumes}

| Ponto de montagem / Volume | Finalidade | Obrigatório? |
|---|---|---|
| `/data` (app) | Modelos de IA, venv do Python, arquivos do usuário | **Sim** - perda de arquivos sem ele |
| `/tmp/workspace` (app) | Arquivos temporários de processamento (limpos automaticamente) | Recomendado |
| `SnapOtter-pgdata` (postgres) | Diretório de dados do PostgreSQL (usuários, configurações, pipelines, tarefas) | **Sim** - perda de dados sem ele |
| `SnapOtter-redisdata` (redis) | Arquivo append-only do Redis para filas de tarefas duráveis | Recomendado |

### Bind mounts vs. volumes nomeados {#bind-mounts-vs-named-volumes}

**Volumes nomeados** (recomendado): o Docker gerencia as permissões automaticamente:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts**: você gerencia as permissões. Defina `PUID`/`PGID` para corresponder ao usuário do seu host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permissões de armazenamento {#storage-permissions}

O SnapOtter grava em dois locais em tempo de execução: `/data` (arquivos do usuário, logs, modelos de IA e o venv do Python) e `/tmp/workspace` (área temporária de processamento). Ambos precisam ser graváveis pelo usuário com o qual o contêiner é executado. Se algum deles não for, o contêiner **falha logo na inicialização** com uma mensagem que informa o diretório, o UID/GID em execução e como corrigir, em vez de subir "saudável" e depois falhar no primeiro upload com um erro enigmático. O diretório de logs (`LOG_DIR`, `/data/logs` na imagem) é verificado da mesma forma, em todos os modos de armazenamento, já que os logs permanecem locais mesmo quando os arquivos ficam no S3.

Como as permissões são tratadas depende de como o contêiner é iniciado:

**Padrão (inicia como root e passa para `snapotter`)**: o entrypoint inicia como root, corrige a propriedade dos volumes montados e depois passa para o usuário sem privilégios `snapotter` por meio de `gosu`. Volumes nomeados funcionam sem nenhuma configuração. Para bind mounts, defina `PUID`/`PGID` com o seu usuário do host (acima) para que os arquivos gravados pertençam a você.

**Kubernetes / OpenShift (não root via `runAsUser`)**: iniciado diretamente como um usuário não root, o contêiner não consegue executar chown nos volumes, então o orquestrador precisa torná-los graváveis. Defina `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Os diretórios graváveis da imagem pertencem ao grupo GID 0 e têm permissão de escrita para o grupo, então um pod executado com um **UID arbitrário** mais o grupo suplementar root (o padrão do OpenShift) consegue gravar sem `chown`.

**TrueNAS Scale (e outras configurações com "UID estrangeiro")**: o TrueNAS executa apps como um usuário não root (frequentemente `568:568`) e monta datasets do host pertencentes a outro usuário, então nem o entrypoint nem `fsGroup` os tornam graváveis por si só. Escolha uma opção:

- **Executar o app como root** (recomendado): deixe o usuário do app indefinido ou defina-o como `0`, e deixe o entrypoint padrão corrigir as permissões e passar para `snapotter`.
- **Executar como UID `999`**: defina o usuário/grupo do app como `999:999` (o usuário `snapotter` integrado do SnapOtter) para corresponder à propriedade da imagem.
- **`chown` no dataset do host** para o UID com o qual o contêiner é executado, no shell do TrueNAS:

  ```bash
  # Use the UID from the startup error (or run `id` inside the container)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

O erro de inicialização informa o UID exato a usar, então o caminho mais rápido é iniciar o app uma vez, ler a mensagem e então executar `chown` (ou ajustar o usuário) de acordo.

## Variáveis de ambiente {#environment-variables}

| Variável | Padrão | Descrição |
|---|---|---|
| `AUTH_ENABLED` | `true` | Ativa/desativa a exigência de login |
| `DEFAULT_USERNAME` | `admin` | Nome de usuário do administrador inicial |
| `DEFAULT_PASSWORD` | `admin` | Senha do administrador inicial (troca obrigatória no primeiro login) |
| `MAX_UPLOAD_SIZE_MB` | `0` (ilimitado) | Limite de upload por arquivo em MB. A imagem já vem com `0`; uma build a partir do código-fonte começa em 100 |
| `MAX_BATCH_SIZE` | `0` (ilimitado) | Máximo de arquivos por requisição em lote. A imagem já vem com `0`; uma build a partir do código-fonte começa em 100 |
| `RATE_LIMIT_PER_MIN` | `1000` | Requisições de API por minuto por IP (defina 0 para desativar) |
| `MAX_USERS` | `0` (ilimitado) | Máximo de contas de usuário |
| `TRUST_PROXY` | `loopback,linklocal,uniquelocal` | Quais peers podem definir o IP do cliente por meio de `X-Forwarded-For`. Somente redes privadas por padrão |
| `PUID` | `999` | Executar com este UID (para permissões de bind mount) |
| `PGID` | `999` | Executar com este GID (para permissões de bind mount) |
| `LOG_LEVEL` | `info` | Detalhamento do log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (automático) | Máximo de tarefas de processamento de IA em paralelo |
| `SESSION_DURATION_HOURS` | `168` | Duração da sessão de login (7 dias) |
| `CORS_ORIGIN` | (vazio) | Origens permitidas separadas por vírgula, ou vazio para mesma origem |

### Proxy de saída e CA privada {#outbound-proxy-and-private-ca}

O contêiner oficial ativa o suporte do Node a proxy via variáveis de ambiente. Se o SnapOtter precisar alcançar o repositório do runtime de OCR ou outros serviços HTTPS por meio de um proxy corporativo, defina `HTTPS_PROXY` (e `HTTP_PROXY` quando necessário). Defina `NO_PROXY` como uma lista separada por vírgulas de hosts que devem ser acessados diretamente, como Postgres, Redis e o armazenamento de objetos interno.

Se o proxy ou um serviço interno for assinado por uma autoridade certificadora privada, monte o certificado da CA como somente leitura e aponte `NODE_EXTRA_CA_CERTS` para ele. O arquivo precisa existir quando o processo do Node iniciar:

```yaml
services:
  app:
    environment:
      HTTPS_PROXY: http://proxy.example.internal:3128
      HTTP_PROXY: http://proxy.example.internal:3128
      NO_PROXY: postgres,redis,minio,localhost,127.0.0.1
      NODE_EXTRA_CA_CERTS: /etc/snapotter/custom-ca.pem
    volumes:
      - ./company-ca.pem:/etc/snapotter/custom-ca.pem:ro
```

Mantenha as credenciais do proxy fora do arquivo Compose (por exemplo, em um arquivo `.env` protegido ou em um secret). Não desative a verificação TLS: o índice de OCR assinado autentica os metadados da versão, enquanto a validação TLS normal continua protegendo o transporte e todas as demais requisições de saída.

## Verificação de integridade {#health-check}

O contêiner inclui uma verificação de integridade integrada:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Proxy reverso {#reverse-proxy}

`TRUST_PROXY` tem como padrão `loopback,linklocal,uniquelocal`, então o SnapOtter só confia em `X-Forwarded-For` quando vem de um peer em uma rede privada. Um proxy reverso no mesmo host, em uma rede Docker ou na sua LAN é confiável de imediato, o que significa que o limite de taxa, o limitador de força bruta do login, o log de auditoria e a lista de IPs permitidos do enterprise veem o IP real do cliente sem nenhuma configuração.

Defina `TRUST_PROXY=true` somente quando o proxy à frente alcançar o SnapOtter a partir de um endereço **público**, um balanceador de carga em nuvem em outra rede, por exemplo. Em uma instância diretamente exposta, esse valor torna `request.ip` controlável por um atacante, porque quem alterna o cabeçalho ganha um novo bucket de limite de taxa a cada requisição.

Duas coisas a saber antes de começar a medir IPs de clientes. O Docker Desktop no macOS e no Windows atende uma porta publicada por meio de um proxy em espaço de usuário que reescreve todo endereço de origem para o gateway da VM `192.168.65.1`, então nenhum valor de `TRUST_PROXY` recupera o cliente real ali; implante no Linux para qualquer coisa exposta à internet. E, em qualquer plataforma, alcançar uma porta publicada por `localhost` é observado como o gateway da bridge, e não como o seu cliente, então um teste em localhost não diz nada sobre como um cliente real é identificado. A tabela completa de valores de `TRUST_PROXY` e a ressalva do Docker Desktop estão em [SECURITY.md](https://github.com/snapotter-hq/SnapOtter/blob/main/SECURITY.md#client-ip-resolution-trust_proxy).

Duas coisas valem para todos os proxies abaixo: permitir corpos de requisição grandes (uploads) e não armazenar respostas em buffer. Um proxy que armazena respostas em buffer quebra o progresso por SSE e, de forma mais visível, faz um download de arquivo grande "começar, mas nunca terminar", porque o proxy retém o arquivo inteiro antes de repassá-lo. O SnapOtter envia `X-Accel-Buffering: no` nos downloads para que o nginx os transmita em stream mesmo que o buffering esteja ativo em outro ponto, mas proxies diferentes do nginx precisam ter o buffering de respostas desativado explicitamente (mostrado em cada configuração abaixo). Se um download travar no meio, um proxy com buffering à frente é a primeira coisa a verificar.

Uma observação sobre HSTS: a própria API envia `Strict-Transport-Security` em todas as respostas, então um proxy que repassa os cabeçalhos de resposta (todas as configurações abaixo fazem isso) não precisa de nenhuma configuração de HSTS própria. Somente se o seu proxy estiver configurado para remover ou sobrescrever os cabeçalhos de resposta do upstream é que você precisa preservar o cabeçalho ou adicioná-lo novamente na borda.

### Nginx {#nginx}

```nginx
server {
    # Plain HTTP shown for brevity. Terminate TLS in your own `listen 443 ssl`
    # server block; the Strict-Transport-Security header the API sends passes
    # through with every proxied response, so no add_header is needed there.
    listen 80;
    server_name images.example.com;

    # Match MAX_UPLOAD_SIZE_MB (0 = nginx default 1M, so set high for unlimited)
    client_max_body_size 500M;

    location / {
        proxy_pass http://localhost:1349;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Stream responses instead of buffering: needed for SSE progress
        # (batch, AI, feature installs) and for large file downloads.
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Implantação em um subcaminho {#subpath}

Para servir em `https://example.com/snapotter`, defina `BASE_PATH=/snapotter` no ambiente do contêiner do
SnapOtter e reinicie-o. Os arquivos Compose oficiais de CPU e GPU também
aceitam `BASE_PATH` a partir do seu shell ou do arquivo `.env` do Compose. A mesma
imagem funciona em qualquer caminho; não é necessário recompilar o frontend.

`BASE_PATH` aceita segmentos separados por barras contendo letras, dígitos, `_` ou
`-`, incluindo caminhos aninhados como `/apps/snapotter`. A barra final é
opcional. Deixe-o vazio (o padrão), ou defina `/`, para uma implantação na raiz.

No bloco de servidor HTTPS existente do seu Nginx, use:

```nginx
location = /snapotter {
    return 308 /snapotter/$is_args$args;
}
location /snapotter/ {
    proxy_pass http://localhost:1349;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 500M;
    proxy_buffering off;
    proxy_read_timeout 300s;
}
```

Este exemplo preserva o prefixo. Proxies que removem `/snapotter` antes de
encaminhar também são compatíveis. As verificações de integridade internas podem continuar usando
`/api/v1/health`. Para OIDC ou SAML, defina também
`EXTERNAL_URL=https://example.com/snapotter` e atualize as URLs de callback do provedor de identidade para incluir `/snapotter/api/auth/oidc/callback` ou
`/snapotter/api/auth/saml/callback`, respectivamente.

Os scripts de API continuam funcionando sem alterações: as URLs nas respostas da API, como o
`downloadUrl` de uma ferramenta, começam com `/api/` independentemente de `BASE_PATH`. Anexe-as à
URL base da sua instância (`https://example.com/snapotter` + `/api/v1/download/...`)
em vez de resolvê-las a partir da raiz do domínio.

Abra a interface pela URL com prefixo (`https://example.com/snapotter`). Um
navegador que chegar sem o prefixo é enviado para lá automaticamente; espera-se que apenas
requisições de API cheguem ao app sem prefixo. Se os logs disserem
`Requests arrive under /snapotter/ but BASE_PATH is empty`, o seu proxy está
encaminhando um prefixo que `BASE_PATH` não declara: defina `BASE_PATH` com ele,
ou remova o prefixo no proxy.

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Adicione um novo Proxy Host
2. Defina o Domain Name para o seu domínio
3. Defina Scheme como `http`, Forward Hostname como `SnapOtter` (ou o IP do seu contêiner) e Forward Port como `1349`
4. Ative o suporte a WebSocket
5. Em Advanced, adicione: `client_max_body_size 500M;` e `proxy_buffering off;`

O cabeçalho `Strict-Transport-Security` da API passa pelo NPM sem alterações; a opção de HSTS na aba SSL é opcional além disso.

### Traefik {#traefik}

```yaml
# Add these labels to the SnapOtter service in docker-compose.yml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.snapotter.rule=Host(`images.example.com`)"
  - "traefik.http.routers.snapotter.entrypoints=websecure"
  - "traefik.http.routers.snapotter.tls.certresolver=letsencrypt"
  - "traefik.http.services.snapotter.loadbalancer.server.port=1349"
  # Increase upload limit (default 2MB is too low)
  - "traefik.http.middlewares.snapotter-body.buffering.maxRequestBodyBytes=524288000"
  - "traefik.http.routers.snapotter.middlewares=snapotter-body"
```

O Traefik encaminha os cabeçalhos de resposta do upstream sem alterá-los, então o cabeçalho `Strict-Transport-Security` da API chega aos navegadores sem um middleware `headers`. Se você já executa um que reescreve cabeçalhos de resposta, garanta que ele deixe esse cabeçalho intacto.

### Caddy {#caddy}

```txt
images.example.com {
    reverse_proxy localhost:1349 {
        flush_interval -1
        transport http {
            read_timeout 300s
            write_timeout 300s
        }
    }
}
```

`flush_interval -1` desativa o buffering de respostas, o que é necessário para os eventos de progresso por SSE (processamento em lote, ferramentas de IA, instalações de recursos) e para que downloads de arquivos grandes sejam transmitidos em stream em vez de travar. Os timeouts estendidos permitem que uploads de arquivos grandes terminem sem que o Caddy feche a conexão antes da hora. O Caddy também repassa o cabeçalho `Strict-Transport-Security` da API sem alterações, então nenhuma diretiva `header` é necessária para o HSTS.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Observação: o Cloudflare tem um limite de upload de 100 MB nos planos gratuitos. Defina `MAX_UPLOAD_SIZE_MB=100` para corresponder.

O túnel encaminha os cabeçalhos de resposta da API, `Strict-Transport-Security` incluído, então nenhuma configuração de HSTS no painel é necessária (a configuração de HSTS própria da borda do Cloudflare é opcional além disso).

## Solução de problemas {#troubleshooting}

### "Postgres not reachable: EAI_AGAIN" logo após uma primeira inicialização com falha {#eai-again-after-failed-first-start}

Se o primeiro `docker compose up -d` falhar no meio do caminho (uma porta já em uso é o motivo habitual), uma nova tentativa simples com `up -d` pode iniciar o contêiner do app sem anexá-lo à rede do compose. O app então entra em loop de falhas com:

```
Postgres not reachable: EAI_AGAIN
```

enquanto `docker ps` mostra o postgres saudável. O erro é real, mas aponta para o contêiner errado: sem a rede, o DNS do hostname `postgres` não consegue ser resolvido de forma alguma, e a política de reinício repete a mesma falha para sempre.

Corrija o que quebrou a primeira inicialização (normalmente: libere a porta) e então force a recriação do contêiner do app para que ele se reanexe à rede:

```bash
docker compose up -d --force-recreate SnapOtter
```

### Windows: acessível de outros dispositivos, mas não do próprio PC {#windows-wsl2-loopback}

Com o Docker rodando dentro do WSL2 (a configuração usual no Windows), a stack pode estar acessível de todas as outras máquinas da sua rede enquanto `http://localhost:1349` expira no próprio host Windows, mesmo com o modo de rede espelhada do WSL ativado. A porta nunca aparece no `netstat` do Windows, e não há nada de errado com os contêineres.

Abra o app a partir de outro dispositivo ou de dentro da distro usando o endereço dela (`hostname -I` no shell do WSL). Se o encaminhamento de localhost por acaso funcionar na sua versão do WSL, trate isso como um bônus, e não como algo de que depender.

## CI/CD {#ci-cd}

O repositório do GitHub tem três workflows:

- **ci.yml** - Executado automaticamente a cada push e PR. Faz lint, verificação de tipos, testes, build e valida a imagem Docker (sem publicá-la).
- **release.yml** - Acionado manualmente via `workflow_dispatch`. Executa o semantic-release para criar uma tag de versão e um release no GitHub e, em seguida, compila uma imagem Docker multi-arquitetura (amd64 + arm64) e a publica no Docker Hub (`snapotter/snapotter`) e no GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Compila este site de documentação e o implanta no Cloudflare Pages a cada push em `main`.

Para criar um release, vá em **Actions > Release > Run workflow** na interface do GitHub, ou execute:

```bash
gh workflow run release.yml
```

O semantic-release determina a versão a partir do histórico de commits. A tag Docker `latest` sempre aponta para o release mais recente.

## Analytics {#analytics}

O SnapOtter inclui analytics de produto anônimos (padrões de uso das ferramentas, relatórios de erros) para ajudar a encontrar bugs e melhorar os recursos. Ele vem ativado por padrão. Seus arquivos, nomes de arquivos e dados pessoais nunca fazem parte disso. O SnapOtter funciona normalmente com o analytics desativado.

### Desativando o analytics {#disabling-analytics}

A desativação em tempo de execução é uma chave de administrador de um clique. Abra Configurações > Sistema > Privacidade e desative Anonymous Product Analytics. Ele para imediatamente para toda a instância, sem necessidade de rebuild.

Para uma imagem que nunca possa emitir analytics, defina o desligamento forçado em tempo de build clonando o repositório e recompilando:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Ou adicione o argumento de build ao seu `docker-compose.yml` existente:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
