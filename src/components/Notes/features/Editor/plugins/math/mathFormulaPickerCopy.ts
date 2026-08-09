export interface MathFormulaPickerCopy {
  categories: string;
  clear: string;
  closeSearch: string;
  insertLineBreak: string;
  noResults: string;
  search: string;
  symbols: string;
  templates: string;
}

export function getMathFormulaPickerCopy(): MathFormulaPickerCopy {
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  return isChinese
    ? {
        categories: '公式分类',
        clear: '清空',
        closeSearch: '关闭搜索',
        insertLineBreak: '换行',
        noResults: '没有匹配的公式',
        search: '搜索符号、公式或 LaTeX 命令',
        symbols: '符号',
        templates: '公式模板',
      }
    : {
        categories: 'Formula categories',
        clear: 'Clear',
        closeSearch: 'Close search',
        insertLineBreak: 'New line',
        noResults: 'No matching formulas',
        search: 'Search symbols, formulas, or LaTeX commands',
        symbols: 'Symbols',
        templates: 'Templates',
      };
}

export function isChineseFormulaPickerUi() {
  return document.documentElement.lang.toLowerCase().startsWith('zh');
}

export function localizeMathFormulaName(value: { name: string; nameZh: string }) {
  return isChineseFormulaPickerUi() ? value.nameZh : value.name;
}
