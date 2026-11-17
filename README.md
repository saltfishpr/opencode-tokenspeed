# Token Speed

Token Speed 是 OpenCode 插件，在会话进行时显示 LLM 输出的实时 token 速度和首 token 延迟（TTFT）。

## 界面

- **TUI**：prompt footer 状态区显示 `TTFT 1.2s ↯ 42 tok/s`。
- **Desktop**：会话标题栏最左侧的按钮显示同样内容，悬停查看说明。

指标在 agent 处理该会话期间显示，会话回到 idle 时隐藏。首 token 之前、工具执行和重试等待等没有流式输出的阶段保留占位：TUI 显示 `↯ - tok/s`，Desktop 显示 `- tok/s`。

## 安装

将本目录的绝对路径加入 `~/.config/opencode/opencode.json` 或 `opencode.jsonc` 的 `plugins` 数组：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-tokenspeed"]
}
```

保存后自动加载，无需重启。Desktop 端可在 Settings → Extensions → Plugins 中停用插件 GUI。

## 工作方式

插件订阅 server 的公开事件流，客户端本地计算：

- `session.execution.started` 与 `session.execution.succeeded` / `failed` / `interrupted`：一次 execution 对应 agent 的一轮处理。开始后在两种界面上显示指示器，结束（含用户中断）时隐藏并清空上一步的速度和 TTFT。
- `session.text.delta`、`session.reasoning.delta`、`session.tool.input.delta`：流式期间累计字符，按约 4 字符 / token 在 2 秒滑动窗口上估算速度，EMA 平滑；超过 1.5 秒没有增量时速度归零，指示器只保留占位。
- `session.step.started` 到首个增量的事件差为 TTFT；`session.step.ended` 结束当前步骤的显示。
- 多会话并行时按 `sessionID` 分别计算，界面只显示当前会话。

## 限制

- 流式期间 provider 不上报 token 数，实时速度为估算值（字符数 ÷ 4）；每步结束后不回填精确值。
- 工具执行、重试等待等阶段没有流式输出，速度显示为 `-`，指示器保留到会话 idle。
- Desktop GUI API 为 experimental，随 OpenCode 版本可能变化。

## 验证

```sh
pnpm install
pnpm typecheck
pnpm build     # 构建 Desktop 端 dist/gui-experimental.cjs
```

TUI 端直接加载 `src/tui.tsx`。Desktop 2.2.5 与 CLI 2.3.0 已适配；升级 OpenCode 时同步调整 `@opencode/plugin` 依赖版本。
