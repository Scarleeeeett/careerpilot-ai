# Terminology explanation standard

## Required format

For every important term, answer:

| Part | Question |
|---|---|
| Plain definition | What is it without unexplained jargon? |
| Mechanism | What happens from input to output? |
| Industry use | Where does it appear in this workflow? |
| Product decision | What must a PM choose or trade off? |
| Validation | Which metric or test shows it works? |
| Failure mode | How can it fail or be misunderstood? |
| Example | What is a company- or role-relevant example? |

## Rules

- Expand abbreviations at first mention: `TCO（Total Cost of Ownership，总拥有成本）`.
- Start with a one-sentence answer.
- Explain variables before formulas.
- Separate terms that are often confused.
- Explain terms in the current industry, not as dictionary entries.
- Avoid circular definitions.

## Common term families

Load only those relevant to the role:

- AI: Token, Embedding, Attention, context window, sampling, multimodal, Prompt, Prompt chain, RAG, Tool use, Agent loop, Memory, MCP
- Evaluation: Trace, eval set, rubric, LLM-as-a-judge, manual calibration, regression test, A/B test, badcase
- Governance: Human-in-the-loop, AI PRD, trust design, feedback loop, prompt injection, least privilege, approval, sandbox, audit, fallback
- Commercial: TCO, unit economics, Build vs Buy, ToB delivery, ToC GTM, package tiers, supplier risk, SLA
- Autonomous systems: L2/L3/L4, ODD, BEV, OCC, drive-by-wire, remote assistance, takeover, functional safety

## Example

```text
TCO（总拥有成本）是资产从购买到退出使用的全部成本。

在无人配送中，它通常包括车辆、软件、部署、能源、保险、维修、
远程协助和停运损失，再减去残值。产品经理需要决定测算周期、
任务量和成本边界；验证时看单位任务成本和回收期。常见误区是
把车辆售价或“公开可见成本”直接当作 TCO。
```
