# HL Converge

[![CI](https://github.com/halil-pan/hl-converge/actions/workflows/ci.yml/badge.svg)](https://github.com/halil-pan/hl-converge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

把任意数量的功能 worktree 汇总到一个目录验证，通过后合入指定本地分支，再清理符合条件的来源目录。CLI 与两份 Agent Skills 共用实现，记录独立于聊天。

当前版本：**0.1.0**。需要 Node.js 20.11+、Git 2.35+。无运行时 npm 依赖。源码使用 TypeScript；Skill 自带已构建的运行文件。CLI 尚未发布到 npm，请使用以下 GitHub 源码或本地 tarball 安装。

## 只安装 Skill

不需要全局安装 CLI。可通过 [Skills CLI](https://github.com/vercel-labs/skills) 从本仓库安装两份 Skill，例如安装到 Codex：

```sh
npx --yes skills add halil-pan/hl-converge \
  --skill hl-converge-ready hl-converge-integrate \
  --agent codex --global --yes
```

Claude Code 将 `--agent codex` 换成 `--agent claude-code`；OpenCode 换成 `--agent opencode`。Oh My Pi 建议使用下一节的自带安装器，它支持 OMP 原生目录与 profile。

仓库内已提交 Skill 所需的运行文件，直接安装后无需在 Skill 目录执行构建。目录名称为 `hl-converge-ready` 和 `hl-converge-integrate`。可在会话中说“使用 hl-converge-ready 收尾当前功能”或“使用 hl-converge-integrate 汇总已就绪任务”。

以下两种安装方式选择一种即可。外部安装器创建的目录或链接不会被本工具的安装器强行覆盖。

## 安装 CLI 和 Skill

需要独立 CLI，或希望用同一个安装器支持四个平台时，从 GitHub 克隆并构建：

```sh
git clone https://github.com/halil-pan/hl-converge.git
cd hl-converge
npm ci
npm run build
npm install -g .
hl-converge --help
```

按需安装两份 Skill：

```sh
hl-converge install --agent codex
hl-converge install --agent claude-code
hl-converge install --agent opencode
hl-converge install --agent oh-my-pi
# 或四端一起安装
hl-converge install --agent all
```

| Agent | 默认用户级 Skill 目录 |
| --- | --- |
| Claude Code | `~/.claude/skills`，支持 `CLAUDE_CONFIG_DIR` |
| OpenCode | `~/.config/opencode/skills`，支持 `XDG_CONFIG_HOME` |
| Oh My Pi | `~/.omp/agent/skills`；支持命名 profile 和配置目录覆盖 |
| Codex | `~/.agents/skills` |

单个平台可用 `--skills-dir PATH` 指定目录。`--home PATH` 将默认目录放到指定用户目录，适合隔离安装验收。安装保留同名外部 Skill；替换本工具旧版本需要 `--force`。每份 Skill 自带运行文件，移走源码后仍可调用，不依赖全局 CLI。宿主未刷新列表时，重新加载或重启会话。

安装器不修改 AGENTS.md、CLAUDE.md、宿主权限或业务配置。四端安装布局和独立调用有自动测试；没有操纵四个宿主客户端完成端到端验收。

## 第一次配置项目

在业务项目任意 worktree 内执行。配置保存在仓库共享 Git 管理目录，不进入业务提交。

```sh
hl-converge config set default-target release/v0.2.0
hl-converge config set checks /absolute/path/to/checks.json
hl-converge config show
```

格式见 `examples/checks.json`，请换成项目真实检查。`command` 是参数数组，不做 shell 插值。`cwd` 相对于统一验证目录，不允许越界链接。可设置 `manualChecks: ["真机验收"]`。没有检查项时不会判定通过。

## 功能会话：提交后登记

Agent 先审查并提交本任务文件。CLI 不自动 add 或 commit 未提交功能文件。

```sh
cd /path/to/task-worktree
hl-converge ready --name report-page --label "报告页面" --owner git --released
```

`--owner git` 确认普通 Git worktree；`--released` 声明任务和服务已经停止写入，允许日后尝试清理。管理方式不确定时省略 owner；宿主托管目录可标记 `codex`、`claude-code`、`opencode`、`oh-my-pi`，核心会保留它们。

没有任务分支时，可在干净状态使用 `ready --branch feature/report-page ...` 创建。已有分支直接沿用。同一任务 ID 只能在同一目录重复登记。

## 主目录会话：统一验证和合入

```sh
cd /path/to/main-directory
hl-converge status
hl-converge plan --source report-page --source login-fix
# 保存返回的运行 ID，后续用它替换 RUN_ID
hl-converge integrate RUN_ID
hl-converge verify RUN_ID
hl-converge finish RUN_ID
hl-converge cleanup RUN_ID --dry-run
hl-converge cleanup RUN_ID --apply
```

`plan` 不传 `--target` 时采用项目默认值；`--target other-branch` 只覆盖这一轮。后续命令读取运行记录中的目标，不根据当前分支猜测。修改默认值不会改变已有运行。要换已有任务的目标，应新建计划。

用 `plan --workspace PATH` 指定同一仓库的其他验证目录。来源使用已登记的完整 SHA，可选择一个或多个，重复来源会拒绝。来源顺序就是合并顺序；有依赖时先列基础功能。

验证目录使用 `hl-converge/integrate/RUN_ID` 分支，保留合并记录。通过后，`finish` 将记录的本地目标快进到已验证版本，不推送或部署。目标若被其他 worktree 检出，请选择它所在目录作为验证目录。

## 失败与恢复

| 状况 | 继续方式 |
| --- | --- |
| 冲突或合并钩子阻止提交 | 解决并提交后 `continue RUN_ID`；或 `git merge --abort` 后重试 |
| 功能或集成问题 | 在验证分支修复并提交，再 `verify RUN_ID` |
| 目标分支新增提交 | `refresh RUN_ID`，完成合并后重新验证，再 `finish` |
| 必需人工验收未完成 | 实际确认后 `verify RUN_ID --confirm-manual "真机验收"` |
| 重跑未变化的成功检查 | `verify RUN_ID --rerun` |
| 进程中断 | `status RUN_ID` 核对记录后重试对应阶段，已完成合并不重复执行 |
| 主目录有无关改动 | 保留并处理，工具不自动 stash、reset 或 clean |

检查结果绑定完整 SHA 和检查配置。检查修改文件、分支或提交会使当前验证失败。提交修复后重新验证。相同版本与配置的成功检查可复用。重跑自动检查不会清除相同版本的人工确认；代码或检查配置变化后需要重新确认。日志位于共享状态目录的 `logs/RUN_ID`。

仓库级锁保护本工具的操作，同机已死亡进程的锁可回收。锁不限制外部 Git 命令，因此各阶段还会核对分支、提交及工作区，拒绝不一致状态。

## 清理范围

默认只预览，`--apply` 才删除。来源必须已经合入、明确释放、没有未提交改动、仍是原提交，且不是主目录或验证目录。来源有新提交时保留。

忽略文件也阻止删除，例如 `.env`、本地数据或缓存。先保留所需内容，明确允许丢弃后才加 `--discard-ignored`。工具不给 Git 添加 force。`--delete-branches` 可删除已清理来源的任务分支，默认保留分支。验证分支与记录始终保留。

宿主管理目录通过宿主原生方式清理。第一版不检测所有客户端活动，也不把文件删除当作聊天归档。原生工具清理后，可再运行 CLI 核对缺失目录与已合入的来源。

## 输出与存储

`--json` 成功输出 `{ "ok": true, "data": ... }`，失败输出 `{ "ok": false, "error": { "code", "message", "details" } }`，失败退出码为 2。`--repo PATH` 可从其他目录指定仓库。

记录位于 `git rev-parse --git-common-dir` 返回目录下的 `hl-converge/`。包含默认配置、就绪来源、运行记录、日志和操作锁。固定提交由 `refs/hl-converge/` 保留，避免功能分支变化导致已选提交失去引用。第一版不自动回收审计记录与引用。

## 开发与验证

```sh
npm ci
npm test
npm pack
```

测试使用隔离的真实 Git 仓库与临时用户目录，不接触业务项目或个人配置。可执行用例在 `test/`。Windows 原生客户端未实测；在 Windows 上请用 Node 脚本或可执行文件替代 npm/cmd 批处理包装器作为检查命令。

CI 在 Linux 的 Node.js 22、24 上运行测试，并核对仓库内的 Skill 运行文件与源码构建结果一致。四个真实客户端的交互验收与文件安装测试分别记录，不把后者当成前者。

## 许可与作者

[MIT License](LICENSE) · [halil-pan](https://github.com/halil-pan)

欢迎提交问题、修复和实际使用反馈。
