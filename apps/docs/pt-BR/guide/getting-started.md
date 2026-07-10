---
description: "Instale o SnapOtter com Docker em um único comando. Inclui a configuração do Docker Compose, compilação a partir do código-fonte e uma visão geral completa dos recursos."
i18n_source_hash: d2366a2e051c
i18n_provenance: human
i18n_output_hash: 72e64ccfdb7f
---

# Introdução {#getting-started}

::: tip Experimente antes de instalar
Explore a interface completa em [demo.snapotter.com](https://demo.snapotter.com) - sem necessidade de cadastro ou instalação.
:::

## Início rápido {#quick-start}

```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data snapotter/snapotter:latest
```

Este contêiner único roda tudo o que precisa: sem nenhum `DATABASE_URL` definido, ele inicia seu próprio PostgreSQL e Redis na interface de loopback (modo embutido) e mantém todos os dados no volume `SnapOtter-data`. É a forma mais rápida de experimentar o SnapOtter ou de auto-hospedá-lo em um homelab. Para produção, execute a pilha do [Docker Compose](#docker-compose) abaixo, que mantém o PostgreSQL e o Redis em seus próprios contêineres. O modo embutido roda como root (o padrão) e se desliga automaticamente assim que você define `DATABASE_URL`.

Você será solicitado a trocar sua senha no primeiro login.

::: tip Análise anônima de produto
O SnapOtter inclui análise anônima de produto por padrão. Para desativá-la, abra **Configurações → Sistema → Privacidade** e desligue **Análise anônima de produto**. Ela para imediatamente em toda a instância.

Para detalhes sobre o que é coletado, veja [O que o SnapOtter coleta](/pt-BR/guide/telemetry).
:::

::: tip Aceleração NVIDIA CUDA
Adicione `--gpus all` para remoção de fundo, upscale, OCR, aprimoramento de rostos e restauração acelerados por NVIDIA CUDA:

```bash
docker run -d --name SnapOtter -p 1349:1349 --gpus all -v SnapOtter-data:/data snapotter/snapotter:latest
```

Requer o [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html). Recorre à CPU automaticamente quando o CUDA não está disponível. Aceleração de iGPU Intel/AMD via VA-API, Quick Sync ou OpenCL não é suportada para inferência de IA hoje. Veja [Tags Docker](/pt-BR/guide/docker-tags) para benchmarks.
:::

::: details Também no GHCR
```bash
docker run -d --name SnapOtter -p 1349:1349 -v SnapOtter-data:/data ghcr.io/snapotter-hq/snapotter:latest
```

Ambos os registries publicam a mesma imagem em cada versão.
:::

## Docker Compose {#docker-compose}

```yaml
services:
  SnapOtter:
    image: snapotter/snapotter:latest  # or ghcr.io/snapotter-hq/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - SnapOtter-data:/data
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

  postgres:
    image: postgres:17-alpine
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

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--maxmemory-policy", "noeviction", "--appendonly", "yes"]
    volumes:
      - SnapOtter-redisdata:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 12

volumes:
  SnapOtter-data:
  SnapOtter-pgdata:
  SnapOtter-redisdata:
```

Veja [Configuração](/pt-BR/guide/configuration) para todas as variáveis de ambiente.

## Compilar a partir do código-fonte {#build-from-source}

**Pré-requisitos:** Node.js 22+, pnpm 9+, Docker (para Postgres + Redis), Python 3.10+ (para recursos de IA), Git.

```bash
git clone https://github.com/snapotter-hq/SnapOtter.git
cd SnapOtter
docker compose -f docker-compose.dev.yml up -d   # start Postgres + Redis
pnpm install
pnpm dev
```

- Frontend: [http://localhost:1349](http://localhost:1349)
- Backend: [http://localhost:13490](http://localhost:13490)

## O que você pode fazer {#what-you-can-do}

### Processamento de arquivos (241 ferramentas) {#file-processing-241-tools}

| Modalidade | Quantidade | Ferramentas de exemplo |
|----------|-------|---------------|
| **Imagem** | 105 | Redimensionar, Recortar, Comprimir, Converter, Remover Fundo, Upscale, OCR, Marca d'água, Colagem, Colorizar, Ferramentas de GIF, presets de formato |
| **Vídeo** | 57 | Aparar, Recortar, Comprimir, Converter, Mesclar, Extrair Áudio, Legendas Automáticas, Vídeo para GIF, Redimensionar, Estabilizar, presets de formato |
| **Áudio** | 27 | Aparar, Mesclar, Converter, Normalizar, Redução de Ruído, Transcrever, Alterar Tom, Fade, Criador de Toque, presets de formato |
| **PDF / Documento** | 42 | Mesclar, Dividir, Comprimir, OCR, Marca d'água, Redigir, Word para PDF, Excel para PDF, Girar, Proteger, Reparar |
| **Arquivos** | 10 | CSV para JSON, JSON para XML, Mesclar CSVs, Dividir CSV, Criar ZIP, Extrair ZIP, Criador de Gráficos, YAML/JSON |

### Pipelines {#pipelines}

Encadeie ferramentas em fluxos de trabalho de múltiplas etapas e aplique-os a uma imagem ou a um lote inteiro:

1. Abra **Pipelines** na barra lateral.
2. Adicione etapas (qualquer ferramenta, quaisquer configurações).
3. Execute em um único arquivo - ou em um lote inteiro de uma vez.
4. Salve o pipeline para reutilizá-lo depois.

Os pipelines permitem 20 etapas por padrão. Defina `MAX_PIPELINE_STEPS=0` para tornar o limite ilimitado.

### Biblioteca de arquivos {#file-library}

Todo arquivo que você processa pode ser salvo na sua biblioteca de **Arquivos**. O SnapOtter rastreia todo o histórico de versões para que você possa acompanhar cada etapa de processamento, do upload original até a saída final.

Salvar é explícito: os resultados que você salva na biblioteca são mantidos até que você os exclua, enquanto os resultados que você processa e deixa sem salvar são apagados automaticamente após 72 horas (configurável via `FILE_MAX_AGE_HOURS`).

### API REST e chaves de API {#rest-api-api-keys}

Toda ferramenta é acessível via HTTP:

```bash
curl -X POST http://localhost:1349/api/v1/tools/image/resize \
  -H "Authorization: Bearer si_<your-api-key>" \
  -F "file=@photo.jpg" \
  -F 'settings={"width":800,"height":600,"fit":"cover"}'
```

Gere chaves de API em **Configurações → Chaves de API**. Veja a [referência da API REST](/pt-BR/api/rest) para todos os endpoints, ou visite [http://localhost:1349/api/docs](http://localhost:1349/api/docs) para a referência interativa.

### Múltiplos usuários e equipes {#multi-user-teams}

Habilite múltiplos usuários com controle de acesso baseado em papéis:

- **Admin**: acesso total - gerenciar usuários, equipes, configurações, todos os arquivos/pipelines/chaves de API
- **Usuário**: usar ferramentas, gerenciar os próprios arquivos/pipelines/chaves de API

Crie equipes em **Configurações → Equipes** para agrupar usuários.

Defina `AUTH_ENABLED=true` (ou `false` para uso individual/próprio sem login).
