---
i18n_source_hash: b859c4f3b301
i18n_provenance: machine
i18n_output_hash: f53f4422a08e
i18n_hash_version: 2
---
# Configurações de poucos recursos {#low-resource-setups}

O SnapOtter roda bem em hardware pequeno: um Raspberry Pi 4 ou 5, um notebook antigo ou uma VPS de 2 GB. Esta página é o guia prático para essas máquinas: o que esperar, uma configuração para copiar e colar com limites sensatos e quais recursos pular. Os dados completos de benchmark por trás destes números estão em [Requisitos de hardware](/pt-BR/guide/deployment#hardware-requirements).

Duas restrições rígidas logo de início:

- **Somente 64 bits.** A imagem é construída para `linux/amd64` e `linux/arm64`. ARM de 32 bits (`armv7`/`armhf`) não é compatível, então os Pis de primeira geração e a família Pi Zero ficam de fora.
- **Piso de memória de 2 GB (ferramentas sem IA).** 512 MB não conseguem iniciar a stack, e 1 GB falha em lotes com vários arquivos. 2 GB com 2 núcleos é a menor configuração que executa as ferramentas sem IA com folga.

## O que roda bem em hardware pequeno {#what-runs-well}

Toda ferramenta sem IA funciona em uma máquina de 2 GB / 2 núcleos: as seções inteiras de Imagem e Arquivos, as ferramentas de PDF e as operações de vídeo e áudio com cópia de stream (aparar, silenciar, remux de contêiner). A maioria termina em menos de um segundo.

Duas cargas de trabalho são exceções:

- A **recodificação de vídeo** (conversão entre codecs) depende da CPU. Um clipe de 1080p que leva ~40 s em uma CPU de desktop rápida pode levar vários minutos em uma CPU da classe do Pi. As operações de cópia de stream continuam instantâneas.
- As **ferramentas de IA** têm pisos de memória da CPU por bundle: 2 GB de RAM do host (0,5 GB livres) para Detecção de rostos e OCR rápido integrado, 4 GiB de memória efetiva configurada para OCR preciso, 4 GB de RAM do host (2 a 3 GB livres) para Transcrição, Removedor de objetos e Colorização, Remoção de fundo, Ampliação e Aprimoramento e Restauração de fotos, e 8 GB de RAM do host (6 GB livres) para Inpainting de alta qualidade. Uma máquina de 2 GB não consegue executar Whisper, RealESRGAN, rembg ou LaMa sem ser encerrada por falta de memória (OOM), então o SnapOtter verifica a memória livre antes de despachar para o sidecar Python e recusa imediatamente execuções abaixo do piso do bundle.

Nenhuma das duas é instalada ou executada, a menos que você a use: sem nenhum bundle de IA instalado, o app fica ocioso em torno de 360 MB, e os bundles de IA só são baixados quando um administrador os ativa.

## Passo a passo para Raspberry Pi / notebook antigo {#walkthrough}

Esta é a instalação padrão com Compose de [Primeiros passos](/pt-BR/guide/getting-started), mais limites de recursos e limites conservadores. Ela presume um SO de 64 bits (em um Pi: Raspberry Pi OS 64 bits ou Ubuntu Server arm64).

```yaml
services:
  snapotter:
    image: snapotter/snapotter:latest
    ports:
      - "1349:1349"
    volumes:
      - ./snapotter-data:/data
    environment:
      - DATABASE_URL=postgres://${POSTGRES_APP_USER:-snapotter_app}:${POSTGRES_APP_PASSWORD:-snapotter_app}@db:5432/${POSTGRES_DB:-snapotter}
      - DATABASE_MIGRATION_URL=postgres://${POSTGRES_USER:-snapotter}:${POSTGRES_PASSWORD:-snapotter}@db:5432/${POSTGRES_DB:-snapotter}
      - REDIS_URL=redis://redis:6379
      # Small-box profile: see the table below for what each cap does.
      - CONCURRENT_JOBS=1
      - MAX_WORKER_THREADS=2
      - MAX_BATCH_SIZE=5
      - MAX_UPLOAD_SIZE_MB=100
      - MAX_MEGAPIXELS=50
      - MAX_VIDEO_DURATION_S=300
    deploy:
      resources:
        limits:
          cpus: "2"
          memory: 2G
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-snapotter}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-snapotter}     # Change this for non-local deployments
      - POSTGRES_DB=${POSTGRES_DB:-snapotter}
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy noeviction
    restart: unless-stopped
```

Observações para máquinas da classe do Pi:

- **Prefira um SSD USB a um cartão SD** para o volume de dados e o Postgres. Os workspaces de tarefas fazem E/S de disco de verdade, e os cartões SD são lentos e se desgastam rápido.
- **O contêiner único all-in-one também funciona aqui** (Postgres e Redis embutidos quando `DATABASE_URL`/`REDIS_URL` não estão definidos) e, em um host com pouca memória, você deve reduzir o limite do Redis embutido com `REDIS_MAXMEMORY` (consulte [Configuração](/pt-BR/guide/configuration)). O Compose oferece um controle mais fino por serviço, e é por isso que este passo a passo o utiliza.
- **Adicione swap em dispositivos de 2 GB.** Isso evita que um pico ocasional (um PDF grande, um lote que você esqueceu de limitar) termine em uma interrupção por falta de memória. O zram é a opção amigável para cartões SD.
- A imagem arm64 é somente CPU; não existe CUDA em placas ARM.

## Os ajustes disponíveis {#tuning-knobs}

Todos os limites são variáveis de ambiente, documentadas por completo em [Configuração](/pt-BR/guide/configuration). `0` significa ilimitado ou automático. As que importam em hardware pequeno:

| Variável | Sugestão para máquina pequena | O que protege |
|---|---|---|
| `CONCURRENT_JOBS` | `1` | Quantas tarefas rodam em paralelo. A detecção automática usa os núcleos da CPU menos um, o que é adequado em máquinas grandes e ansioso demais em uma máquina de 2 núcleos sob pressão de memória. |
| `MAX_WORKER_THREADS` | `2` | Pool de threads de processamento de imagens. |
| `MAX_BATCH_SIZE` | `5` | Os lotes são onde máquinas de 1-2 GB ficam sem memória primeiro. |
| `MAX_UPLOAD_SIZE_MB` | `100` | Impede que um único arquivo enorme ocupe todo o workspace. |
| `MAX_MEGAPIXELS` | `50` | Decodificar uma imagem de mais de 100 MP custa RAM, independentemente do tamanho do arquivo. |
| `MAX_VIDEO_DURATION_S` | `300` | Transcodificações longas monopolizam uma CPU pequena por minutos ou horas. |
| `PROCESSING_TIMEOUT_S` | `600` | Teto rígido para que uma tarefa descontrolada acabe liberando a máquina. |

Esses limites se aplicam ao que o servidor aceita, então defina-os para corresponder ao que você realmente usa, em vez de o menor possível. Se você nunca mexe com vídeo, um limite de `MAX_VIDEO_DURATION_S` não custa nada; se você escaneia documentos todos os dias, não limite `MAX_PDF_PAGES`.

## O que pular {#what-to-skip}

- **Bundles de IA pesados.** Ampliação, restauração de fotos e remoção de fundo pedem uma GPU ou uma CPU rápida com muitos núcleos, e cada bundle custa 4-5 GB de disco. Em uma máquina pequena, simplesmente não os instale; as ferramentas cujo bundle está ausente mostram um prompt de instalação em vez de executar.
- **Recodificação de vídeo como carga de trabalho rotineira.** Transcodificações ocasionais são aceitáveis (apenas lentas); uma fila constante de transcodificação pede núcleos de CPU, não um Pi.
- **Ferramentas não utilizadas em geral.** Um administrador pode desativar ferramentas individuais em Configurações, o que as remove da interface e interrompe o registro de suas rotas de API. Isso não economiza memória por si só, mas evita que uma instância pequena compartilhada seja usada para a única carga de trabalho que o hardware não suporta.

Se mais tarde você mover a instância para um hardware maior, remova os limites (volte-os para `0`) e o mesmo volume de dados continuará valendo.
