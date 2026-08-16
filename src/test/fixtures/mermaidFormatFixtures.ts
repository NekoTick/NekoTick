export type MermaidFormatFixture = {
  label: string;
  minHeight?: number;
  minWidth?: number;
  source: string[];
};

export const MERMAID_FORMAT_FIXTURES: MermaidFormatFixture[] = [
  {
    label: 'flowchart',
    source: [
      'flowchart TD',
      '  A[Start] --> B{Ready?}',
      '  B -->|Yes| C[Ship]',
      '  B -->|No| D[Fix]',
    ],
  },
  {
    label: 'graph',
    source: [
      'graph LR',
      '  A[Legacy graph] --> B[Still supported]',
    ],
  },
  {
    label: 'flowchart-elk',
    source: [
      'flowchart-elk TD',
      '  A[Start] --> B[ELK layout]',
      '  B --> C[Done]',
    ],
  },
  {
    label: 'sequence',
    source: [
      'sequenceDiagram',
      '  participant Alice',
      '  participant Bob',
      '  Alice->>Bob: Hello',
      '  Bob-->>Alice: Hi',
    ],
  },
  {
    label: 'class',
    source: [
      'classDiagram',
      '  class Animal',
      '  Animal : +String name',
      '  Animal : +move()',
      '  class Cat',
      '  Animal <|-- Cat',
    ],
  },
  {
    label: 'class-v2',
    source: [
      'classDiagram-v2',
      '  class Service',
      '  Service : +run()',
      '  class Worker',
      '  Service <|-- Worker',
    ],
  },
  {
    label: 'state',
    source: [
      'stateDiagram-v2',
      '  [*] --> Idle',
      '  Idle --> Running',
      '  Running --> [*]',
    ],
  },
  {
    label: 'state-v1',
    source: [
      'stateDiagram',
      '  [*] --> Draft',
      '  Draft --> Published',
    ],
  },
  {
    label: 'er',
    source: [
      'erDiagram',
      '  CUSTOMER ||--o{ ORDER : places',
      '  ORDER ||--|{ ITEM : contains',
      '  CUSTOMER }|..|{ ADDRESS : uses',
    ],
  },
  {
    label: 'c4',
    minHeight: 140,
    source: [
      'C4Context',
      'title System Context',
      'Person(user, "User")',
      'System(app, "App")',
      'Rel(user, app, "Uses")',
    ],
  },
  {
    label: 'journey',
    minHeight: 120,
    source: [
      'journey',
      '  title User workday',
      '  section Morning',
      '    Open app: 5: User',
      '    Review notes: 4: User',
      '  section Afternoon',
      '    Export summary: 3: User',
    ],
  },
  {
    label: 'pie',
    source: [
      'pie showData',
      '  title Time allocation',
      '  "Design" : 35',
      '  "Build" : 45',
      '  "Review" : 20',
    ],
  },
  {
    label: 'info',
    source: [
      'info',
    ],
  },
  {
    label: 'quadrant',
    minHeight: 260,
    source: [
      'quadrantChart',
      '  title Priority Matrix',
      '  x-axis Low Effort --> High Effort',
      '  y-axis Low Impact --> High Impact',
      '  quadrant-1 Plan',
      '  quadrant-2 Do',
      '  quadrant-3 Skip',
      '  quadrant-4 Defer',
      '  Search: [0.35, 0.75]',
      '  Export: [0.70, 0.60]',
    ],
  },
  {
    label: 'requirement',
    source: [
      'requirementDiagram',
      '  requirement test_req {',
      '    id: 1',
      '    text: App renders Mermaid diagrams',
      '    risk: low',
      '    verifymethod: test',
      '  }',
    ],
  },
  {
    label: 'gitGraph',
    source: [
      'gitGraph',
      '  commit id: "init"',
      '  branch feature',
      '  checkout feature',
      '  commit id: "work"',
      '  checkout main',
      '  merge feature',
    ],
  },
  {
    label: 'mindmap',
    source: [
      'mindmap',
      '  root((Notes))',
      '    Capture',
      '      Text',
      '      Images',
      '    Organize',
      '      Tags',
    ],
  },
  {
    label: 'timeline',
    source: [
      'timeline',
      '  title Release',
      '  Planning : Scope',
      '  Build : Implement : Test',
      '  Launch : Ship',
    ],
  },
  {
    label: 'zenuml',
    source: [
      'zenuml',
      '  Alice->Bob: Hello',
      '  Bob->Alice: Hi',
    ],
  },
  {
    label: 'kanban',
    minHeight: 90,
    source: [
      'kanban',
      '  Todo',
      '    [Write spec]',
      '  Done',
      '    [Ship]',
    ],
  },
  {
    label: 'xyChart',
    minHeight: 240,
    source: [
      'xychart-beta',
      '  title "Velocity"',
      '  x-axis [Mon, Tue, Wed, Thu]',
      '  y-axis "Tasks" 0 --> 10',
      '  line [2, 4, 6, 8]',
      '  bar [3, 5, 4, 7]',
    ],
  },
  {
    label: 'sankey',
    minHeight: 120,
    source: [
      'sankey-beta',
      '  Source,Transform,8',
      '  Source,Archive,2',
      '  Transform,Output,6',
    ],
  },
  {
    label: 'radar',
    minHeight: 220,
    source: [
      'radar-beta',
      '  title Skills',
      '  axis ux["UX"], api["API"], ops["Ops"]',
      '  curve team["Team"]{4, 3, 5}',
    ],
  },
  {
    label: 'block',
    source: [
      'block-beta',
      '  columns 3',
      '  A["Input"] B["Process"] C["Output"]',
      '  A --> B',
      '  B --> C',
    ],
  },
  {
    label: 'packet',
    source: [
      'packet-beta',
      '  title TCP Packet',
      '  0-15: "Source Port"',
      '  16-31: "Destination Port"',
      '  32-63: "Sequence Number"',
    ],
  },
  {
    label: 'treemap',
    minHeight: 220,
    source: [
      'treemap',
      '  "Root"',
      '    "Design": 30',
      '    "Build": 70',
    ],
  },
  {
    label: 'treeView',
    minHeight: 120,
    source: [
      'treeView-beta',
      '"Root"',
      '  "Branch"',
      '    "Leaf"',
    ],
  },
  {
    label: 'architecture',
    minHeight: 180,
    source: [
      'architecture-beta',
      '  group api(cloud)[API]',
      '  service web(server)[Web] in api',
      '  service db(database)[DB] in api',
      '  web:R --> L:db',
    ],
  },
  {
    label: 'eventmodeling',
    minWidth: 50,
    source: [
      'eventmodeling',
      '  tf 01 ui OrderForm',
      '  tf 02 command PlaceOrder ->> 01',
      '  tf 03 event OrderPlaced ->> 02',
    ],
  },
  {
    label: 'ishikawa',
    minHeight: 120,
    source: [
      'ishikawa',
      '  Problem',
      '    People',
      '      Training',
      '    Process',
      '      Review',
    ],
  },
  {
    label: 'venn',
    minHeight: 220,
    source: [
      'venn-beta',
      '  title Coverage',
      '  set Frontend: 10',
      '  set Backend: 8',
      '  union Frontend, Backend: 3',
    ],
  },
  {
    label: 'wardley',
    minHeight: 220,
    source: [
      'wardley-beta',
      '  title Product Map',
      '  component User [0.95, 0.15]',
      '  component App [0.75, 0.45]',
      '  User -> App',
    ],
  },
  {
    label: 'gantt',
    minHeight: 160,
    minWidth: 900,
    source: [
      'gantt',
      '  dateFormat YYYY-MM-DD',
      '  title Mermaid Gantt',
      '  section Alpha',
      '  Done task :done, a1, 2026-01-01, 2d',
      '  Active task :active, a2, after a1, 3d',
      '  section Beta',
      '  Future task :a3, after a2, 4d',
    ],
  },
];

export function buildMermaidFormatsMarkdown() {
  return [
    '# Mermaid format matrix',
    '',
    ...MERMAID_FORMAT_FIXTURES.flatMap((fixture) => [
      `## ${fixture.label}`,
      '',
      '```mermaid',
      ...fixture.source,
      '```',
      '',
    ]),
  ].join('\n');
}
