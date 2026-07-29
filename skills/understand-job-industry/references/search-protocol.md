# Search and retrieval protocol

## 1. Search order

Search in this order, adjusting for the industry:

1. User-provided JD, files, links, and existing artifacts
2. Official company site: about, products, technology, solutions, pricing, customers, news, careers
3. Filings and investor materials: annual reports, prospectus, earnings, exchange announcements
4. Regulators and standards: national and local authorities, standards bodies, licensing and safety rules
5. Customer, supplier, and partner announcements
6. Government or public-institution case studies
7. Research institutes, trade associations, and method-disclosed reports
8. Reputable media for facts not disclosed elsewhere
9. Aggregators or social content only as leads, never as sole evidence for critical claims

Prefer available workspace resources and connected company data before open-web search. Browse whenever facts may have changed.

## 2. Query matrix

Build queries from `[company] + [topic] + [date/geography]`.

### Company identity

- `[company] 官网 关于我们 产品 技术`
- `[company] annual report investor relations business segments`
- `[company] 招聘 [role] 官方`

### Products and commercial model

- `[company] 产品 型号 参数 价格 服务费`
- `[company] pricing subscription implementation fee`
- `[company] 客户 案例 交付 部署`

### Market and competition

- `[industry] 市场规模 统计口径 报告`
- `[industry] 主要公司 市场份额 交付量`
- `[product] competitor pricing specification`

### Policy and risk

- `site:gov.cn [industry/product] 管理办法 试点 准入`
- `site:miit.gov.cn [technology/product] 标准 安全 数据`
- `[industry] regulation license safety [geography]`

### Role mapping

- `[company] [role] 招聘 职责`
- `[business line] product manager workflow metrics`
- `[company/product] customer workflow case`

Use local-language and English queries for global companies. Use domain filters for official sources.

## 3. Research passes

Run distinct passes rather than one broad search:

1. **Entity pass**: resolve company, business line, product names, geography.
2. **Industry pass**: establish market boundary, demand, adoption stage, and value chain.
3. **Product pass**: collect representative products, functions, pricing, scale, and capability limits.
4. **Commercial pass**: identify payer, charging model, delivery model, TCO or unit economics.
5. **Policy pass**: identify access, safety, data, certification, and local operating constraints.
6. **Role pass**: map JD language to users, workflows, systems, metrics, and interfaces.
7. **Gap pass**: search only unresolved high-impact questions and conflicting claims.

## 4. Evidence minimums

- **Quick**: at least 3 useful direct sources across 2 source types when current facts are involved.
- **Standard**: normally 8 or more useful sources across official company, government/regulator, customer/partner, and independent research/media categories when available.
- **Deep**: normally 12 or more useful sources, including primary evidence for each major section and at least 2 sources for a contested critical claim.

These are coverage checks, not quotas. A precise answer may require fewer sources; an opaque industry may require more.

## 5. Search stopping conditions

Stop broad search when:

- The primary industry classification is supported.
- Every requested section has at least one adequate source or is marked undisclosed.
- Product comparisons use consistent scope.
- Volatile figures have date and source.
- Major conflicts are resolved or clearly reported.
- Additional results repeat existing facts without improving authority or scope.

Continue targeted search when a missing fact would change the interview conclusion, comparison, economics, policy interpretation, or role mapping.

## 6. Retrieval record

Keep a compact source map during work:

```text
source_id | title | URL | source_type | published/as_of | supports | limitation
```

Do not expose raw internal reasoning. Expose assumptions, comparison choices, evidence, unresolved gaps, and a concise decision log so the result is auditable.
