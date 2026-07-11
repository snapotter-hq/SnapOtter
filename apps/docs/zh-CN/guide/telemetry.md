---
description: "SnapOtter 收集哪些匿名使用数据、何时发送，以及如何关闭实例范围的产品分析。"
i18n_source_hash: 5d72dedaeb23
i18n_provenance: human
i18n_output_hash: 694a13753955
---

# SnapOtter 收集哪些数据 {#what-snapotter-collects}

匿名产品分析默认开启，并由管理员为整个实例设置。可在 Settings > System > Privacy 下关闭它。

## 我们发送的事件（启用时） {#events-we-send-when-enabled}

- tool_used：工具 id、状态、耗时、类别、是否为 AI 工具，以及失败时的错误代码。
- pipeline_executed：步骤数、工具 id、批处理标志、文件数、耗时、状态。
- ai_bundle_action：功能包 id、操作、耗时。
- 前端使用：打开了哪些工具页面、添加的文件（仅数量）、工具启动、下载、保存、搜索（仅结果数量）、批处理。
- 崩溃报告：错误类型和仅含文件基本名称的源堆栈。

## 我们绝不收集的内容 {#what-we-never-collect}

- 文件名或路径
- 文件内容
- OCR 输出文本
- 图像元数据 (EXIF)
- 提取的文档文本
- 你的 IP 地址或账户身份

## 关闭它 {#turning-it-off}

管理员：Settings > System > Privacy，将 "Anonymous Product Analytics" 关闭。它会立即在整个实例范围内停止。要构建一个永远无法发送数据的镜像，请设置 `SNAPOTTER_ANALYTICS=off` 构建参数。
