---
description: "Implante o SnapOtter em produção com Docker. Requisitos de hardware, configuração de GPU e configs de proxy reverso para Nginx, Traefik e Cloudflare."
i18n_output_hash: b3176447b423
i18n_source_hash: e0d8d5f6fc87
i18n_provenance: human
---

# Implantação {#deployment}

O SnapOtter é implantado como uma stack Docker Compose de 3 contêineres: a imagem do app SnapOtter, o PostgreSQL 17 e o Redis 8. A imagem do app oferece suporte a **linux/amd64** (com NVIDIA CUDA para aceleração de IA) e **linux/arm64** (CPU), então roda nativamente em servidores Intel/AMD, Macs com Apple Silicon e dispositivos ARM como o Raspberry Pi 4/5. A aceleração por iGPU Intel/AMD através de VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA no momento.

Consulte [Imagem Docker](./docker-tags) para configuração de GPU, exemplos de Docker Compose e fixação de versão.


<!-- korean-ocr-contract:start -->
::: info Compatibilidade do OCR em coreano
O OCR rápido oferece suporte a `auto`, `en`, `de`, `es`, `fr`, `zh` e `ja`, mas não a coreano (`ko`). Coreano exige o pacote de OCR preciso e `balanced` ou `best`. O pacote funciona nos contêineres oficiais Linux amd64 e arm64, inclusive em hosts NVIDIA, onde o OCR continua na CPU. Sistemas não compatíveis recebem um erro explícito e nunca retornam silenciosamente para `fast`. Coreano com `fast` ou com o alias legado `tesseract` é rejeitado antes da fila com `FEATURE_INCOMPATIBLE` e `fast-korean-unsupported`.
:::
<!-- korean-ocr-contract:end -->
## Início Rápido (CPU) {#quick-start-cpu}

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379

      # --- Limits (set 0 for unlimited) ---
      # - MAX_UPLOAD_SIZE_MB=100   # Per-file upload limit in MB
      # - MAX_BATCH_SIZE=100       # Max files per batch request
      # - RATE_LIMIT_PER_MIN=1000  # API rate limit per IP, default shown (0 = disabled)
      # - MAX_USERS=0              # Max user accounts

      # --- Networking ---
      # - TRUST_PROXY=true         # Trust X-Forwarded-For headers (set false if not behind a proxy)

      # --- Bind mount permissions ---
      # - PUID=1000                # Match your host user's UID (run: id -u)
      # - PGID=1000                # Match your host user's GID (run: id -g)
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter     # Change this for non-local deployments
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

> **Limites de taxa do Docker Hub?** Substitua `snapotter/snapotter:latest` por `ghcr.io/snapotter-hq/snapotter:latest` para baixar do GitHub Container Registry em vez disso. Ambos os registries recebem a mesma imagem a cada release.

## Início Rápido (NVIDIA CUDA) {#quick-start-nvidia-cuda}

Para aceleração NVIDIA CUDA em ferramentas de IA suportadas (remoção de fundo, aumento de escala, aprimoramento de rosto):

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
      - DATABASE_URL=postgres://snapotter:snapotter@postgres:5432/snapotter
      - REDIS_URL=redis://redis:6379
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
      POSTGRES_USER: snapotter
      POSTGRES_PASSWORD: snapotter
      POSTGRES_DB: snapotter
    volumes:
      - SnapOtter-pgdata:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U snapotter"]
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

Verifique a detecção do CUDA nos logs:

```bash
docker logs SnapOtter 2>&1 | head -20
# Look for: [gpu] CUDA available via torch
```

## Requisitos de Hardware {#hardware-requirements}

Estes números vêm de benchmarks em uma variedade de sistemas, de uma workstation amd64 moderna com uma NVIDIA RTX 4070 até um Raspberry Pi, rodando todo o catálogo de ferramentas em cada um e variando os limites de recursos do Docker para encontrar o piso real.

### Referência Rápida {#quick-reference}

| Nível | Caso de Uso | CPU | RAM | GPU | Armazenamento |
|------|----------|-----|-----|-----|---------|
| Mínimo | Ferramentas de imagem, arquivos e PDF leves; usuário único; lotes pequenos | 2 núcleos | 2 GB | Nenhuma | ~7 GB |
| Recomendado | Todas as cinco modalidades incl. vídeo, PDF e IA em CPU; lotes; alguns usuários | 4 núcleos | 4 GB | Nenhuma | ~25 GB |
| Completo | Tudo com velocidade incl. IA em GPU; lotes grandes; muitos usuários | 6-8 núcleos | 8 GB | NVIDIA 8 GB+ VRAM (12 GB confortável) | ~35 GB |

**Arquitetura: apenas 64 bits** (`linux/amd64` ou `linux/arm64`). O SnapOtter roda nativamente em servidores Intel/AMD, Macs com Apple Silicon e placas ARM de 64 bits, incluindo o **Raspberry Pi 4 e 5** (4-8 GB). Ele **não** roda em ARM de 32 bits (`armv7`/`armhf`) — nenhuma imagem é construída para ele — nem em placas da classe 512 MB, como o Pi Zero, que estão abaixo do piso de memória (veja abaixo).

### Mínimo (ferramentas de imagem, arquivos e PDF leves; sem IA) {#minimum-image-files-and-light-pdf-tools-no-ai}

| Recurso | Requisito |
|---|---|
| CPU | 2 núcleos |
| RAM | 2 GB |
| Disco | ~5,5 GB (imagem) + volume de dados |
| GPU | Não obrigatória |

Todas as 222 ferramentas do catálogo sem IA - imagem (redimensionar, recortar, converter, comprimir, ajustar, marca d'água), vídeo (cortar, silenciar, remux), áudio (converter, normalizar, cortar), PDF (mesclar, dividir, comprimir, girar, proteger), conversões de arquivo e presets de conversão dedicados - rodam em hardware modesto. A maioria das operações termina em bem menos de um segundo, mesmo em um arquivo grande: uma imagem de 2,7 MB é redimensionada em ~0,05 s e recodificada para WebP em ~2 s.

O piso de memória é real, a partir de uma varredura de limite de recursos do Docker: **512 MB não conseguem iniciar a stack** (até mesmo um único redimensionamento de imagem é encerrado), **1 GB** lida com operações de arquivo único, mas um lote de múltiplos arquivos fica sem memória, e **2 GB / 2 núcleos** é a menor configuração que lida com lotes confortavelmente.

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 2G
```

**A única exceção que exige muita CPU é a recodificação de vídeo.** As operações de stream-copy (cortar, silenciar, remux de contêiner) são instantâneas, mas a transcodificação para um codec diferente depende da CPU. Um clipe de 1080p / 45 segundos recodificado para VP9 (WebM) leva cerca de **~40 s** em uma CPU moderna e rápida, ~45 s no Apple Silicon, ~80 s em um chip móvel de 4 núcleos mais antigo e **~130 s** em um servidor de 4 núcleos mais antigo. Se sua carga de trabalho é pesada em vídeo, priorize núcleos de CPU e velocidade de clock, ou aumente o limite `cpus:` do contêiner — o compose fornecido limita o app a 4 núcleos por padrão (8 no compose com GPU).

### Recomendado (ferramentas de IA em CPU) {#recommended-ai-tools-on-cpu}

| Recurso | Requisito |
|---|---|
| CPU | 4 núcleos |
| RAM | 4 GB |
| Disk | 3 GB (imagem) + cerca de 20 GB (todos os pacotes AI opcionais) + espaço de trabalho |
| GPU | Não obrigatória (fallback para CPU) |

**Instalar e executar pacotes maiores de IA é o que leva a recomendação para 4 GB de RAM.** Sem pacotes opcionais instalados, o aplicativo fica ocioso em torno de 360 ​​MB. As ferramentas Python legadas compartilham um sidecar, enquanto o OCR preciso usa um dispatcher dedicado de longa duração fixado à geração imutável ativa. Antes da ativação, o instalador executa um smoke test no candidato. Em seguida, ele muda atomicamente para o novo dispatcher e drena o dispatcher anterior antes de garbage collection. Cada artefato oficial de OCR preciso deve passar seu pior caso release suite dentro de 4 GiB cgroup, enquanto a recomendação de host de 4 GB deixa espaço para o aplicativo Node.js, Postgres, Redis, filas e trabalho simultâneo.

A maioria das ferramentas de IA é perfeitamente utilizável em CPU; algumas realmente precisam de uma GPU. Medido em uma CPU moderna de 4 núcleos:

| Ferramenta de IA | Tempo em CPU | Utilizável em CPU? |
|---|---|---|
| Detecção de rosto (borrar-rostos, recorte-inteligente, olhos-vermelhos), remoção-de-ruído | menos de 1 s | Sim |
| OCR, transcrição, legendas | 1-3 s | Sim |
| Colorizar, aprimoramento de rosto | ~10 s | Sim |
| Remoção / substituição / desfoque de fundo | ~29 s | Sim (você vai esperar) |
| Upscale de IA (RealESRGAN) | ~33 s pequeno; minutos em imagens grandes | Marginal — GPU fortemente recomendada |
| Restauração de foto (pipeline completo) | vários minutos | Não — precisa de uma GPU ou uma CPU rápida com muitos núcleos |

O SnapOtter intencionalmente não incorpora esses downloads de modelos na imagem Docker. Os bundles de IA são baixados apenas quando um administrador habilita a ferramenta relacionada, armazenados no volume persistente `/data/ai` e compartilhados por cada ferramenta que depende da mesma pilha de modelos. Isso mantém a imagem final do contêiner pequena, ainda permitindo que uma instalação completa de IA atinja os números de armazenamento maiores abaixo.

Algumas ferramentas dependem de mais de um bundle compartilhado. Por exemplo, Foto de Passaporte precisa tanto de `background-removal` quanto de `face-detection`; se `background-removal` já estiver instalado, habilitar Foto de Passaporte baixa apenas o bundle `face-detection` que faltava. A mesma reutilização se aplica a todas as ferramentas de IA.

Estimativas opcionais de armazenamento do pacote AI:

| Bundle | Tamanho em Disco |
|---|---|
| Remoção de fundo | 4-5 GB |
| Upscale + Aprimoramento de rosto + Remoção de ruído | 5-6 GB |
| Detecção de rosto | 200-300 MB |
| Apagador de objetos + Colorizar | 1-2 GB |
| OCR preciso (`balanced`/`best`) | ~208-234 MiB baixado / ~409-488 MiB instalado |
| Restauração de foto | 4-5 GB |
| Transcrição | ~600MB |
| **Todos os pacotes** | **~20 GB instalados** |

O OCR rápido é integrado à imagem por meio do Tesseract, adiciona cerca de 25 MiB e não requer o pacote OCR opcional ou seu requisito de memória de 4 GiB. O pacote exato está disponível nos contêineres oficiais Linux amd64 e arm64 e executa ONNX Runtime em CPU. Os hosts NVIDIA usam o mesmo tempo de execução CPU OCR, portanto, OCR não depende da versão CUDA ou da arquitetura GPU. O tempo de execução preciso requer pelo menos 4 GiB de memória efetiva: o limite cgroup do contêiner configurado, caso contrário, memória do host. SnapOtter rejeita sistemas abaixo do mínimo de compatibilidade assinado antes de baixar o pacote. A instalação do pacote preciso também é rejeitada em arquivos bare-metal/pré-construídos cujos libc e Python ABI não podem ser garantidos.

As réplicas que compartilham o mesmo `DATA_DIR` devem usar a mesma arquitetura de CPU; fixe implantações com várias réplicas em nós compatíveis usando afinidade de nós. Réplicas amd64/arm64 mistas precisam de volumes de dados separados e implantações independentes do SnapOtter.

O tempo de execução preciso mantém uma geração ativa e limpa seu cache de download após a ativação. Para esta versão, uma primeira instalação precisa temporariamente de aproximadamente 620-720 MiB para o arquivo mais teste, e uma atualização pode atingir um pico próximo a 1,2 GiB enquanto a geração antiga permanece ativa. O instalador calcula o requisito exato do índice assinado e das gerações atuais antes de fazer download ou extrair e falha antecipadamente se o volume de dados for muito pequeno.

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
| CPU | 6-8 núcleos (preparação de vídeo + concorrência rodam na CPU mesmo com IA em GPU) |
| RAM | 8 GB |
| GPU | NVIDIA com 8+ GB VRAM (12 GB recomendado) |
| Disco | ~35 GB no total |

Uma GPU NVIDIA (CUDA) acelera drasticamente os modelos de IA pesados. Medido em uma RTX 4070 vs uma CPU moderna:

| Ferramenta de IA | Ganho com GPU | Notas |
|---|---|---|
| Upscale de IA (RealESRGAN 2×) | **~47×** | O maior ganho — menos de um segundo vs ~33 s (minutos em imagens grandes) |
| Aprimoramento de rosto (CodeFormer) | **~12×** | ~0,9 s vs ~11 s |
| Transcrição (Whisper) | ~4,5× | |
| Remoção / substituição / desfoque de fundo | ~4× | ~7 s em GPU vs ~29 s em CPU |
| Colorizar | ~1,8× | |
| OCR, detecção de rosto, olhos-vermelhos, remoção-de-ruído | ~1× | Já rápido em CPU — uma GPU não ajuda |
| Restauração de foto | nenhum | Depende da CPU mesmo em uma GPU (0% de utilização da GPU); uma CPU rápida importa mais que uma GPU aqui |

As ferramentas que valem uma GPU são **upscale, aprimoramento de rosto, transcrição e remoção de fundo**. Detecção de rosto, OCR e olhos-vermelhos dependem da CPU e já são rápidas, então uma GPU não acrescenta nada.

O uso de pico de VRAM chega a 7,5 GB durante o upscale com aprimoramento de rosto. Uma GPU NVIDIA de 6 GB funciona para a maioria das ferramentas de IA individualmente, mas vai falhar no upscale. 8-12 GB de VRAM dão conta de tudo.

A aceleração por iGPU Intel/AMD através de VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA no momento. Mapear `/dev/dri` para dentro do contêiner não habilita a aceleração de IA por GPU; o SnapOtter rodará as ferramentas de IA em CPU a menos que NVIDIA CUDA esteja disponível.

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

### Usuários Simultâneos {#concurrent-users}

Requisições paralelas de redimensionamento de imagem contra o contêiner do app com limite padrão de 4 núcleos:

| Requisições Simultâneas | Tempo Médio de Resposta | Erros |
|---|---|---|
| 1 | 0,4s | 0 |
| 5 | 1,2s | 0 |
| 10 | 2,1s | 0 |

O tempo de resposta degrada de forma sublinear, sem erros, à medida que o pool de workers satura. Aumentar o limite `cpus:` do contêiner do app (ou usar um host com mais núcleos) eleva o teto. Observe que jobs pesados (transcodificação de vídeo, IA em CPU) mantêm um worker ocupado por toda a sua duração, então dimensione a CPU de acordo com o número esperado de jobs pesados simultâneos, não apenas pela contagem de requisições.

### Formatos de Imagem Suportados {#supported-image-formats}

O SnapOtter oferece suporte a **55+ formatos de entrada** e **14 formatos de saída**, incluindo arquivos RAW de mais de 20 marcas de câmera, formatos profissionais (PSD, EPS, OpenEXR, HDR), codecs modernos (JPEG XL, AVIF, HEIC, QOI) e formatos científicos/de jogos (FITS, DDS).

Consulte a [lista completa de formatos](/pt-BR/guide/supported-formats) para detalhes sobre cada formato suportado, o decodificador usado e os controles de qualidade disponíveis.

### Limitações Conhecidas {#known-limitations}

- **Redimensionamento consciente de conteúdo** trava em imagens grandes (>5 MP) devido a uma limitação no binário caire. Funciona bem com imagens menores.
- **Decodificação HEIF** leva de 13 a 23 segundos. HEIC (a variante da Apple) é muito mais rápido, de 0,3 a 0,9 segundos.
- **Upscale** expira em CPU para qualquer coisa além de imagens pequenas. GPU é obrigatória para uso prático.
- O aprimoramento de rosto **CodeFormer** é significativamente mais lento que o GFPGAN (53s vs 2s em GPU). GFPGAN é recomendado para a maioria dos casos de uso.

## Volumes {#volumes}

| Montagem / Volume | Finalidade | Obrigatório? |
|---|---|---|
| `/data` (app) | Modelos de IA, venv Python, arquivos do usuário | **Sim** - perda de arquivos sem ele |
| `/tmp/workspace` (app) | Arquivos temporários de processamento (limpos automaticamente) | Recomendado |
| `SnapOtter-pgdata` (postgres) | Diretório de dados do PostgreSQL (usuários, configurações, pipelines, jobs) | **Sim** - perda de dados sem ele |
| `SnapOtter-redisdata` (redis) | Arquivo append-only do Redis para filas de jobs duráveis | Recomendado |

### Bind mounts vs. volumes nomeados {#bind-mounts-vs-named-volumes}

**Volumes nomeados** (recomendado) — o Docker gerencia as permissões automaticamente:
```yaml
volumes:
  - SnapOtter-data:/data
```

**Bind mounts** — você gerencia as permissões. Defina `PUID`/`PGID` para corresponder ao seu usuário do host:
```yaml
volumes:
  - ./SnapOtter-data:/data
environment:
  - PUID=1000    # Your host UID (run: id -u)
  - PGID=1000    # Your host GID (run: id -g)
```

### Permissões de armazenamento {#storage-permissions}

O SnapOtter escreve em dois locais em tempo de execução: `/data` (arquivos do usuário, logs, modelos de IA e o venv Python) e `/tmp/workspace` (área temporária de processamento). Ambos precisam ter permissão de escrita para o usuário sob o qual o contêiner roda. Se algum não tiver, o contêiner **falha rápido na inicialização** com uma mensagem nomeando o diretório, o UID/GID em execução e como corrigir — em vez de subir "saudável" e depois falhar no primeiro upload com um erro críptico.

Como as permissões são tratadas depende de como o contêiner é iniciado:

**Padrão (inicia como root, muda para `snapotter`)** — o entrypoint inicia como root, corrige a propriedade dos volumes montados e depois muda para o usuário não privilegiado `snapotter` via `gosu`. Volumes nomeados funcionam sem configuração. Para bind mounts, defina `PUID`/`PGID` para o seu usuário do host (acima) para que os arquivos que ele escreve pertençam a você.

**Kubernetes / OpenShift (não-root via `runAsUser`)** — iniciado diretamente como um usuário não-root, o contêiner não consegue fazer chown dos volumes por conta própria, então o orquestrador precisa torná-los graváveis. Defina `fsGroup`:

```yaml
securityContext:
  runAsUser: 999
  runAsGroup: 999
  fsGroup: 999        # makes mounted volumes writable by the pod
```

Os diretórios graváveis da imagem pertencem ao grupo GID 0 e têm permissão de escrita de grupo, então um pod rodando com um **UID arbitrário** mais o grupo suplementar root (o padrão do OpenShift) pode escrever sem nenhum `chown`.

**TrueNAS Scale (e outras configurações de "UID estrangeiro")** — o TrueNAS roda apps como um usuário não-root (frequentemente `568:568`) e monta datasets do host pertencentes a um usuário diferente, então nem o entrypoint nem o `fsGroup` os tornam graváveis por conta própria. Escolha uma opção:

- **Rodar o app como root** (recomendado) — deixe o usuário do app sem definir ou defina-o como `0`, e deixe o entrypoint padrão corrigir as permissões e mudar para `snapotter`.
- **Rodar como UID `999`** — defina o usuário/grupo do app como `999:999` (o usuário `snapotter` interno do SnapOtter) para que corresponda à propriedade da imagem.
- **Faça `chown` no dataset do host** para o UID sob o qual o contêiner roda, a partir do shell do TrueNAS:

  ```bash
  # Use o UID do erro de inicialização (ou rode `id` dentro do contêiner)
  chown -R 568:568 /mnt/<pool>/<dataset>
  ```

O erro de inicialização nomeia o UID exato a usar, então o caminho mais rápido é iniciar o app uma vez, ler a mensagem e depois fazer `chown` (ou ajustar o usuário) de acordo.

## Variáveis de Ambiente {#environment-variables}

| Variável | Padrão | Descrição |
|---|---|---|
| `AUTH_ENABLED` | `true` | Habilita/desabilita a exigência de login |
| `DEFAULT_USERNAME` | `admin` | Nome de usuário administrador inicial |
| `DEFAULT_PASSWORD` | `admin` | Senha de administrador inicial (troca forçada no primeiro login) |
| `MAX_UPLOAD_SIZE_MB` | `100` | Limite de upload por arquivo |
| `MAX_BATCH_SIZE` | `100` | Máximo de arquivos por requisição em lote |
| `RATE_LIMIT_PER_MIN` | `1000` | Requisições à API por minuto por IP (defina 0 para desabilitar) |
| `MAX_USERS` | `0` (ilimitado) | Número máximo de contas de usuário |
| `TRUST_PROXY` | `true` | Confiar nos cabeçalhos X-Forwarded-For do proxy reverso |
| `PUID` | `999` | Rodar com este UID (para permissões de bind mount) |
| `PGID` | `999` | Rodar com este GID (para permissões de bind mount) |
| `LOG_LEVEL` | `info` | Verbosidade do log: fatal, error, warn, info, debug, trace |
| `CONCURRENT_JOBS` | `0` (auto) | Máximo de jobs de processamento de IA em paralelo |
| `SESSION_DURATION_HOURS` | `168` | Tempo de vida da sessão de login (7 dias) |
| `CORS_ORIGIN` | (vazio) | Origens permitidas separadas por vírgula, ou vazio para mesma origem |

### Proxy de saída e CA privada {#outbound-proxy-and-private-ca}

O contêiner oficial permite o suporte de proxy de ambiente do Node. Se SnapOtter precisar acessar o repositório de tempo de execução OCR ou outros serviços HTTPS por meio de um proxy corporativo, configure `HTTPS_PROXY` (e `HTTP_PROXY` quando necessário). Configure `NO_PROXY` para uma lista separada por vírgula de hosts que devem ser acessados ​​diretamente, como Postgres, Redis e armazenamento de objeto interno.

Se o proxy ou um serviço interno for assinado por uma autoridade de certificação privada, monte o certificado CA somente leitura e aponte `NODE_EXTRA_CA_CERTS` para ele. O arquivo deve existir quando o processo do Node for iniciado:

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

Mantenha as credenciais de proxy fora do arquivo Compose (por exemplo, em um arquivo ou segredo `.env` protegido). Não desative a verificação TLS: o índice OCR assinado autentica os metadados de lançamento, enquanto a validação TLS normal ainda protege o transporte e todas as outras solicitações de saída.

## Verificação de Saúde {#health-check}

O contêiner inclui uma verificação de saúde embutida:

```bash
# Check container health status
docker inspect --format='{{.State.Health.Status}}' SnapOtter

# Manual health check
curl http://localhost:1349/api/v1/health
# {"status":"healthy","version":"x.y.z"}
```

## Proxy Reverso {#reverse-proxy}

O SnapOtter define `TRUST_PROXY=true` por padrão para que a limitação de taxa e o logging usem o IP real do cliente a partir dos cabeçalhos `X-Forwarded-For`.

### Nginx {#nginx}

```nginx
server {
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

        # SSE support (batch progress, feature install progress)
        proxy_buffering off;
        proxy_read_timeout 300s;
    }
}
```

### Nginx Proxy Manager {#nginx-proxy-manager}

1. Adicione um novo Proxy Host
2. Defina o Domain Name para o seu domínio
3. Defina o Scheme para `http`, o Forward Hostname para `SnapOtter` (ou o IP do seu contêiner), a Forward Port para `1349`
4. Habilite o suporte a WebSocket
5. Em Advanced, adicione: `client_max_body_size 500M;` e `proxy_buffering off;`

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

`flush_interval -1` desabilita o buffering de resposta, que é necessário para eventos de progresso SSE (processamento em lote, ferramentas de IA, instalações de features). Os timeouts estendidos permitem que uploads de arquivos grandes sejam concluídos sem que o Caddy encerre a conexão cedo demais.

### Cloudflare Tunnels {#cloudflare-tunnels}

```bash
cloudflared tunnel --url http://localhost:1349
```

Observação: a Cloudflare tem um limite de upload de 100 MB nos planos gratuitos. Defina `MAX_UPLOAD_SIZE_MB=100` para corresponder.

## CI/CD {#ci-cd}

O repositório do GitHub tem três workflows:

- **ci.yml** - Roda automaticamente em cada push e PR. Faz lint, typecheck, testa, constrói e valida a imagem Docker (sem fazer push).
- **release.yml** - Acionado manualmente via `workflow_dispatch`. Roda o semantic-release para criar uma tag de versão e um release no GitHub, depois constrói uma imagem Docker multi-arquitetura (amd64 + arm64) e faz push para o Docker Hub (`snapotter/snapotter`) e para o GitHub Container Registry (`ghcr.io/snapotter-hq/snapotter`).
- **deploy-docs.yml** - Constrói este site de documentação e o implanta no Cloudflare Pages a cada push para `main`.

Para criar um release, vá em **Actions > Release > Run workflow** na interface do GitHub, ou execute:

```bash
gh workflow run release.yml
```

O semantic-release determina a versão a partir do histórico de commits. A tag Docker `latest` sempre aponta para o release mais recente.

## Analytics {#analytics}

O SnapOtter inclui analytics de produto anônimos (padrões de uso de ferramentas, relatórios de erro) para ajudar a detectar bugs e melhorar as features. Está ativado por padrão. Seus arquivos, nomes de arquivos e dados pessoais nunca fazem parte disso. O SnapOtter funciona normalmente com os analytics desativados.

### Desativando os analytics {#disabling-analytics}

O opt-out em tempo de execução é um toggle de administrador de um clique. Abra Configurações > Sistema > Privacidade e desative Analytics Anônimos de Produto. Ele para imediatamente para toda a instância, sem necessidade de rebuild.

Para uma imagem que nunca possa emitir analytics, defina o desligamento total em tempo de build clonando o repositório e reconstruindo:

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker/docker-compose.yml build --build-arg SNAPOTTER_ANALYTICS=off
docker compose -f docker/docker-compose.yml up -d
```

Ou adicione o build arg ao seu `docker-compose.yml` existente:

```yaml
services:
  snapotter:
    build:
      context: .
      dockerfile: docker/Dockerfile
      args:
        SNAPOTTER_ANALYTICS: "off"
```
