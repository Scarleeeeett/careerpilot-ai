# Product comparison

## Sequence

1. Define the target customer and task.
2. Select products solving the same task, or label different segments.
3. Normalize period, geography, charging model, units, and scope.
4. Compare the full solution and delivery capability, not feature count alone.
5. Show undisclosed and non-comparable data explicitly.

## Standard dimensions

Choose relevant dimensions:

- Product form and target scenario
- Core functions and capability boundary
- Hardware or model specification
- Integration and deployment requirements
- Price, subscription, implementation, and lifecycle cost
- Output, throughput, latency, reliability, or task success
- Customer and case evidence
- Orders, shipments, active deployments, revenue, or capacity, kept separate
- Geographic and policy coverage
- Operations, support, SLA, and update model
- Data, security, and ecosystem dependence

## Pricing normalization

Separate hardware or license price, recurring software, implementation, consumption charges, operations, discounts, and contract minimums. If only part is public, call the result `公开可见成本`, not TCO.

## Scale normalization

Never rank orders, annual shipments, cumulative deliveries, active units, production capacity, and procurement plans together. Add period and company/model scope next to every value.

### Software and AI products

Do not force a physical-production metric onto software. When the user asks for “产量” for an AI, SaaS, platform, or developer product, translate the request into the most relevant public scale evidence:

- Registered users, monthly active users, paid seats, enterprise customers
- Completed tasks, agent runs, code suggestions, API calls, tokens, or workload throughput
- Revenue or annual recurring revenue when officially disclosed
- Marketplace supply such as Skills, plugins, tools, or developers, kept separate from user adoption
- GitHub stars, downloads, and community contributions only as ecosystem signals, not active usage

Label the metric, period, geography, product scope, and source type. Treat company-published adoption figures as company claims. Use `未披露` when competitors do not publish the same metric; do not rank a disclosed figure against missing values.

For Agent and Coding Agent products, compare the full task chain rather than model quality alone:

```text
Context acquisition → planning → tool execution → environment feedback → validation → user control → security/governance → successful-task cost
```

## Conclusion

Do not declare a universal winner. State best fit by scenario, main trade-off, evidence strength, and information still required.
