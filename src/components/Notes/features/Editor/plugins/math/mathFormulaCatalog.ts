export interface MathFormulaItem {
  latex: string;
  preview?: string;
}

export interface MathFormulaGroup {
  name: string;
  nameZh: string;
  items: MathFormulaItem[];
}

export interface MathFormulaCategory {
  id: string;
  name: string;
  nameZh: string;
  label: string;
  kind: 'symbol' | 'template';
  groups: MathFormulaGroup[];
}

const items = (...latex: string[]): MathFormulaItem[] => latex.map((value) => ({ latex: value }));
const paired = (...values: Array<[string, string]>): MathFormulaItem[] =>
  values.map(([preview, latex]) => ({ preview, latex }));
const group = (name: string, nameZh: string, groupItems: MathFormulaItem[]): MathFormulaGroup => ({
  name,
  nameZh,
  items: groupItems,
});

export const mathFormulaCategories: MathFormulaCategory[] = [
  {
    id: 'operators', name: 'Operators', nameZh: '操作符', label: '+ - x', kind: 'symbol', groups: [
      group('Binary operators', '二元运算符', items(
        '+', '-', '\\times', '\\div', '\\cdot', '\\pm', '\\mp', '\\ast', '\\circ', '\\land', '\\lor',
        '\\oplus', '\\ominus', '\\otimes', '\\oslash', '\\odot', '\\setminus', '\\bullet', '\\star',
        '\\diamond', '\\uplus', '\\sqcap', '\\sqcup', '\\bigcirc', '\\wr', '\\amalg', '\\boxplus',
        '\\boxminus', '\\boxtimes', '\\boxdot', '\\circledast', '\\circledcirc', '\\circleddash', '\\dotplus',
        '\\ltimes', '\\rtimes', '\\leftthreetimes', '\\rightthreetimes', '\\divideontimes', '\\intercal',
      )),
      group('Relations', '关系运算符', items(
        '=', '\\neq', '<', '>', '\\leq', '\\geq', '\\ll', '\\gg', '\\equiv', '\\approx', '\\cong',
        '\\approxeq', '\\sim', '\\backsim', '\\simeq', '\\lesssim', '\\lessapprox', '\\gtrsim',
        '\\gtrapprox', '\\triangleq', '\\doteq', '\\fallingdotseq', '\\in', '\\notin', '\\ni', '\\not\\ni',
        '\\subset', '\\supset', '\\subseteq', '\\supseteq', '\\nsubseteq', '\\nsupseteq', '\\subsetneq',
        '\\supsetneq', '\\propto', '\\prec', '\\succ', '\\preceq', '\\succeq', '\\asymp', '\\models',
        '\\vdash', '\\dashv', '\\vDash', '\\Vdash', '\\Vvdash', '\\bowtie', '\\smile', '\\frown',
        '\\sqsubset', '\\sqsupset', '\\sqsubseteq', '\\sqsupseteq', '\\between', '\\pitchfork', '\\multimap',
        '\\implies', '\\impliedby', '\\iff', '\\to', '\\gets', '\\nmid', '\\not\\equiv', '\\not\\approx',
        '\\not\\sim', '\\nless', '\\ngtr', '\\nleq', '\\ngeq', '\\nprec', '\\nsucc', '\\ncong',
        '\\nvdash', '\\nvDash', '\\nVdash', '\\nVDash', '\\nparallel', '\\nsim',
      )),
    ],
  },
  {
    id: 'fractions', name: 'Fractions and derivatives', nameZh: '分数与导数', label: 'a/b', kind: 'symbol', groups: [
      group('Fractions and differentials', '分数与微分', paired(
        ['\\frac{a}{b}', '\\frac{}{}'], ['\\dfrac{a}{b}', '\\dfrac{}{}'], ['\\tfrac{a}{b}', '\\tfrac{}{}'],
        ['\\cfrac{a}{b}', '\\cfrac{}{}'], ['\\binom{n}{k}', '\\binom{}{}'], ['\\dbinom{n}{k}', '\\dbinom{}{}'],
        ['\\tbinom{n}{k}', '\\tbinom{}{}'], ['\\partial t', '\\partial {}'], ['\\frac{(a)}{b}', '\\frac{()}{}'],
        ['\\partial(t)', '\\partial({})'], ['\\frac{d}{dt}', '\\frac{d}{d{}}'],
        ['\\genfrac(]{1pt}{0}{a}{b}', '\\genfrac{}{}{}{}{}{}'],
      )),
      group('Derivatives', '导数', paired(
        ['\\frac{d}{dx}', '\\frac{d}{d{}}'], ['\\frac{\\mathrm d y}{\\mathrm d x}', '\\frac{\\mathrm d {}}{\\mathrm d {}}'],
        ['\\frac{\\partial f}{\\partial x}', '\\frac{\\partial {}}{\\partial {}}'], ["x'", "{}'"],
        ['\\dot x\\;\\ddot x', '\\dot{}\\;\\ddot{}'],
      )),
    ],
  },
  {
    id: 'scripts', name: 'Scripts', nameZh: '上下标', label: 'x^a / x_a', kind: 'symbol', groups: [
      group('Superscripts and subscripts', '上下标', paired(
        ['x^a', '^{}'], ['x_a', '_{}'], ['x_a^b', '_{}^{}'], ['{}_a^b x', '{}_{}^{}'],
        ['{}_1^2x_3^4', '{}_{}^{}{}_{}^{}'], ['x^1', '^1'], ['x^2', '^2'], ['x^3', '^3'], ['x^+', '^+'],
        ['x^-', '^-'], ['x^\\circ', '^\\circ'], ['x_0', '_0'], ['x_1', '_1'], ['x_2', '_2'], ['x_3', '_3'],
        ['x_+', '_+'], ['x_-', '_-'], ['x_a', '_a'], ['x_e', '_e'], ['x_o', '_o'], ['x_y', '_y'],
      )),
    ],
  },
  {
    id: 'greek', name: 'Greek letters', nameZh: '希腊字母', label: 'alpha beta', kind: 'symbol', groups: [
      group('Greek letters', '希腊字母', items(
        '\\alpha', '\\beta', '\\gamma', '\\delta', '\\epsilon', '\\varepsilon', '\\zeta', '\\eta', '\\theta',
        '\\vartheta', '\\iota', '\\kappa', '\\lambda', '\\mu', '\\nu', '\\xi', '\\pi', '\\rho', '\\sigma',
        '\\tau', '\\upsilon', '\\phi', '\\varphi', '\\chi', '\\psi', '\\omega', '\\Gamma', '\\Delta', '\\Theta',
        '\\Lambda', '\\Xi', '\\Pi', '\\Sigma', '\\Upsilon', '\\Phi', '\\Psi', '\\Omega', '\\varkappa', '\\varpi',
        '\\varrho', '\\varsigma', '\\digamma',
      )),
    ],
  },
  {
    id: 'large-operators', name: 'Integrals and sums', nameZh: '积分与求和', label: 'sum int', kind: 'symbol', groups: [
      group('Large operators', '大型运算符', paired(
        ['\\sum', '\\sum'], ['\\sum_a^b', '\\sum_{}^{}'], ['\\prod', '\\prod'], ['\\prod_a^b', '\\prod_{}^{}'],
        ['\\coprod', '\\coprod'], ['\\int', '\\int'], ['\\int_a^b', '\\int_{}^{}'], ['\\int\\limits_a^b', '\\int\\limits_{}^{}'],
        ['\\iint', '\\iint'], ['\\iint_a^b', '\\iint_{}^{}'], ['\\iiint', '\\iiint'], ['\\iiint_a^b', '\\iiint_{}^{}'],
        ['\\oint', '\\oint'], ['\\oint_a^b', '\\oint_{}^{}'], ['\\oiint', '\\oiint'], ['\\oiiint', '\\oiiint'],
        ['\\smallint', '\\smallint'], ['\\bigodot', '\\bigodot'], ['\\bigotimes', '\\bigotimes'], ['\\bigoplus', '\\bigoplus'],
        ['\\biguplus', '\\biguplus'], ['\\bigwedge', '\\bigwedge'], ['\\bigvee', '\\bigvee'], ['\\bigsqcup', '\\bigsqcup'],
      )),
    ],
  },
  {
    id: 'roots', name: 'Roots', nameZh: '根号', label: 'sqrt x', kind: 'symbol', groups: [
      group('Radicals', '根式', paired(
        ['\\sqrt{x}', '\\sqrt{}'], ['\\sqrt[3]{x}', '\\sqrt[3]{}'], ['\\sqrt[4]{x}', '\\sqrt[4]{}'], ['\\sqrt[n]{x}', '\\sqrt[n]{}'],
      )),
    ],
  },
  {
    id: 'sets', name: 'Brackets and sets', nameZh: '括号与集合', label: 'in infinity', kind: 'symbol', groups: [
      group('Brackets', '括号', paired(
        ['\\left( x \\right)', '\\left( {} \\right)'], ['\\left[ x \\right]', '\\left[ {} \\right]'],
        ['\\left\\{ x \\right\\}', '\\left\\{ {} \\right\\}'], ['\\left\\langle x \\right\\rangle', '\\left\\langle {} \\right\\rangle'],
        ['\\left|x\\right|', '\\left|{}\\right|'], ['\\left\\|x\\right\\|', '\\left\\|{}\\right\\|'],
        ['\\left\\lfloor x \\right\\rfloor', '\\left\\lfloor {} \\right\\rfloor'],
        ['\\left\\lceil x \\right\\rceil', '\\left\\lceil {} \\right\\rceil'],
      )),
      group('Logic, sets and geometry', '逻辑、集合与几何', items(
        '\\infty', '\\emptyset', '\\varnothing', '\\nabla', '\\perp', '\\angle', '\\measuredangle', '\\sphericalangle',
        '\\mid', '\\nmid', '\\parallel', '\\nparallel', '\\wedge', '\\vee', '\\cap', '\\cup', '\\forall', '\\exists',
        '\\nexists', '\\partial', '\\blacksquare', '\\square', '\\Box', '\\Diamond', '\\lozenge', '\\triangle',
        '\\triangledown', '\\triangleleft', '\\triangleright', '\\therefore', '\\because', '\\neg', '\\top', '\\bot',
        '\\complement', '\\wp', '\\imath', '\\jmath', '\\checkmark', '\\dagger', '\\ddagger', '\\hbar', '\\ell',
        '\\Re', '\\Im', '\\aleph', '\\ldots', '\\cdots', '\\vdots', '\\ddots', '\\prime', '\\surd',
        '\\spadesuit', '\\clubsuit', '\\heartsuit', '\\diamondsuit', '\\colon',
      )),
    ],
  },
  {
    id: 'functions', name: 'Limits and functions', nameZh: '极限与函数', label: 'lim log', kind: 'symbol', groups: [
      group('Limits and logarithms', '极限与对数', paired(
        ['\\lim_{x\\to\\infty}', '\\lim_{{}\\to{}}'], ['\\sup_x', '\\sup_{}'], ['\\inf_x', '\\inf_{}'],
        ['\\max_x', '\\max_{}'], ['\\min_x', '\\min_{}'], ['\\ln x', '\\ln{}'], ['\\log x', '\\log{}'], ['\\log_a b', '\\log_{}{}'],
      )),
      group('Functions and operators', '常用函数与算子', items(
        '\\det', '\\dim', '\\ker', '\\gcd', '\\Pr', '\\arg', '\\deg', '\\hom', '\\bmod', '\\pmod{}', '\\operatorname{sgn}',
      )),
    ],
  },
  {
    id: 'trigonometry', name: 'Trigonometry', nameZh: '三角与双曲', label: 'sin cos', kind: 'symbol', groups: [
      group('Trigonometric functions', '三角函数', items(
        '\\sin{}', '\\cos{}', '\\tan{}', '\\cot{}', '\\sec{}', '\\csc{}', '\\arcsin{}', '\\arccos{}', '\\arctan{}',
        '\\operatorname{arccot}', '\\operatorname{arcsec}', '\\operatorname{arccsc}',
      )),
      group('Hyperbolic functions', '双曲函数', items(
        '\\sinh{}', '\\cosh{}', '\\tanh{}', '\\coth{}', '\\operatorname{sech}', '\\operatorname{csch}',
        '\\sinh^{-1}{}', '\\cosh^{-1}{}', '\\tanh^{-1}{}', '\\coth^{-1}{}', '\\operatorname{sech}^{-1}', '\\operatorname{csch}^{-1}',
      )),
    ],
  },
  {
    id: 'arrows', name: 'Arrows', nameZh: '箭头', label: '-> <=>', kind: 'symbol', groups: [
      group('Arrows', '箭头符号', items(
        '\\leftarrow', '\\Leftarrow', '\\rightarrow', '\\Rightarrow', '\\leftrightarrow', '\\Leftrightarrow', '\\mapsto',
        '\\longmapsto', '\\uparrow', '\\Uparrow', '\\downarrow', '\\Downarrow', '\\updownarrow', '\\Updownarrow',
        '\\longleftarrow', '\\Longleftarrow', '\\longrightarrow', '\\Longrightarrow', '\\longleftrightarrow', '\\Longleftrightarrow',
        '\\leftharpoonup', '\\leftharpoondown', '\\rightharpoonup', '\\rightharpoondown', '\\upharpoonleft',
        '\\upharpoonright', '\\downharpoonleft', '\\downharpoonright', '\\leftleftarrows', '\\rightrightarrows',
        '\\leftrightarrows', '\\rightleftarrows', '\\rightleftharpoons', '\\leftrightharpoons', '\\curvearrowleft',
        '\\curvearrowright', '\\circlearrowleft', '\\circlearrowright', '\\hookleftarrow', '\\hookrightarrow',
        '\\twoheadrightarrow', '\\twoheadleftarrow', '\\rightsquigarrow', '\\nleftarrow', '\\nrightarrow', '\\nleftrightarrow',
        '\\nLeftarrow', '\\nRightarrow', '\\nLeftrightarrow',
      )),
      group('Extensible arrows', '可伸缩箭头', paired(
        ['\\xrightarrow{abc}', '\\xrightarrow{}'], ['\\xleftarrow{abc}', '\\xleftarrow{}'], ['\\xleftrightarrow{abc}', '\\xleftrightarrow{}'],
        ['\\xRightarrow{abc}', '\\xRightarrow{}'], ['\\xLeftarrow{abc}', '\\xLeftarrow{}'], ['\\xLeftrightarrow{abc}', '\\xLeftrightarrow{}'],
        ['\\xmapsto{abc}', '\\xmapsto{}'], ['\\xhookrightarrow{abc}', '\\xhookrightarrow{}'],
      )),
    ],
  },
  {
    id: 'accents', name: 'Accents', nameZh: '重音符号', label: 'bar x', kind: 'symbol', groups: [
      group('Accents and annotations', '重音与标注', paired(
        ['\\acute a', '\\acute{}'], ['\\grave a', '\\grave{}'], ['\\bar a', '\\bar{}'], ['\\check a', '\\check{}'],
        ['\\tilde a', '\\tilde{}'], ['\\dot a', '\\dot{}'], ['\\ddot a', '\\ddot{}'], ['\\breve a', '\\breve{}'],
        ['\\hat a', '\\hat{}'], ['\\mathring a', '\\mathring{}'], ['\\overline{abc}', '\\overline{}'], ['\\vec a', '\\vec{}'],
        ['\\widehat{abc}', '\\widehat{}'], ['\\widetilde{abc}', '\\widetilde{}'], ['\\widecheck{abc}', '\\widecheck{}'],
        ['\\utilde{abc}', '\\utilde{}'], ['\\overbrace{abc}', '\\overbrace{}'], ['\\underbrace{abc}', '\\underbrace{}'],
        ['\\overleftarrow{AB}', '\\overleftarrow{}'], ['\\overrightarrow{AB}', '\\overrightarrow{}'],
        ['\\overleftrightarrow{AB}', '\\overleftrightarrow{}'], ['\\underleftarrow{AB}', '\\underleftarrow{}'],
        ['\\underrightarrow{AB}', '\\underrightarrow{}'], ["a''", "{}''"],
        ['a^\\ast', 'a^\\ast'], ['a^\\star', 'a^\\star'], ['a_0', 'a_0'],
      )),
    ],
  },
  {
    id: 'structures', name: 'Structures', nameZh: '结构与环境', label: '[ ]', kind: 'symbol', groups: [
      group('Matrices and multiline', '矩阵与多行环境', paired(
        ['\\begin{matrix}a&b\\\\c&d\\end{matrix}', '\\begin{matrix} {} & {} \\\\ {} & {} \\end{matrix}'],
        ['\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}', '\\begin{pmatrix} {} & {} \\\\ {} & {} \\end{pmatrix}'],
        ['\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}', '\\begin{bmatrix} {} & {} \\\\ {} & {} \\end{bmatrix}'],
        ['\\begin{Bmatrix}a&b\\\\c&d\\end{Bmatrix}', '\\begin{Bmatrix} {} & {} \\\\ {} & {} \\end{Bmatrix}'],
        ['\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}', '\\begin{vmatrix} {} & {} \\\\ {} & {} \\end{vmatrix}'],
        ['\\begin{Vmatrix}a&b\\\\c&d\\end{Vmatrix}', '\\begin{Vmatrix} {} & {} \\\\ {} & {} \\end{Vmatrix}'],
        ['\\begin{cases}f(x)&x>0\\\\0&x\\le0\\end{cases}', '\\begin{cases} {} & {} \\\\ {} & {} \\end{cases}'],
        ['\\begin{aligned}a&=b\\\\c&=d\\end{aligned}', '\\begin{aligned} {} &= {} \\\\ {} &= {} \\end{aligned}'],
        ['\\begin{array}{cc}a&b\\\\c&d\\end{array}', '\\begin{array}{cc} {} & {} \\\\ {} & {} \\end{array}'],
        ['\\begin{smallmatrix}a&b\\\\c&d\\end{smallmatrix}', '\\begin{smallmatrix} {} & {} \\\\ {} & {} \\end{smallmatrix}'],
        ['\\begin{gathered}a\\\\b\\end{gathered}', '\\begin{gathered} {} \\\\ {} \\end{gathered}'],
        ['\\begin{split}a&=b\\\\c&=d\\end{split}', '\\begin{split} {} &= {} \\\\ {} &= {} \\end{split}'],
        ['\\begin{rcases}a&x>0\\\\b&x\\leq0\\end{rcases}', '\\begin{rcases} {} & {} \\\\ {} & {} \\end{rcases}'],
        ['\\begin{alignedat}{2}a&=b&c&=d\\end{alignedat}', '\\begin{alignedat}{2} {}&={} & {}&={} \\end{alignedat}'],
        ['\\begin{subarray}{c}i<j\\\\j<n\\end{subarray}', '\\begin{subarray}{c} {} \\\\ {} \\end{subarray}'],
      )),
      group('Structure and placeholders', '结构与占位', paired(
        ['\\overset{a}{b}', '\\overset{}{}'], ['\\underset{a}{b}', '\\underset{}{}'], ['\\substack{a\\\\b}', '\\substack{}'],
        ['\\overbrace{a+b}^n', '\\overbrace{}^{}'], ['\\underbrace{a+b}_n', '\\underbrace{}_{}'], ['\\boxed x', '\\boxed{}'],
        ['\\cancel x', '\\cancel{}'], ['\\phantom x', '\\phantom{}'], ['\\stackrel!=', '\\stackrel{}{}'],
        ['{a\\atop b}', '{ {} \\atop {} }'],
      )),
      group('Fonts and layout', '字体与布局', paired(
        ['\\mathrm{d}x', '\\mathrm{}'], ['\\mathbf v', '\\mathbf{}'], ['\\mathbb R', '\\mathbb{}'], ['\\mathcal F', '\\mathcal{}'],
        ['\\mathfrak g', '\\mathfrak{}'], ['\\mathsf{ABC}', '\\mathsf{}'], ['\\mathtt{ABC}', '\\mathtt{}'],
        ['\\mathit{ABC}', '\\mathit{}'], ['\\mathscr{ABC}', '\\mathscr{}'], ['\\mathnormal{ABC}', '\\mathnormal{}'],
        ['\\boldsymbol x', '\\boldsymbol{}'], ['\\pmb x', '\\pmb{}'],
        ['\\operatorname{rank}', '\\operatorname{}'], ['\\text{where}', '\\text{}'], ['\\textcolor{blue}{x}', '\\textcolor{blue}{}'],
        ['\\mathclap x', '\\mathclap{}'], ['\\mathllap x', '\\mathllap{}'], ['\\mathrlap x', '\\mathrlap{}'],
        ['\\smash x', '\\smash{}'], ['\\hphantom x', '\\hphantom{}'], ['\\vphantom x', '\\vphantom{}'],
        ['\\mathbb N', '\\mathbb{N}'], ['\\mathbb Z', '\\mathbb{Z}'], ['\\mathbb Q', '\\mathbb{Q}'], ['\\mathbb C', '\\mathbb{C}'],
        ['\\displaystyle x', '\\displaystyle'], ['\\textstyle x', '\\textstyle'],
        ['\\scriptstyle x', '\\scriptstyle'], ['\\scriptscriptstyle x', '\\scriptscriptstyle'],
      )),
      group('Spacing', '间距与换行', paired(
        ['a\\ b', '\\ '], ['a\\,b', '\\,'], ['a\\:b', '\\:'], ['a\\;b', '\\;'], ['a\\quad b', '\\quad'],
        ['a\\qquad b', '\\qquad'], ['a\\!b', '\\!'], ['a\\\\b', '\\\\\n'],
      )),
      group('Quantum notation', '量子记号', paired(
        ['\\bra\\phi', '\\bra{}'], ['\\ket\\psi', '\\ket{}'], ['\\braket{\\phi|\\psi}', '\\braket{}'],
        ['\\Bra\\phi', '\\Bra{}'], ['\\Ket\\psi', '\\Ket{}'],
      )),
    ],
  },
  {
    id: 'chemistry', name: 'Chemistry and units', nameZh: '化学与单位', label: 'H2O mol', kind: 'symbol', groups: [
      group('Chemical formulas and reactions', '化学式与反应', paired(
        ['\\ce{H2O}', '\\ce{H2O}'], ['\\ce{CO2}', '\\ce{CO2}'], ['\\ce{Fe^{3+}}', '\\ce{Fe^{3+}}'],
        ['\\ce{SO4^{2-}}', '\\ce{SO4^{2-}}'], ['\\ce{^{14}_{6}C}', '\\ce{^{}_{ }{}}'],
        ['\\ce{A -> B}', '\\ce{{} -> {}}'], ['\\ce{A <=> B}', '\\ce{{} <=> {}}'],
        ['\\ce{2H2 + O2 -> 2H2O}', '\\ce{2H2 + O2 -> 2H2O}'],
      )),
      group('Units and dimensions', '单位与量纲', items(
        '\\mathrm{m}', '\\mathrm{s}', '\\mathrm{kg}', '\\mathrm{mol}', '\\mathrm{K}', '\\mathrm{m\\,s^{-1}}',
        '\\mathrm{kg\\,m^{-3}}', '{}^{\\circ}\\mathrm{C}', '6.022\\times10^{23}', '\\mathrm{dB}', '\\%',
      )),
    ],
  },
  {
    id: 'core-formulas', name: 'Core formulas', nameZh: '核心公式', label: 'int', kind: 'template', groups: [
      group('Core formulas', '核心公式', items(
        '\\lim_{\\Delta x\\to0}\\frac{f(x+\\Delta x)-f(x)}{\\Delta x}', '\\int_a^b f(x)\\,dx',
        'f(x)=\\sum_{n=0}^{\\infty}\\frac{f^{(n)}(a)}{n!}(x-a)^n', 'e^{ix}=\\cos x+i\\sin x',
        '(AB)_{ij}=\\sum_{k=1}^n A_{ik}B_{kj}', '\\det(A)=\\sum_{\\sigma\\in S_n}\\operatorname{sgn}(\\sigma)\\prod_{i=1}^n a_{i,\\sigma_i}',
        'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', 'a^2+b^2=c^2', '\\iint_D f(x,y)\\,dxdy',
      )),
    ],
  },
  {
    id: 'matrix-templates', name: 'Matrices and cases', nameZh: '矩阵与分段', label: 'A_ij', kind: 'template', groups: [
      group('Matrices and cases', '矩阵与分段', items(
        '\\begin{bmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{bmatrix}', '\\begin{pmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{pmatrix}',
        '\\begin{matrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{matrix}', '\\begin{cases}f(x)&x>0\\\\0&x\\le0\\end{cases}',
        '\\begin{vmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{vmatrix}', '\\begin{Vmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{Vmatrix}',
        '\\begin{Bmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{Bmatrix}', 'A\\mathbf v=\\lambda\\mathbf v',
        '(A^T)_{ij}=A_{ji}', 'AA^{-1}=A^{-1}A=I', '(AB)_{ij}=\\sum_{k=1}^n A_{ik}B_{kj}',
      )),
    ],
  },
  {
    id: 'calculus-templates', name: 'Calculus and analysis', nameZh: '微积分与分析', label: "f'(x)", kind: 'template', groups: [
      group('Calculus and analysis', '微积分与分析', items(
        '\\frac{d}{dx}x^n=nx^{n-1}', '\\lim_{\\Delta x\\to0}\\frac{f(x+\\Delta x)-f(x)}{\\Delta x}',
        '\\int f(x)dx', '\\int_a^b f(x)dx', '\\lim_{x\\to a}f(x)=L',
        "f'(x)=\\lim_{\\Delta x\\to0}\\frac{f(x+\\Delta x)-f(x)}{\\Delta x}",
        "\\lim_{x\\to c}\\frac{f(x)}{g(x)}=\\lim_{x\\to c}\\frac{f'(x)}{g'(x)}",
        "f(x)=f(a)+f'(a)(x-a)+\\frac{f''(a)}{2!}(x-a)^2+\\cdots",
      )),
    ],
  },
  {
    id: 'probability-templates', name: 'Probability and statistics', nameZh: '概率与统计', label: 'P(X)', kind: 'template', groups: [
      group('Probability and statistics', '概率与统计', items(
        '\\bar x=\\frac{\\sum x_i}{n}', 'E(X)=\\sum x_iP(x_i)', '\\operatorname{Var}(X)=E[(X-E[X])^2]',
        'P(A|B)=\\frac{P(A\\cap B)}{P(B)}', 'P(X=k)=\\binom nk p^k(1-p)^{n-k}',
        'f(x|\\mu,\\sigma^2)=\\frac{1}{\\sqrt{2\\pi\\sigma^2}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}',
        '\\phi(z)=\\frac{1}{\\sqrt{2\\pi}}e^{-z^2/2}', 'P(X=k)=\\frac{\\lambda^ke^{-\\lambda}}{k!}',
        '\\operatorname{Cov}(X,Y)=E[(X-E[X])(Y-E[Y])]', 'P(A|B)=\\frac{P(B|A)P(A)}{P(B)}',
      )),
    ],
  },
  {
    id: 'algebra-templates', name: 'Algebra and geometry', nameZh: '代数与几何', label: 'x^2+y^2', kind: 'template', groups: [
      group('Algebra and geometry', '代数与几何', items(
        'x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}', '\\log_a b=\\frac{\\log_c b}{\\log_c a}',
        '(x-h)^2+(y-k)^2=r^2', '\\frac{x^2}{a^2}+\\frac{y^2}{b^2}=1',
        'd=\\frac{|Ax_1+By_1+C|}{\\sqrt{A^2+B^2}}', '\\frac a{\\sin A}=\\frac b{\\sin B}=\\frac c{\\sin C}',
        'c^2=a^2+b^2-2ab\\cos C', '\\sin(A\\pm B)=\\sin A\\cos B\\pm\\cos A\\sin B',
        '\\cos(A\\pm B)=\\cos A\\cos B\\mp\\sin A\\sin B', 'A=\\pi r^2', 'C=2\\pi r',
        'A=lw', 'A=\\frac12bh', 'a^2+b^2=c^2', 'V=a^3', 'V=lwh',
      )),
    ],
  },
  {
    id: 'differential-equations', name: 'Differential equations', nameZh: '微分方程', label: "y'", kind: 'template', groups: [
      group('Differential equations', '微分方程', items(
        "y'+p(x)y=q(x),\\quad y=e^{-\\int p(x)dx}\\left(\\int q(x)e^{\\int p(x)dx}dx+C\\right)",
        "ay''+by'+cy=0,\\quad r=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", "y''+p(x)y'+q(x)y=g(x)",
        '\\frac{\\partial u}{\\partial t}-\\alpha\\nabla^2u=0', 'y_{n+1}=y_n+hf(t_n,y_n)',
      )),
    ],
  },
  {
    id: 'transforms', name: 'Transforms and complex analysis', nameZh: '变换与复分析', label: 'F', kind: 'template', groups: [
      group('Transforms and complex analysis', '变换与复分析', items(
        'f(x)=\\frac{a_0}{2}+\\sum_{n=1}^{\\infty}\\left[a_n\\cos\\frac{2\\pi nx}{P}+b_n\\sin\\frac{2\\pi nx}{P}\\right]',
        '\\mathcal L\\{f(t)\\}=F(s)=\\int_0^\\infty f(t)e^{-st}\\,dt',
        'z=r(\\cos\\theta+i\\sin\\theta)=re^{i\\theta}',
        '\\frac{\\partial u}{\\partial x}=\\frac{\\partial v}{\\partial y},\\quad\\frac{\\partial u}{\\partial y}=-\\frac{\\partial v}{\\partial x}',
      )),
    ],
  },
  {
    id: 'physics', name: 'Physics and engineering', nameZh: '物理与工程', label: 'nabla E', kind: 'template', groups: [
      group('Physics and engineering', '物理与工程', items(
        '\\nabla\\cdot\\mathbf E=\\frac{\\rho}{\\varepsilon_0}',
        'i\\hbar\\frac{\\partial}{\\partial t}\\Psi(\\mathbf r,t)=\\hat H\\Psi(\\mathbf r,t)',
        'A=P\\left(1+\\frac rn\\right)^{nt}', 'E=mc^2', 'F=ma',
        '\\nabla\\times\\mathbf E=-\\frac{\\partial\\mathbf B}{\\partial t}',
        '\\frac{\\partial\\rho}{\\partial t}+\\nabla\\cdot\\mathbf J=0', 'S=k_B\\ln\\Omega',
      )),
    ],
  },
  {
    id: 'optimization', name: 'Optimization and computing', nameZh: '优化与计算', label: 'min L', kind: 'template', groups: [
      group('Optimization and computing', '优化与计算', items(
        '\\hat\\theta=\\arg\\min_\\theta\\mathcal L(\\theta)', '\\theta_{t+1}=\\theta_t-\\eta\\nabla_\\theta\\mathcal L(\\theta_t)',
        '\\operatorname{MSE}=\\frac1n\\sum_{i=1}^n(y_i-\\hat y_i)^2', 'H(p,q)=-\\sum_xp(x)\\log q(x)',
        'D_{\\mathrm{KL}}(P\\|Q)=\\sum_xP(x)\\log\\frac{P(x)}{Q(x)}',
        '\\operatorname{softmax}(z_i)=\\frac{e^{z_i}}{\\sum_je^{z_j}}',
        '\\mathcal L_{\\mathrm{reg}}=\\mathcal L+\\lambda\\lVert\\theta\\rVert_2^2',
      )),
    ],
  },
  {
    id: 'life-sciences', name: 'Life sciences and chemistry', nameZh: '生命与化学', label: 'Delta G', kind: 'template', groups: [
      group('Life sciences and chemistry', '生命与化学', items(
        '\\Delta G=\\Delta H-T\\Delta S', 'v=\\frac{V_{\\max}[S]}{K_m+[S]}',
        '\\mathrm{pH}=\\mathrm pK_a+\\log\\frac{[A^-]}{[HA]}', 'A=\\varepsilon bc', 'N(t)=N_0e^{rt}', '\\frac{dC}{dt}=-kC',
      )),
    ],
  },
];

export const mathFormulaItems = mathFormulaCategories.flatMap((category) =>
  category.groups.flatMap((formulaGroup) => formulaGroup.items.map((formula) => ({
    ...formula,
    category,
    group: formulaGroup,
  })))
);
