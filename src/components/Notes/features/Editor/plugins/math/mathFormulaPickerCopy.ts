export interface MathFormulaPickerCopy {
  categories: string;
  clear: string;
  input: string;
  insertLineBreak: string;
  preview: string;
}

export function getMathFormulaPickerCopy(): MathFormulaPickerCopy {
  const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
  return isChinese
    ? {
        categories: '公式分类',
        clear: '清空',
        input: '输入',
        insertLineBreak: '换行',
        preview: '渲染',
      }
    : {
        categories: 'Formula categories',
        clear: 'Clear',
        input: 'Input',
        insertLineBreak: 'New line',
        preview: 'Preview',
      };
}

export function isChineseFormulaPickerUi() {
  return document.documentElement.lang.toLowerCase().startsWith('zh');
}

export function localizeMathFormulaName(value: { name: string; nameZh: string }) {
  return isChineseFormulaPickerUi() ? value.nameZh : value.name;
}
