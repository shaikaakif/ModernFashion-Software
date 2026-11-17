# Graph Report - ModernFashion-Software  (2026-11-17)

## Corpus Check
- 77 files · ~87,009 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 4, .ico 1, .css 1)

## Summary
- 952 nodes · 2788 edges · 56 communities (54 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 144 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6499d614`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- fail
- api
- createPrintService
- 4. Scope and modules
- AI_ENGINEERING_CONSTITUTION.md
- Modern Fashion --- Brand Kit & POS Interface Design System
- createReportService
- main.js
- build
- database.js
- master-ui-skill.md
- helpers.js
- MASTER_AI_ENGINEERING_SOP.md
- createExportService
- devDependencies
- 24. INSTALLATION AND ACTIVATION RECIPES
- 12. COMPONENT QUALITY STANDARDS
- 2. THE DESIGN CONSTITUTION
- 5. END-TO-END UI WORKFLOW
- electron
- backupService.js
- dependencies
- 16. ACCESSIBILITY AND INCLUSIVE INTERACTION
- createIpcHandlers
- scripts
- cart.js
- money.js
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
- createAuditService
- compilerOptions
- 13. INTERACTION STATES AND BEHAVIOR CONTRACTS
- 19. AI-NATIVE INTERFACE PATTERNS
- 6. DESIGN DIRECTION AND VISUAL STYLE TAXONOMY
- @vitejs/plugin-react
- AGENTS.md
- Modern Fashion POS — Project Memory
- Hardware Validation Checklist
- RootApp.jsx
- 28. DEFINITION OF DONE AND QUALITY SCORING

## God Nodes (most connected - your core abstractions)
1. `fail()` - 102 edges
2. `api()` - 91 edges
3. `errorMessage()` - 85 edges
4. `nowIso()` - 76 edges
5. `writeAudit()` - 68 edges
6. `requireInt()` - 63 edges
7. `getSetting()` - 45 edges
8. `requireText()` - 44 edges
9. `createSaleService()` - 41 edges
10. `optionalText()` - 37 edges

## Surprising Connections (you probably didn't know these)
- `Data and money` --references--> `transaction()`  [INFERRED]
  PROJECT_MEMORY.md → electron/core/database.js
- `23.7 How to evaluate a resource before installing it` --references--> `fail()`  [INFERRED]
  Docs/master-ui-skill.md → electron/core/errors.js
- `createTestApp()` --calls--> `createAuthService()`  [EXTRACTED]
  tests/helpers.js → electron/services/authService.js
- `createTestApp()` --calls--> `createBackupService()`  [EXTRACTED]
  tests/helpers.js → electron/services/backupService.js
- `createTestApp()` --calls--> `createCatalogService()`  [EXTRACTED]
  tests/helpers.js → electron/services/catalogService.js

## Import Cycles
- None detected.

## Communities (56 total, 2 thin omitted)

### Community 0 - "fail"
Cohesion: 0.06
Nodes (146): writeAudit(), transaction(), AppError, assert(), fail(), assertStockAvailable(), getStock(), recordStockMovement() (+138 more)

### Community 1 - "api"
Cohesion: 0.06
Nodes (133): @ant-design/icons, antd, dayjs, react, react-router-dom, api(), errorMessage(), AppShell() (+125 more)

### Community 2 - "createPrintService"
Cohesion: 0.10
Nodes (52): code128Svg(), encodeCode128B(), escapeHtml(), PATTERNS, addressLines(), amountInWords(), belowHundred(), belowThousand() (+44 more)

### Community 3 - "4. Scope and modules"
Cohesion: 0.05
Nodes (36): 10. Engineering Constitution and Master SOP alignment, 11. Acceptance checklist, 12. First response expected from OpenCode, 1. Mission and outcome, 2. Client identity and details, 3. Evidence from the client's sample receipt, 4.10 WhatsApp invoice sharing, 4.11 Thermal receipt printing (+28 more)

### Community 4 - "AI_ENGINEERING_CONSTITUTION.md"
Cohesion: 0.08
Nodes (23): 10. FEATURE IMPLEMENTATION TEMPLATE, 11. AI AGENT PROMPT TEMPLATE, 12. QUALITY ASSURANCE, 13. PRODUCTIVITY PRINCIPLES, 14. DOCUMENTATION SYSTEM, 15. FINAL COMMANDMENTS, 1. PROJECT FOUNDATION, 2. AI AGENT CONSTITUTION (+15 more)

### Community 5 - "Modern Fashion --- Brand Kit & POS Interface Design System"
Cohesion: 0.09
Nodes (21): 10. Responsive behaviour, 11. Design QA, 12. Brand asset handling, 13. Design definition of done, 1. Brand hierarchy, 2. Brand character, 3. Colour system, 4. Typography (+13 more)

### Community 6 - "createReportService"
Cohesion: 0.25
Nodes (20): monthRange(), createReportService(), accountingPack(), cashierSeries(), dailySeries(), dashboard(), expenseReport(), expenseTotal() (+12 more)

### Community 7 - "main.js"
Cohesion: 0.18
Nodes (13): integrityCheck(), openDatabase(), createLogger(), rotateIfNeeded(), write(), initPaths(), bootstrap(), createMainWindow() (+5 more)

### Community 8 - "build"
Cohesion: 0.10
Nodes (21): build, appId, asar, copyright, directories, files, nsis, productName (+13 more)

### Community 9 - "database.js"
Cohesion: 0.13
Nodes (13): CATEGORY_SEED, DEFAULT_SETTINGS, ensureMigrationsTable(), EXPENSE_CATEGORY_SEED, MIGRATIONS, runMigrations(), seedCategories(), seedExpenseCategories() (+5 more)

### Community 10 - "master-ui-skill.md"
Cohesion: 0.13
Nodes (14): 18.1 Select the representation from the question, 18.2 Chart rules, 18.3 Dashboards, 18. DATA VISUALIZATION AND DENSE INTERFACES, 27.1 Example project resource registry layout, 27. PROJECT DELIVERABLES AND DOCUMENTATION, 30. REFERENCES AND VERSION-CHECK NOTES, 3. PRIORITY HIERARCHY AND CONFLICT RESOLUTION (+6 more)

### Community 11 - "helpers.js"
Cohesion: 0.26
Nodes (11): addStaff(), completeSale(), createProduct(), createTestApp(), login(), logout(), saleCount(), setupOwner() (+3 more)

### Community 12 - "MASTER_AI_ENGINEERING_SOP.md"
Cohesion: 0.14
Nodes (13): 4.1 Native Android Playbook (Kotlin + Jetpack Compose), 4.2 Modern Web & Full-Stack Playbook (Next.js / React / TypeScript), 4.3 Database & Cloud Playbook (PostgreSQL / Supabase / SQLite), 4.4 Payments & Monetization Playbook, 4. DOMAIN-SPECIFIC PLAYBOOKS, 5. ANTI-PATTERN BLACKLIST (BANNED PRACTICES), 6. THE FOUNDER'S AI SESSION STARTER PROMPT, Phase 0: Project Ingestion & Codebase Mapping (+5 more)

### Community 13 - "createExportService"
Cohesion: 0.37
Nodes (12): createExportService(), exportAccountingPack(), exportCatalogue(), exportCustomers(), exportExpenses(), exportInventory(), exportPurchases(), exportSalesRegister() (+4 more)

### Community 14 - "devDependencies"
Cohesion: 0.11
Nodes (22): author, description, devDependencies, electron-builder@26.18.0, eslint@^8.57.0, eslint-plugin-react@^7.33.2, eslint-plugin-react-hooks@^4.6.0, eslint-plugin-react-refresh@^0.4.7 (+14 more)

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

### Community 19 - "electron"
Cohesion: 0.25
Nodes (4): { contextBridge, ipcRenderer }, electron@45.3.3, electron, child

### Community 20 - "backupService.js"
Cohesion: 0.24
Nodes (11): createBackupService(), autoBackupIfDue(), createManual(), destinationDirectory(), makeBackup(), pruneAutomaticBackups(), restore(), verify() (+3 more)

### Community 21 - "dependencies"
Cohesion: 0.20
Nodes (10): dependencies, @ant-design/icons@^5.3.0, antd@^5.29.0, dayjs@^1.11.10, jsbarcode@^3.12.3, react@18.3.1, react-dom@18.3.1, react-router-dom@^6.30.0 (+2 more)

### Community 22 - "16. ACCESSIBILITY AND INCLUSIVE INTERACTION"
Cohesion: 0.22
Nodes (9): 16.1 Semantic structure, 16.2 Keyboard and focus, 16.3 Contrast and color, 16.4 Pointer and touch targets, 16.5 Motion and vestibular comfort, 16.6 Forms, errors, and status announcements, 16.7 Reflow and zoom, 16.8 Accessibility testing policy (+1 more)

### Community 23 - "createIpcHandlers"
Cohesion: 0.24
Nodes (4): copyFileSafely(), createIpcHandlers(), chooseLogo(), registerIpc()

### Community 24 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, dev, dist, dist:dir, lint, start, test (+1 more)

### Community 25 - "cart.js"
Cohesion: 0.28
Nodes (3): addToCart(), createLineKey(), makeCartLine()

### Community 26 - "money.js"
Cohesion: 0.36
Nodes (3): allocate(), computeCartTotals(), roundToRupee()

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
Cohesion: 0.17
Nodes (11): Build the Windows EXE installer, Client inputs still required, Modern Fashion POS, Money and tax rules, Permissions, Preview locally, Project structure, Requirements (+3 more)

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

### Community 44 - "createAuditService"
Cohesion: 0.50
Nodes (3): createAuditService(), list(), parseDetails()

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

### Community 49 - "@vitejs/plugin-react"
Cohesion: 0.33
Nodes (4): vite@^5.4.21, @vitejs/plugin-react@^4.3.1, vite, @vitejs/plugin-react

### Community 52 - "Modern Fashion POS — Project Memory"
Cohesion: 0.13
Nodes (14): 1. Current state, 2. Verified status, 3. Architecture decisions, 4. Important files, 5. Commands, 6. Data locations, 7. Open client inputs, 8. Immediate next steps (+6 more)

### Community 53 - "Hardware Validation Checklist"
Cohesion: 0.20
Nodes (9): 1. Windows printer setup, 2. Receipt printing, 3. A4 invoice / PDF, 4. Barcode labels, 5. Scanner, 6. Failure and recovery, Hardware Validation Checklist, Reported devices (+1 more)

### Community 54 - "RootApp.jsx"
Cohesion: 0.36
Nodes (4): SessionProvider(), theme, root, RootApp()

### Community 55 - "28. DEFINITION OF DONE AND QUALITY SCORING"
Cohesion: 0.50
Nodes (4): 28.1 Definition of done, 28.2 Visual quality scorecard, 28.3 Acceptance mindset, 28. DEFINITION OF DONE AND QUALITY SCORING

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `electron` connect `electron` to `createPrintService`, `devDependencies`, `main.js`?**
  _High betweenness centrality (0.314) - this node is a cross-community bridge._
- **Should `fail` be split into smaller, more focused modules?**
  _Cohesion score 0.05535453564400432 - nodes in this community are weakly interconnected._
- **Why does `fail()` connect `fail` to `createPrintService`, `createReportService`, `backupService.js`, `createIpcHandlers`, `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE`?**
  _High betweenness centrality (0.301) - this node is a cross-community bridge._
- **Should `api` be split into smaller, more focused modules?**
  _Cohesion score 0.06079177233023387 - nodes in this community are weakly interconnected._
- **Why does `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE` connect `23. RESOURCE CATALOG AND WHEN TO USE EACH SOURCE` to `master-ui-skill.md`?**
  _High betweenness centrality (0.258) - this node is a cross-community bridge._
- **Should `createPrintService` be split into smaller, more focused modules?**
  _Cohesion score 0.09966329966329966 - nodes in this community are weakly interconnected._
- **Should `4. Scope and modules` be split into smaller, more focused modules?**
  _Cohesion score 0.05405405405405406 - nodes in this community are weakly interconnected._