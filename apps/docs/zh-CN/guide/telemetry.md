---
description: "SnapOtter 收集哪些匿名使用数据、何时发送、首次运行时的选择如何运作,以及如何关闭整个实例的产品分析。"
i18n_source_hash: 784b2a0c06eb
i18n_provenance: machine
i18n_output_hash: 1e1ac83ebb8b
i18n_hash_version: 2
---

# SnapOtter 收集的内容 {#what-snapotter-collects}

Anonymous Product Analytics 由管理员为整个实例设置。新实例会在首次运行时询问,在有人回答之前不会发送任何内容。您可以随时在 Settings > System > Privacy 中更改。

开启分析后,SnapOtter 会向 PostHog 发送运行了哪些工具和流水线、耗时多久、是否成功、错误代码和文件数量,以及实例的匿名 ID、版本、CPU 架构、操作系统、安装类型和是否有 GPU。崩溃报告会发送到 Sentry,其中的文件名、路径、电子邮件和引号内的值都已被去除。它绝不会发送您的文件、文件名或路径、文件内容、OCR 输出或提取的文本、图像元数据,也不会发送您的账户身份。它只会向 PostHog 和 Sentry 这两个地方发送数据,关闭分析后则不会向任何一方发送任何内容。

- tool_used：工具 id、状态、耗时、类别、是否为 AI 工具，失败时的错误代码，以及单独报告某一阶段的工具的步骤名称（Passport Photo 的分析步骤）。
- pipeline_executed：步骤数、工具 id、批处理标志、文件数、耗时、状态。
- ai_bundle_action：功能包 id、操作（`install_started`、`installed`、`install_failed`、`uninstalled`、`reset_environment`、`imported`）、耗时，安装失败时还包括来自固定列表的失败类别（`oom`、`network`、`disk`、`checksum`、`cpu_unsupported`、`timeout`、`other`）。安装程序输出、路径和错误消息绝不会发送。
- 前端使用：打开了哪些工具页面、添加的文件（仅数量）、工具启动、下载、保存、搜索（仅结果数量）、批处理。
- 崩溃报告：错误类型、经过脱敏的错误消息（已移除文件名、路径、电子邮件地址和带引号的值）、仅含文件基本名称的源堆栈，以及（AI 工具的）仅含文件基本名称的 Python 回溯。

## 我们绝不收集的内容 {#what-we-never-collect}

- 文件名或路径
- 文件内容
- OCR 输出文本
- 图像元数据(EXIF)
- 提取的文档文本
- 您的账户身份

与任何服务器一样,PostHog 能看到每个请求来自的 IP 地址。我们的 PostHog 项目会丢弃它而不是存储它,SnapOtter 自己的服务器事件则会发送一个占位符来代替。

## 更新通知 {#update-notices}

开启分析期间,服务器每隔几小时会使用实例的匿名 ID 和版本向 PostHog 询问最新的 SnapOtter 版本是哪个。有更新版本时,管理员会看到一条带有发行说明链接的通知。关闭通知后,它会一直隐藏到下一个版本。不会替您安装或下载任何内容,关闭分析后服务器也不会再询问。

## 关闭方法 {#turning-it-off}

管理员:在 Settings > System > Privacy 中将 "Anonymous Product Analytics" 关闭。它会立即停止,对整个实例生效。若要构建一个永远不会发送数据的镜像,请设置 `SNAPOTTER_ANALYTICS=off` 构建参数。在服务器环境中设置 `SNAPOTTER_TELEMETRY=off` 可在运行时达到同样效果,并且优先于应用中保存的任何回答。

若要提前回答首次运行的问题,请在服务器首次启动之前,将 `SNAPOTTER_ANALYTICS_DEFAULT=off`(或 `on`)添加到服务器环境中,这样就不会询问任何人。使用 Docker Compose 时,请把它放在应用服务的 `environment:` 下,因为只在 `.env` 中设置不会传到容器里。
