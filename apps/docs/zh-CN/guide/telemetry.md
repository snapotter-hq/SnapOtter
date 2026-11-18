---
description: "SnapOtter 收集哪些匿名使用数据、何时发送，以及如何关闭实例范围的产品分析。"
i18n_source_hash: 1a68d9371570
i18n_provenance: machine
i18n_output_hash: c479d51d3493
i18n_hash_version: 2
---

# SnapOtter 收集哪些数据 {#what-snapotter-collects}

匿名产品分析默认开启，并由管理员为整个实例设置。可在 Settings > System > Privacy 下关闭它。

## 我们发送的事件（启用时） {#events-we-send-when-enabled}

- tool_used：工具 id、状态、耗时、类别、是否为 AI 工具，以及失败时的错误代码。
- pipeline_executed：步骤数、工具 id、批处理标志、文件数、耗时、状态。
- ai_bundle_action：功能包 id、操作、耗时。
- 前端使用：打开了哪些工具页面、添加的文件（仅数量）、工具启动、下载、保存、搜索（仅结果数量）、批处理。
- 崩溃报告：错误类型、经过脱敏的错误消息（已移除文件名、路径、电子邮件地址和带引号的值）、仅含文件基本名称的源堆栈，以及（AI 工具的）仅含文件基本名称的 Python 回溯。

## 我们绝不收集的内容 {#what-we-never-collect}

- 文件名或路径
- 文件内容
- OCR 输出文本
- 图像元数据 (EXIF)
- 提取的文档文本
- 你的账户身份

与任何服务器一样，PostHog 能看到每个请求的来源 IP 地址。我们的 PostHog 项目会丢弃该地址而不存储，SnapOtter 自身的服务器事件则会用占位值代替它发送。

## 更新提示 {#update-notices}

分析功能开启期间，服务器每隔几小时会用实例的匿名 ID 和当前版本向 PostHog 查询 SnapOtter 的最新版本。有更新的版本时，管理员会看到一条附带发布说明链接的提示。关闭提示后，在下一个版本发布前不会再次出现。系统不会替你安装或下载任何内容；分析功能关闭时，服务器不会发出查询。

## 关闭它 {#turning-it-off}

管理员：Settings > System > Privacy，将 "Anonymous Product Analytics" 关闭。它会立即在整个实例范围内停止。要构建一个永远无法发送数据的镜像，请设置 `SNAPOTTER_ANALYTICS=off` 构建参数。

要让新实例从一开始就关闭分析，请在服务器首次启动前将 `SNAPOTTER_ANALYTICS_DEFAULT=off` 添加到服务器的环境变量中。使用 Docker Compose 时，请把它放在应用服务的 `environment:` 下，因为只在 `.env` 中设置并不会传到容器里。
