export interface MathFormulaPickerCopy {
  categories: string;
  clear: string;
  input: string;
  insertLineBreak: string;
  noResults: string;
  preview: string;
  search: string;
}

export function getMathFormulaPickerCopy(): MathFormulaPickerCopy {
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  return isChinese
    ? {
        categories: '公式分类',
        clear: '清空',
        input: '输入',
        insertLineBreak: '换行',
        noResults: '没有匹配的公式',
        preview: '渲染',
        search: '搜索符号、公式或 LaTeX 命令',
      }
    : {
        categories: 'Formula categories',
        clear: 'Clear',
        input: 'Input',
        insertLineBreak: 'New line',
        noResults: 'No matching formulas',
        preview: 'Preview',
        search: 'Search symbols, formulas, or LaTeX commands',
      };
}

export function isChineseFormulaPickerUi() {
  return document.documentElement.lang.toLowerCase().startsWith('zh');
}

export function localizeMathFormulaName(value: { name: string; nameZh: string }) {
  return isChineseFormulaPickerUi() ? value.nameZh : value.name;
}
