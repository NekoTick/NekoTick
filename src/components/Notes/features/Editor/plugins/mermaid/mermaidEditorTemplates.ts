export interface MermaidEditorTemplate {
  id: string;
  label: string;
  labelZh: string;
  directive: string;
  code: string;
}

function template(
  id: string,
  label: string,
  labelZh: string,
  directive: string,
  code: string[],
): MermaidEditorTemplate {
  return { id, label, labelZh, directive, code: code.join('\n') };
}

export const mermaidEditorTemplates: MermaidEditorTemplate[] = [
  template('flowchart', 'Flowchart', '流程图', 'flowchart', [
    'flowchart TD',
    '  A[Start] --> B{Decision}',
    '  B -->|Yes| C[Done]',
    '  B -->|No| D[Retry]',
  ]),
  template('sequence', 'Sequence', '时序图', 'sequenceDiagram', [
    'sequenceDiagram',
    '  participant Alice',
    '  participant Bob',
    '  Alice->>Bob: Hello',
    '  Bob-->>Alice: Reply',
  ]),
  template('class', 'Class', '类图', 'classDiagram', [
    'classDiagram',
    '  class User {',
    '    +String name',
    '    +login()',
    '  }',
    '  User --> Account',
  ]),
  template('state', 'State', '状态图', 'stateDiagram-v2', [
    'stateDiagram-v2',
    '  [*] --> Idle',
    '  Idle --> Running',
    '  Running --> [*]',
  ]),
  template('entity-relationship', 'Entity relationship', '实体关系图', 'erDiagram', [
    'erDiagram',
    '  USER ||--o{ ORDER : places',
    '  ORDER ||--|{ ITEM : contains',
  ]),
  template('user-journey', 'User journey', '用户旅程图', 'journey', [
    'journey',
    '  title User workday',
    '  section Morning',
    '    Open app: 5: User',
    '    Review notes: 4: User',
  ]),
  template('gantt', 'Gantt', '甘特图', 'gantt', [
    'gantt',
    '  title Project plan',
    '  dateFormat YYYY-MM-DD',
    '  section Work',
    '  Design :a1, 2026-01-01, 5d',
    '  Build :after a1, 7d',
  ]),
  template('pie', 'Pie', '饼图', 'pie', [
    'pie showData',
    '  title Distribution',
    '  "A" : 45',
    '  "B" : 35',
    '  "C" : 20',
  ]),
  template('quadrant', 'Quadrant', '象限图', 'quadrantChart', [
    'quadrantChart',
    '  title Priority Matrix',
    '  x-axis Low Effort --> High Effort',
    '  y-axis Low Impact --> High Impact',
    '  Plan: [0.35, 0.75]',
    '  Build: [0.70, 0.60]',
  ]),
  template('requirement', 'Requirement', '需求图', 'requirementDiagram', [
    'requirementDiagram',
    '  requirement app_req {',
    '    id: 1',
    '    text: Render Mermaid diagrams',
    '    risk: low',
    '    verifymethod: test',
    '  }',
  ]),
  template('git', 'Git graph', 'Git 图', 'gitGraph', [
    'gitGraph',
    '  commit id: "init"',
    '  branch feature',
    '  checkout feature',
    '  commit id: "work"',
    '  checkout main',
    '  merge feature',
  ]),
  template('c4', 'C4', 'C4 架构图', 'C4Context', [
    'C4Context',
    '  title System Context',
    '  Person(user, "User")',
    '  System(app, "App")',
    '  Rel(user, app, "Uses")',
  ]),
  template('mindmap', 'Mind map', '思维导图', 'mindmap', [
    'mindmap',
    '  root((Topic))',
    '    Branch A',
    '      Detail',
    '    Branch B',
  ]),
  template('timeline', 'Timeline', '时间线', 'timeline', [
    'timeline',
    '  title Release',
    '  Planning : Scope',
    '  Build : Implement : Test',
    '  Launch : Ship',
  ]),
  template('zenuml', 'ZenUML', 'ZenUML', 'zenuml', [
    'zenuml',
    '  Alice->Bob: Hello',
    '  Bob->Alice: Reply',
  ]),
  template('sankey', 'Sankey', '桑基图', 'sankey-beta', [
    'sankey-beta',
    '  Source,Transform,8',
    '  Source,Archive,2',
    '  Transform,Output,6',
  ]),
  template('xy-chart', 'XY chart', 'XY 图', 'xychart-beta', [
    'xychart-beta',
    '  title "Velocity"',
    '  x-axis [Mon, Tue, Wed, Thu]',
    '  y-axis "Tasks" 0 --> 10',
    '  line [2, 4, 6, 8]',
    '  bar [3, 5, 4, 7]',
  ]),
  template('block', 'Block', '块图', 'block-beta', [
    'block-beta',
    '  columns 3',
    '  A["Input"] B["Process"] C["Output"]',
    '  A --> B',
    '  B --> C',
  ]),
  template('packet', 'Packet', '数据包图', 'packet-beta', [
    'packet-beta',
    '  title TCP Packet',
    '  0-15: "Source Port"',
    '  16-31: "Destination Port"',
    '  32-63: "Sequence Number"',
  ]),
  template('kanban', 'Kanban', '看板', 'kanban', [
    'kanban',
    '  Todo',
    '    [Write spec]',
    '  Done',
    '    [Ship]',
  ]),
  template('architecture', 'Architecture', '架构图', 'architecture-beta', [
    'architecture-beta',
    '  group api(cloud)[API]',
    '  service web(server)[Web] in api',
    '  service db(database)[DB] in api',
    '  web:R --> L:db',
  ]),
  template('radar', 'Radar', '雷达图', 'radar-beta', [
    'radar-beta',
    '  title Skills',
    '  axis ux["UX"], api["API"], ops["Ops"]',
    '  curve team["Team"]{4, 3, 5}',
  ]),
  template('treemap', 'Treemap', '矩形树图', 'treemap', [
    'treemap',
    '  "Root"',
    '    "Design": 30',
    '    "Build": 70',
  ]),
  template('tree-view', 'Tree view', '树视图', 'treeView-beta', [
    'treeView-beta',
    '  "Root"',
    '    "Branch"',
    '      "Leaf"',
  ]),
  template('event-modeling', 'Event modeling', '事件建模图', 'eventmodeling', [
    'eventmodeling title Event Model',
  ]),
  template('ishikawa', 'Ishikawa', '鱼骨图', 'ishikawa', [
    'ishikawa',
    '  Problem',
    '    People',
    '      Training',
    '    Process',
    '      Review',
  ]),
  template('venn', 'Venn', '韦恩图', 'venn-beta', [
    'venn-beta',
    '  title Coverage',
    '  set Frontend: 10',
    '  set Backend: 8',
    '  union Frontend, Backend: 3',
  ]),
  template('wardley', 'Wardley map', 'Wardley 地图', 'wardley-beta', [
    'wardley-beta',
    '  title Product Map',
    '  component User [0.95, 0.15]',
    '  component App [0.75, 0.45]',
    '  User -> App',
  ]),
];
