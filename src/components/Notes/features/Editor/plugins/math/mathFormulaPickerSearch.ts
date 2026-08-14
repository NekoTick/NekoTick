import { mathFormulaItems } from './mathFormulaCatalog';

const SEARCH_ALIASES_BY_CATEGORY: Record<string, string> = {
  operators: 'arithmetic relation add subtract multiply divide equality 运算 关系 加减乘除 等于 不等于',
  fractions: 'fraction derivative differential partial quotient 分式 微分 求导 偏导 商',
  scripts: 'superscript subscript exponent power index 上标 下标 指数 幂',
  greek: 'greek alphabet alpha beta gamma 希腊 字母',
  'large-operators': 'sum product integral series 求和 连乘 积分 级数',
  roots: 'root radical square root cube root 根式 根号 平方根 立方根',
  sets: 'bracket set logic geometry infinity 括号 集合 逻辑 几何 无穷',
  functions: 'limit logarithm function operator 极限 对数 函数 算子',
  trigonometry: 'trigonometric hyperbolic sine cosine tangent 三角 双曲 正弦 余弦 正切',
  arrows: 'arrow mapping implication vector 箭头 映射 推导 向量',
  accents: 'accent annotation vector hat bar dot 重音 标注 向量 帽 横线 点',
  structures: 'matrix cases multiline font spacing quantum 矩阵 分段 多行 字体 间距 量子',
  chemistry: 'chemical reaction unit dimension 化学 反应 单位 量纲',
  'core-formulas': 'common research formula derivative integral matrix quadratic 核心 通用 科研 求导 积分 矩阵 二次方程',
  'matrix-templates': 'matrix determinant eigenvalue transpose inverse cases 矩阵 行列式 特征值 转置 逆矩阵 分段',
  'calculus-templates': 'calculus analysis derivative integral limit taylor 微积分 分析 求导 导数 积分 极限 泰勒',
  'probability-templates': 'probability statistics expectation variance bayes normal distribution 概率 统计 期望 方差 贝叶斯 正态分布',
  'algebra-templates': 'algebra geometry quadratic pythagorean circle ellipse 代数 几何 二次方程 勾股定理 圆 椭圆',
  'differential-equations': 'differential equation ode pde euler 微分方程 常微分 偏微分 欧拉',
  transforms: 'fourier laplace transform complex analysis 傅里叶 拉普拉斯 复分析 变换',
  physics: 'physics engineering quantum electromagnetism mechanics 物理 工程 量子 电磁 力学',
  optimization: 'optimization computation machine learning loss gradient softmax entropy 优化 计算 机器学习 损失 梯度 熵',
  'life-sciences': 'biology chemistry thermodynamics kinetics life science 生物 化学 热力学 动力学 生命科学',
};

const COMPACT_SEARCH_CHARACTERS = /[\s\\{}_[\](),;:+\-]/g;

interface MathFormulaSearchIndexEntry {
  entry: (typeof mathFormulaItems)[number];
  haystack: string;
  compactHaystack: string;
}

const mathFormulaSearchIndex: MathFormulaSearchIndexEntry[] = mathFormulaItems.map((entry) => {
  const haystack = [
    entry.latex,
    entry.preview ?? '',
    entry.category.name,
    entry.category.nameZh,
    entry.group.name,
    entry.group.nameZh,
    SEARCH_ALIASES_BY_CATEGORY[entry.category.id] ?? '',
  ].join(' ').toLowerCase();
  return {
    entry,
    haystack,
    compactHaystack: haystack.replace(COMPACT_SEARCH_CHARACTERS, ''),
  };
});

function getSearchTerms(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const simplifiedQuery = normalizedQuery.replace(/(?:公式|符号)/g, ' ').trim();
  return (simplifiedQuery || normalizedQuery).split(/\s+/).filter(Boolean).map((term) => ({
    term,
    compactTerm: term.replace(COMPACT_SEARCH_CHARACTERS, ''),
  }));
}

function matchesSearch(
  indexEntry: MathFormulaSearchIndexEntry,
  terms: ReturnType<typeof getSearchTerms>,
) {
  return terms.every(({ term, compactTerm }) => (
    indexEntry.haystack.includes(term) || indexEntry.compactHaystack.includes(compactTerm)
  ));
}

export function searchMathFormulaItems(query: string) {
  const terms = getSearchTerms(query);
  return terms.length
    ? mathFormulaSearchIndex
      .filter((indexEntry) => matchesSearch(indexEntry, terms))
      .map((indexEntry) => indexEntry.entry)
    : [];
}
