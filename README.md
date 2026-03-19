# LocalSweep

LocalSweep 是一个面向本地 AI / 开发环境的桌面工具，目标是把监听端口、运行进程和缓存占用尽可能看清楚，再帮助用户安全地处理它们。

当前产品方向分为两个板块：
- 端口 / 进程清理
- 缓存清理

其中，AI 分析属于端口 / 进程清理板块内的辅助能力，用于解释候选项、排序建议和辅助勾选，不直接执行高风险操作。

## 当前状态

当前仓库已经完成第一版可运行基础实现：
- 桌面端：`Tauri v2 + React + TypeScript`
- CLI：共享 Rust 核心的只读命令入口
- 核心需求与策略文档见：
  - [docs/PRD.md](docs/PRD.md)

## 技术路线

- 桌面框架：Tauri v2
- 前端：React
- 后端：Rust
- Node.js 工具链：pnpm
- UI：shadcn/ui + OpenAI 风格的克制工作台

## 运行方式

- 安装依赖：`pnpm install`
- 前端构建：`pnpm build`
- 桌面开发：`pnpm desktop:dev`
- CLI 扫描：`pnpm cli scan`
- CLI 缓存扫描：`pnpm cli cache scan`
- CLI 查看设置：`pnpm cli settings show`
- CLI 当前默认只读；`analyze` 依赖已配置的 OpenAI-compatible 接口

## 最小验证

- `pnpm build`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `pnpm cli scan`
- `pnpm cli cache scan`
- `pnpm cli settings show`

## 开源策略

本项目采用“高星项目经验借鉴 + 选择性 fork + 本地缝合实现”的方式推进：
- `neohtop`：参考桌面应用结构、信息组织和暗色主题系统监控 UI 设计
- `bottom`：参考进程列表、排序、搜索和 kill 交互
- `rustnet`：参考端口与进程关联的采集思路
- `osx-cleaner`：参考缓存扫描与清理边界

原则：
- 不粗暴整仓拼接多个项目
- 优先借鉴架构、数据模型和交互经验
- 只有在技术栈和边界高度匹配时才考虑轻量 fork

## 致谢

感谢以下开源项目为本项目提供灵感、实现思路或潜在的能力参考：
- [Abdenasser/neohtop](https://github.com/Abdenasser/neohtop)
- [ClementTsang/bottom](https://github.com/ClementTsang/bottom)
- [domcyrus/rustnet](https://github.com/domcyrus/rustnet)
- [kodelint/osx-cleaner](https://github.com/kodelint/osx-cleaner)

后续如果本项目直接复制、改写或 fork 其中任一项目的代码，将在仓库中补充对应的许可证文本、版权归属和更明确的来源说明。
