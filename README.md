# Token Speed

Token Speed 是 OpenCode 插件，在会话进行时显示 LLM 输出的实时 token 速度和首 token 延迟（TTFT）。

## 界面

- **TUI**：prompt footer 状态区显示 `TTFT 1.2s ↯ 42 tok/s`。
- **Desktop**：会话标题栏最左侧的按钮显示同样内容，悬停查看说明。

指标在 agent 处理该会话期间显示，会话回到 idle 时隐藏。流式增量到达时显示实时估算速度；没有增量时（模型排队、工具执行、重试等待）继续显示上一轮 turn 的平均速度，直到新的增量替换它。只有第一轮 turn 完成之前没有可用的平均值，显示 `↯ - tok/s`（Desktop 为 `- tok/s`）。

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

- `session.execution.started` 与 `session.execution.succeeded` / `failed` / `interrupted`：一次 execution 对应 agent 的一轮处理。开始后在两种界面上显示指示器，结束时隐藏并清空上一步的速度和 TTFT，同时用这一轮的精确 token 数和耗时算出平均速度留存。
- `session.text.delta`、`session.reasoning.delta`、`session.tool.input.delta`：流式期间累计字符，按约 4 字符 / token 在 2 秒滑动窗口上估算速度，EMA 平滑；超过 1.5 秒没有增量时实时速度归零，界面回退到上一轮的平均速度。
- `session.step.started` 的 `data.started` 是请求实际开始的时刻，到首个 token 的时间差为 TTFT；优先用 `session.step.first-token` 标记首个 token，没有该事件时用首个内容增量。`session.step.ended` 结束当前步骤的显示并累计该步的 token 数。
- 多会话并行时按 `sessionID` 分别计算，界面只显示当前会话。

## 限制

- 流式期间 provider 不上报 token 数，实时速度为估算值（字符数 ÷ 4）；上一轮的平均速度使用精确 token 数，但包含工具执行和等待时间。
- 工具执行、重试等待等阶段没有流式输出，显示上一轮的平均速度。
- Desktop 2.2.5 没有 `session.step.first-token` 事件，TTFT 取首个内容增量，包含首个 token 的传输时间。
- Desktop GUI API 为 experimental，随 OpenCode 版本可能变化。

## 验证

```sh
pnpm install
pnpm typecheck
pnpm build     # 构建 Desktop 端 dist/gui-experimental.cjs
```

TUI 端直接加载 `src/tui.tsx`。Desktop 2.2.5 与 CLI 2.3.0 已适配；升级 OpenCode 时同步调整 `@opencode/plugin` 依赖版本。
