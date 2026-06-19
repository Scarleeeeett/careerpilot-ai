# CareerPilot AI 求职作战台

这是一个面向海投场景的 AI 求职管理助手 demo 原型。

## 当前入口

- `index.html`：前端页面。
- `server.js`：本地后端，负责托管页面和代理真实 LLM API。

## MVP 闭环

1. 上传个人资料 / 简历
2. 新增岗位并粘贴 JD
3. AI 拆解 JD
4. 生成岗位准备卡
5. 面试前查看 Interview Brief
6. 面试后记录复盘

## 当前状态

当前版本已经支持：

- 岗位增删改查
- 本地保存
- 资料库
- 本地 Workflow 分析
- 可选真实 OpenAI API 分析

## 启动方式

在当前目录运行：

```powershell
npm start
```

然后打开：

```text
http://localhost:8787
```

## 启用真实 API

设置环境变量后再启动：

```powershell
$env:OPENAI_API_KEY="你的 API Key"
npm start
```

可选指定模型：

```powershell
$env:OPENAI_MODEL="gpt-4o-mini"
npm start
```

如果没有设置 API Key，前端会自动回退到本地 Workflow 分析。
