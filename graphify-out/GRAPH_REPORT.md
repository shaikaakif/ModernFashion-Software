# Graph Report - ModernFashion-Software  (2026-11-18)

## Corpus Check
- 94 files · ~110,020 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 1097 nodes · 3383 edges · 73 communities (69 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 170 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d3bf56b2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- createSaleService
- api
- createPrintService
- 4. Scope and modules
- AI_ENGINEERING_CONSTITUTION.md
- Modern Fashion --- Brand Kit & POS Interface Design System
- writeAudit
- helpers.js
- build
- 28. DEFINITION OF DONE AND QUALITY SCORING
- master-ui-skill.md
- LoadingPanel
- MASTER_AI_ENGINEERING_SOP.md
- createExportService
- devDependencies
- 24. INSTALLATION AND ACTIVATION RECIPES
- 12. COMPONENT QUALITY STANDARDS
- 2. THE DESIGN CONSTITUTION
- 5. END-TO-END UI WORKFLOW
- printService.js
- validation.js
- requireInt
- 16. ACCESSIBILITY AND INCLUSIVE INTERACTION
- fail
- scripts
- cart.js
- createUpdateService
- 14. MICRO-INTERACTIONS AND MOTION DESIGN
- 23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE
- 25. TESTING, SCREENSHOT REVIEW, AND VISUAL REFINEMENT
- Modern Fashion POS
- 11. LAYOUT, GRID, SPACING, AND COMPOSITION
- 21. FRONTEND ENGINEERING RULES
- 22. REPOSITORY AND SKILL KNOWLEDGE EXTRACTION
- 10. TYPOGRAPHY AND TYPE HIERARCHY
- 26. SECURITY, LICENSES, AND SAFE TOOL USAGE
- 29. REUSABLE PROMPTS AND REPORT TEMPLATES
- 8. DESIGN SYSTEMS, TOKENS, AND CONSISTENCY
- 9. COLOR SYSTEMS AND CONTRAST
- 15. RESPONSIVE AND ADAPTIVE DESIGN
- 17. CONTENT DESIGN, ICONS, IMAGERY, AND ASSETS
- 1. MISSION AND ACTIVATION
- 20. PERFORMANCE AND TECHNICAL QUALITY
- 4. TASK INTAKE AND PROJECT RECONNAISSANCE
- Releases and auto-update
- compilerOptions
- 13. INTERACTION STATES AND BEHAVIOR CONTRACTS
- 19. AI-NATIVE INTERFACE PATTERNS
- 6. DESIGN DIRECTION AND VISUAL STYLE TAXONOMY
- devDependencies
- AGENTS.md
- Modern Fashion POS — Project Memory
- Hardware Validation Checklist
- RootApp.jsx
- AppShell.jsx
- importService.js
- createReportService
- main.js
- database.js
- createBackupService
- PosPage.jsx
- @vitejs/plugin-react
- prettier@3.1.0
- requireDateKey
- useSession
- AuditPage.jsx
- money.js
- createIpcHandlers
- ImportPage
- barcode.js
- createAuditService
- eslint-plugin-react@^7.33.2

## God Nodes (most connected - your core abstractions)
1. `fail()` - 119 edges
2. `api()` - 113 edges
3. `errorMessage()` - 103 edges
4. `nowIso()` - 83 edges
5. `writeAudit()` - 76 edges
6. `requireInt()` - 68 edges
7. `getSetting()` - 56 edges
8. `requireText()` - 44 edges
9. `useSession()` - 43 edges
10. `createPrintService()` - 42 edges

## Surprising Connections (you probably didn't know these)
- `Data and money` --references--> `transaction()`  [INFERRED]
  PROJECT_MEMORY.md → electron/core/database.js
- `23.7 How to evaluate a resource before installing it` --references--> `fail()`  [INFERRED]
  Docs/master-ui-skill.md → electron/core/errors.js
- `nextBarcode()` --calls--> `formatBarcode()`  [EXTRACTED]
  electron/services/catalogService.js → shared/barcode.js
- `nextBarcode()` --calls--> `normalizeBarcodeConfig()`  [EXTRACTED]
  electron/services/catalogService.js → shared/barcode.js
- `createTestApp()` --calls--> `createCatalogService()`  [EXTRACTED]
  tests/helpers.js → electron/services/catalogService.js

## Import Cycles
- None detected.

## Communities (73 total, 4 thin omitted)

### Community 0 - "createSaleService"
Cohesion: 0.14
Nodes (31): assertStockAvailable(), getStock(), recordStockMovement(), allocateSequence(), formatInvoiceNumber(), formatPurchaseReference(), peekSequence(), businessDate() (+23 more)

### Community 1 - "api"
Cohesion: 0.07
Nodes (69): api(), errorMessage(), MoneyInput(), percentFromBp(), openDetail(), submit(), ExpensesPage(), exportExpenses() (+61 more)

### Community 2 - "createPrintService"
Cohesion: 0.10
Nodes (57): code128Svg(), encodeCode128B(), escapeHtml(), PATTERNS, addressLines(), amountInWords(), belowHundred(), belowThousand() (+49 more)

### Community 3 - "4. Scope and modules"
Cohesion: 0.05
Nodes (36): 10. Engineering Constitution and Master SOP alignment, 11. Acceptance checklist, 12. First response expected from OpenCode, 1. Mission and outcome, 2. Client identity and details, 3. Evidence from the client's sample receipt, 4.10 WhatsApp invoice sharing, 4.11 Thermal receipt printing (+28 more)

### Community 4 - "AI_ENGINEERING_CONSTITUTION.md"
Cohesion: 0.08
Nodes (23): 10. FEATURE IMPLEMENTATION TEMPLATE, 11. AI AGENT PROMPT TEMPLATE, 12. QUALITY ASSURANCE, 13. PRODUCTIVITY PRINCIPLES, 14. DOCUMENTATION SYSTEM, 15. FINAL COMMANDMENTS, 1. PROJECT FOUNDATION, 2. AI AGENT CONSTITUTION (+15 more)

### Community 5 - "Modern Fashion --- Brand Kit & POS Interface Design System"
Cohesion: 0.09
Nodes (21): 10. Responsive behaviour, 11. Design QA, 12. Brand asset handling, 13. Design definition of done, 1. Brand hierarchy, 2. Brand character, 3. Colour system, 4. Typography (+13 more)

### Community 6 - "writeAudit"
Cohesion: 0.19
Nodes (34): writeAudit(), readLogoDataUrl(), businessDisplayName(), clone(), getAllSettings(), getSetting(), publicBusiness(), saveSetting() (+26 more)

### Community 7 - "helpers.js"
Cohesion: 0.25
Nodes (12): PNG_1X1, addStaff(), completeSale(), createProduct(), createTestApp(), login(), logout(), saleCount() (+4 more)

### Community 8 - "build"
Cohesion: 0.09
Nodes (23): build, appId, asar, copyright, directories, files, nsis, productName (+15 more)

### Community 9 - "28. DEFINITION OF DONE AND QUALITY SCORING"
Cohesion: 0.50
Nodes (4): 28.1 Definition of done, 28.2 Visual quality scorecard, 28.3 Acceptance mindset, 28. DEFINITION OF DONE AND QUALITY SCORING

### Community 10 - "master-ui-skill.md"
Cohesion: 0.13
Nodes (14): 18.1 Select the representation from the question, 18.2 Chart rules, 18.3 Dashboards, 18. DATA VISUALIZATION AND DENSE INTERFACES, 27.1 Example project resource registry layout, 27. PROJECT DELIVERABLES AND DOCUMENTATION, 30. REFERENCES AND VERSION-CHECK NOTES, 3. PRIORITY HIERARCHY AND CONFLICT RESOLUTION (+6 more)

### Community 11 - "LoadingPanel"
Cohesion: 0.23
Nodes (31): @ant-design/icons, antd, dayjs, react, react-router-dom, EmptyPanel(), ErrorPanel(), Kpi() (+23 more)

### Community 12 - "MASTER_AI_ENGINEERING_SOP.md"
Cohesion: 0.14
Nodes (13): 4.1 Native Android Playbook (Kotlin + Jetpack Compose), 4.2 Modern Web & Full-Stack Playbook (Next.js / React / TypeScript), 4.3 Database & Cloud Playbook (PostgreSQL / Supabase / SQLite), 4.4 Payments & Monetization Playbook, 4. DOMAIN-SPECIFIC PLAYBOOKS, 5. ANTI-PATTERN BLACKLIST (BANNED PRACTICES), 6. THE FOUNDER'S AI SESSION STARTER PROMPT, Phase 0: Project Ingestion & Codebase Mapping (+5 more)

### Community 13 - "createExportService"
Cohesion: 0.35
Nodes (13): createExportService(), exportAccountingPack(), exportCatalogue(), exportCustomers(), exportExpenses(), exportGstMonthly(), exportInventory(), exportPurchases() (+5 more)

### Community 14 - "devDependencies"
Cohesion: 0.15
Nodes (14): author, dependencies, electron-updater@^6.8.11, xlsx@^0.18.5, description, license, main, name (+6 more)

### Community 15 - "24. INSTALLATION AND ACTIVATION RECIPES"
Cohesion: 0.17
Nodes (12): 24.1 Install this master skill into an OpenCode project, 24.2 Make the skill available in every project, 24.3 Invoke it, 24.4 Install UI UX Pro Max for OpenCode, 24.5 Install the Anthropic Frontend Design skill, 24.6 Install Vercel's web-design-guidelines skill, 24.7 Install Impeccable for design critique/refinement, 24.8 Start with a small, non-conflicting stack (+4 more)

### Community 16 - "12. COMPONENT QUALITY STANDARDS"
Cohesion: 0.18
Nodes (11): 12.10 Skeletons and loading, 12.1 Buttons, 12.2 Links, 12.3 Cards, 12.4 Forms, 12.5 Navigation, 12.6 Dialogs and popovers, 12.7 Tabs, accordions, and disclosure (+3 more)

### Community 17 - "2. THE DESIGN CONSTITUTION"
Cohesion: 0.18
Nodes (11): 2. THE DESIGN CONSTITUTION, Article I — Product truth before aesthetics, Article II — Distinctiveness without visual chaos, Article III — Hierarchy and readability, Article IV — System before one-off styling, Article IX — Speed and resilience are visual quality, Article V — Function is part of the design, Article VI — Accessibility is a design input (+3 more)

### Community 18 - "5. END-TO-END UI WORKFLOW"
Cohesion: 0.18
Nodes (11): 5. END-TO-END UI WORKFLOW, Phase 10 — Report, Phase 1 — Understand, Phase 2 — Research, Phase 3 — Choose visual direction, Phase 4 — Define design rules, Phase 5 — Build structure before decoration, Phase 6 — Populate realistic content (+3 more)

### Community 19 - "printService.js"
Cohesion: 0.19
Nodes (4): MIME, loadHtml(), waitForLoad(), child

### Community 20 - "validation.js"
Cohesion: 0.11
Nodes (28): AppError, assert(), KOLKATA_DATE, normalizePhone(), todayKey(), invoke(), closeShift(), createAuthService() (+20 more)

### Community 21 - "requireInt"
Cohesion: 0.16
Nodes (28): transaction(), requireBasisPoints(), requireInt(), buildSku(), createCatalogService(), addVariant(), archiveProduct(), assignBarcode() (+20 more)

### Community 22 - "16. ACCESSIBILITY AND INCLUSIVE INTERACTION"
Cohesion: 0.22
Nodes (9): 16.1 Semantic structure, 16.2 Keyboard and focus, 16.3 Contrast and color, 16.4 Pointer and touch targets, 16.5 Motion and vestibular comfort, 16.6 Forms, errors, and status announcements, 16.7 Reflow and zoom, 16.8 Accessibility testing policy (+1 more)

### Community 23 - "fail"
Cohesion: 0.17
Nodes (27): fail(), nowIso(), optionalPhone(), requireText(), createBrand(), createCategory(), createCustomerService(), create() (+19 more)

### Community 24 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, build, dev, dist, dist:dir, dist:publish, lint, start (+2 more)

### Community 25 - "cart.js"
Cohesion: 0.28
Nodes (3): addToCart(), createLineKey(), makeCartLine()

### Community 26 - "createUpdateService"
Cohesion: 0.35
Nodes (11): createUpdateService(), check(), download(), emit(), getStatus(), init(), install(), set() (+3 more)

### Community 27 - "14. MICRO-INTERACTIONS AND MOTION DESIGN"
Cohesion: 0.25
Nodes (8): 14.1 Motion decision checklist, 14.2 Practical motion timing guide, 14.3 Easing, 14.4 Micro-interaction catalog, 14.5 Performance rules for motion, 14.6 Reduced motion, 14.7 Scroll animation rules, 14. MICRO-INTERACTIONS AND MOTION DESIGN

### Community 28 - "23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE"
Cohesion: 0.25
Nodes (8): 23.1 AI design skills and critique, 23.2 Component systems, 23.3 Motion, visual effects, icons, and 3D, 23.4 Design systems and guidelines, 23.5 Browser QA, accessibility, and component review, 23.6 Frameworks, styling, and tokens, 23.7 How to evaluate a resource before installing it, 23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE

### Community 29 - "25. TESTING, SCREENSHOT REVIEW, AND VISUAL REFINEMENT"
Cohesion: 0.25
Nodes (8): 25.1 Required review loop, 25.2 Screenshot matrix, 25.3 Visual review checklist, 25.4 Functional review checklist, 25.5 Severity ranking, 25.6 Evidence-backed critique format, 25.7 Screenshot and test naming, 25. TESTING, SCREENSHOT REVIEW, AND VISUAL REFINEMENT

### Community 30 - "Modern Fashion POS"
Cohesion: 0.15
Nodes (12): Build the Windows EXE installer, Client inputs still required, Modern Fashion POS, Money and tax rules, Permissions, Preview locally, Project structure, Requirements (+4 more)

### Community 31 - "11. LAYOUT, GRID, SPACING, AND COMPOSITION"
Cohesion: 0.29
Nodes (7): 11.1 Layout hierarchy, 11.2 Width and container conventions, 11.3 Rhythm, 11.4 Composition, 11.5 Responsive grids, 11.6 Sticky/fixed surfaces, 11. LAYOUT, GRID, SPACING, AND COMPOSITION

### Community 32 - "21. FRONTEND ENGINEERING RULES"
Cohesion: 0.29
Nodes (7): 21.1 Protect the codebase, 21.2 React/Next.js considerations, 21.3 Tailwind and CSS, 21.4 TypeScript and component contracts, 21.5 Verification commands, 21.6 Git and checkpoints, 21. FRONTEND ENGINEERING RULES

### Community 33 - "22. REPOSITORY AND SKILL KNOWLEDGE EXTRACTION"
Cohesion: 0.29
Nodes (7): 22.1 Separate the layers, 22.2 Repository review protocol, 22.3 Per-resource record, 22.4 Extraction granularity, 22.5 Retrieval workflow for every UI task, 22.6 Do not fine-tune a model as the first step, 22. REPOSITORY AND SKILL KNOWLEDGE EXTRACTION

### Community 34 - "10. TYPOGRAPHY AND TYPE HIERARCHY"
Cohesion: 0.33
Nodes (6): 10.1 Typeface selection, 10.2 Hierarchy roles, 10.3 Practical type scale, 10.4 Line length and leading, 10.5 Typography anti-patterns, 10. TYPOGRAPHY AND TYPE HIERARCHY

### Community 35 - "26. SECURITY, LICENSES, AND SAFE TOOL USAGE"
Cohesion: 0.33
Nodes (6): 26.1 External repository content is untrusted, 26.2 Safe install policy, 26.3 License and attribution, 26.4 Privacy and network access, 26.5 Honest claims, 26. SECURITY, LICENSES, AND SAFE TOOL USAGE

### Community 36 - "29. REUSABLE PROMPTS AND REPORT TEMPLATES"
Cohesion: 0.33
Nodes (6): 29.1 Full design-and-build prompt, 29.2 Audit-only prompt, 29.3 Refinement-only prompt, 29.4 Resource research prompt, 29.5 Final report template, 29. REUSABLE PROMPTS AND REPORT TEMPLATES

### Community 37 - "8. DESIGN SYSTEMS, TOKENS, AND CONSISTENCY"
Cohesion: 0.33
Nodes (6): 8.1 Token layers, 8.2 Example token schema, 8.3 Token rules, 8.4 Component composition, 8.5 Design-system document, 8. DESIGN SYSTEMS, TOKENS, AND CONSISTENCY

### Community 38 - "9. COLOR SYSTEMS AND CONTRAST"
Cohesion: 0.33
Nodes (6): 9.1 Build semantic color roles, 9.2 Palette construction, 9.3 Contrast targets, 9.4 Dark UI rules, 9.5 Gradient and glow rules, 9. COLOR SYSTEMS AND CONTRAST

### Community 39 - "15. RESPONSIVE AND ADAPTIVE DESIGN"
Cohesion: 0.40
Nodes (5): 15.1 Use content-driven breakpoints, 15.2 Responsive requirements, 15.3 CSS implementation patterns, 15.4 Mobile-first quality, 15. RESPONSIVE AND ADAPTIVE DESIGN

### Community 40 - "17. CONTENT DESIGN, ICONS, IMAGERY, AND ASSETS"
Cohesion: 0.40
Nodes (5): 17.1 Content is part of the interface, 17.2 Image selection, 17.3 Icons, 17.4 Font and asset licensing, 17. CONTENT DESIGN, ICONS, IMAGERY, AND ASSETS

### Community 41 - "1. MISSION AND ACTIVATION"
Cohesion: 0.40
Nodes (5): 1.1 Mission, 1.2 Trigger this skill when, 1.3 Activation and loading behavior, 1.4 Operating modes, 1. MISSION AND ACTIVATION

### Community 42 - "20. PERFORMANCE AND TECHNICAL QUALITY"
Cohesion: 0.40
Nodes (5): 20.1 Performance is not optional polish, 20.2 Use 3D deliberately, 20.3 Images and fonts, 20.4 Quality metrics, 20. PERFORMANCE AND TECHNICAL QUALITY

### Community 43 - "4. TASK INTAKE AND PROJECT RECONNAISSANCE"
Cohesion: 0.40
Nodes (5): 4.1 Product brief, 4.2 Repository reconnaissance, 4.3 State assumptions, 4.4 Deliver a plan proportional to scope, 4. TASK INTAKE AND PROJECT RECONNAISSANCE

### Community 44 - "Releases and auto-update"
Cohesion: 0.18
Nodes (10): 1. How the installed app updates, 2. Build a release locally, 3. Publish a release, 4. Code signing, 5. Data safety and rollback, 6. Troubleshooting the update feed, 7. Acceptance checklist before telling the client "auto-update works", Option A — electron-builder publisher (+2 more)

### Community 45 - "compilerOptions"
Cohesion: 0.40
Nodes (4): compilerOptions, baseUrl, paths, exclude

### Community 46 - "13. INTERACTION STATES AND BEHAVIOR CONTRACTS"
Cohesion: 0.50
Nodes (4): 13.1 Typical state matrix, 13.2 Behavioral invariants, 13.3 Forms and validation order, 13. INTERACTION STATES AND BEHAVIOR CONTRACTS

### Community 47 - "19. AI-NATIVE INTERFACE PATTERNS"
Cohesion: 0.50
Nodes (4): 19.1 Core patterns, 19.2 Trust and control, 19.3 Context and resource discovery, 19. AI-NATIVE INTERFACE PATTERNS

### Community 48 - "6. DESIGN DIRECTION AND VISUAL STYLE TAXONOMY"
Cohesion: 0.50
Nodes (4): 6.1 Select a direction using five signals, 6.2 Combination rules, 6.3 Anti-template rules, 6. DESIGN DIRECTION AND VISUAL STYLE TAXONOMY

### Community 49 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, @ant-design/icons@^5.3.0, antd@^5.29.0, dayjs@^1.11.10, electron@45.3.3, electron-builder@26.18.0, eslint@^8.57.0, eslint-plugin-react-hooks@^4.6.0 (+9 more)

### Community 52 - "Modern Fashion POS — Project Memory"
Cohesion: 0.11
Nodes (17): 1. Current state, 2. Verified status, 3. Architecture decisions, 4. Important files, 5. Commands, 6. Data locations, 7. Open client inputs, 8. Immediate next steps (+9 more)

### Community 53 - "Hardware Validation Checklist"
Cohesion: 0.20
Nodes (9): 1. Windows printer setup, 2. Receipt printing, 3. A4 invoice / PDF, 4. Barcode labels, 5. Scanner, 6. Failure and recovery, Hardware Validation Checklist, Reported devices (+1 more)

### Community 54 - "RootApp.jsx"
Cohesion: 0.27
Nodes (6): react-dom@18.3.1, react-dom, SessionProvider(), theme, root, RootApp()

### Community 55 - "AppShell.jsx"
Cohesion: 0.12
Nodes (22): AppShell(), submitLogout(), submitPassword(), HomeRedirect(), NAV, Protected(), AccessDenied(), businessToday() (+14 more)

### Community 56 - "importService.js"
Cohesion: 0.19
Nodes (20): buildPlan(), preview(), decodeBuffer(), detectDelimiter(), extractTable(), FIELD_ALIASES, FIELDS, lookupVariant() (+12 more)

### Community 57 - "createReportService"
Cohesion: 0.24
Nodes (21): monthRange(), createReportService(), accountingPack(), cashierSeries(), dailySeries(), dashboard(), expenseReport(), expenseTotal() (+13 more)

### Community 58 - "main.js"
Cohesion: 0.16
Nodes (17): integrityCheck(), openDatabase(), createLogger(), rotateIfNeeded(), write(), initPaths(), registerIpc(), bootstrap() (+9 more)

### Community 59 - "database.js"
Cohesion: 0.13
Nodes (13): CATEGORY_SEED, DEFAULT_SETTINGS, ensureMigrationsTable(), EXPENSE_CATEGORY_SEED, MIGRATIONS, runMigrations(), seedCategories(), seedExpenseCategories() (+5 more)

### Community 60 - "createBackupService"
Cohesion: 0.23
Nodes (15): createBackupService(), autoBackupIfDue(), copyAssets(), createManual(), destinationDirectory(), list(), makeBackup(), pruneAutomaticBackups() (+7 more)

### Community 61 - "PosPage.jsx"
Cohesion: 0.16
Nodes (15): moneyPlain(), statusColor(), CustomerModal(), createCustomer(), newIdempotencyKey(), PAYMENT_OPTIONS, PosPage(), choosePayment() (+7 more)

### Community 62 - "@vitejs/plugin-react"
Cohesion: 0.33
Nodes (4): vite@^5.4.21, @vitejs/plugin-react@^4.3.1, vite, @vitejs/plugin-react

### Community 64 - "requireDateKey"
Cohesion: 0.21
Nodes (17): requireDateKey(), hashPassword(), list(), summary(), list(), mapSale(), createUserService(), activity() (+9 more)

### Community 65 - "useSession"
Cohesion: 0.33
Nodes (10): BrandMark(), SessionContext, useSession(), SessionGate(), LoginPage(), submit(), SetupPage(), lines() (+2 more)

### Community 66 - "AuditPage.jsx"
Cohesion: 0.19
Nodes (10): formatDateTime(), movementLabel(), ACTION_LABELS, actionLabel(), AuditPage(), ENTITY_LABELS, ENTITY_OPTIONS, entityLabel() (+2 more)

### Community 67 - "money.js"
Cohesion: 0.36
Nodes (3): allocate(), computeCartTotals(), roundToRupee()

### Community 68 - "createIpcHandlers"
Cohesion: 0.25
Nodes (3): createIpcHandlers(), chooseImportFile(), chooseLogo()

### Community 69 - "ImportPage"
Cohesion: 0.29
Nodes (4): filesize(), ImportPage(), chooseFile(), runImport()

### Community 70 - "barcode.js"
Cohesion: 0.47
Nodes (5): BARCODE_SYMBOLOGY, barcodeExample(), DEFAULT_BARCODE, formatBarcode(), normalizeBarcodeConfig()

### Community 71 - "createAuditService"
Cohesion: 0.50
Nodes (3): createAuditService(), list(), parseDetails()

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fail()` connect `fail` to `createSaleService`, `requireDateKey`, `createPrintService`, `createIpcHandlers`, `writeAudit`, `createBackupService`, `printService.js`, `validation.js`, `requireInt`, `importService.js`, `createReportService`, `main.js`, `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE`?**
  _High betweenness centrality (0.284) - this node is a cross-community bridge._
- **Should `createSaleService` be split into smaller, more focused modules?**
  _Cohesion score 0.1440185830429733 - nodes in this community are weakly interconnected._
- **Why does `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE` connect `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE` to `master-ui-skill.md`?**
  _High betweenness centrality (0.228) - this node is a cross-community bridge._
- **Should `api` be split into smaller, more focused modules?**
  _Cohesion score 0.06947368421052631 - nodes in this community are weakly interconnected._
- **Why does `23.7 How to evaluate a resource before installing it` connect `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE` to `fail`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Should `createPrintService` be split into smaller, more focused modules?**
  _Cohesion score 0.09526592635885447 - nodes in this community are weakly interconnected._
- **Should `4. Scope and modules` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._