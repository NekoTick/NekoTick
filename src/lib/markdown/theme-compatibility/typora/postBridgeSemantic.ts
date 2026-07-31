import {
  type CssLines,
  cssRule,
  important,
  varValue,
} from './postBridgeSelectors';

export function buildTyporaColumnBridge(write: string): CssLines {
  return [
    ...cssRule(`${write} :is(.vlook-column-marker, .vlook-column-gap)`, [
      important('visibility', 'hidden'),
      important('height', '0'),
      important('min-height', '0'),
      important('margin', '0'),
      important('padding', '0'),
      important('border', '0'),
      important('overflow', 'hidden'),
    ]),
    ...cssRule(`${write} .vlook-column-quote`, [
      important('display', 'inline-block'),
      important('vertical-align', 'top'),
    ]),
    ...cssRule(`${write} .vlook-column-2.vlook-column-quote`, [
      important('min-width', '49%'),
      important('max-width', '49%'),
    ]),
    ...cssRule(`${write} .vlook-column-3.vlook-column-quote`, [
      important('min-width', '32%'),
      important('max-width', '32%'),
    ]),
    ...cssRule(`${write} .vlook-column-4.vlook-column-quote`, [
      important('min-width', '23.5%'),
      important('max-width', '23.5%'),
    ]),
    ...cssRule(`${write} .vlook-column-5.vlook-column-quote`, [
      important('min-width', '19.2%'),
      important('max-width', '19.2%'),
    ]),
    ...cssRule(`${write} .vlook-column-quote:not(.vlook-column-first)`, [
      important('margin-inline-start', '2%'),
    ]),
    ...cssRule(`${write} .vlook-column-5.vlook-column-quote:not(.vlook-column-first)`, [
      important('margin-inline-start', '1%'),
    ]),
    ...cssRule(`${write} .vlook-column-list`, [
      important('column-gap', 'var(--typora-vlook-column-gap)'),
      important('column-rule', 'var(--typora-vlook-column-rule)'),
    ]),
    ...cssRule(`${write} .vlook-column-2.vlook-column-list`, [
      important('column-count', '2'),
    ]),
    ...cssRule(`${write} .vlook-column-3.vlook-column-list`, [
      important('column-count', '3'),
    ]),
    ...cssRule(`${write} .vlook-column-4.vlook-column-list`, [
      important('column-count', '4'),
    ]),
    ...cssRule(`${write} .vlook-column-5.vlook-column-list`, [
      important('column-count', '5'),
    ]),
    ...cssRule(`${write} .vlook-column-list > li`, [
      important('break-inside', 'avoid'),
    ]),
  ];
}

export function buildTyporaCheckboxBridge(write: string): CssLines {
  const checkboxBorder = [
    varValue('--typora-vlook-checkbox-border-width', 'var(--vlaina-border-width-2)'),
    'solid',
    'var(--vlook-token-fg, var(--a-c, var(--typora-link-color)))',
  ].join(' ');

  const checkedBoxShadow = [
    'inset 0 0 0',
    varValue('--typora-vlook-checkbox-mark-size', 'var(--vlaina-space-4px)'),
    'var(--db, var(--typora-page-bg))',
  ].join(' ');

  return [
    ...cssRule(`${write} .v-tbl-col-fmt-chkbox::before`, [
      important('content', 'none'),
    ]),
    ...cssRule(`${write} .v-svg-input-checkbox`, [
      important('position', 'relative'),
      important('display', 'inline-flex'),
      important('align-items', 'center'),
      important('justify-content', 'center'),
      important('width', 'var(--typora-vlook-checkbox-size, var(--vlaina-size-16px))'),
      important('height', 'var(--typora-vlook-checkbox-size, var(--vlaina-size-16px))'),
      important('color', 'transparent'),
      important('font-size', '0'),
      important('line-height', '0'),
      important('vertical-align', 'middle'),
      important('overflow', 'hidden'),
    ]),
    ...cssRule(`${write} .v-svg-input-checkbox::before`, [
      important('content', '""'),
      important('display', 'block'),
      important('width', '100%'),
      important('height', '100%'),
      important('box-sizing', 'border-box'),
      important('border', checkboxBorder),
      important('border-radius', 'var(--typora-vlook-checkbox-radius, var(--vlaina-radius-025rem))'),
      important('background', 'var(--db, var(--typora-table-bg, transparent))'),
    ]),
    ...cssRule(`${write} .v-svg-input-checkbox[data-vlook-checkbox='checked']::before`, [
      important('background', 'var(--ac-gn, var(--typora-link-color))'),
      important('border-color', 'var(--ac-gn, var(--typora-link-color))'),
      important('box-shadow', checkedBoxShadow),
    ]),
    ...cssRule(`${write} .v-svg-input-checkbox[data-vlook-checkbox='pending']::before`, [
      important('background', 'var(--ac-gy, var(--df-a, currentColor))'),
      important('border-color', 'var(--ac-gy, var(--df-a, currentColor))'),
    ]),
    ...cssRule(`${write} .v-svg-input-checkbox[data-vlook-checkbox='failed']::before`, [
      important('background', 'var(--ac-rd, var(--typora-link-color))'),
      important('border-color', 'var(--ac-rd, var(--typora-link-color))'),
    ]),
  ];
}

export function buildTyporaInlineTokenBridge(write: string): CssLines {
  return [
    ...cssRule(
      `${write} :is(.v-tag, .editor-tag-token, .v-badge-name, .v-badge-value, .v-stepwise, .v-coating)`,
      [
        important('max-width', '100%'),
        important('white-space', 'break-spaces'),
        important('overflow-wrap', 'break-word'),
        important('word-break', 'normal'),
      ],
    ),
    ...cssRule(`${write} .editor-tag-token`, [
      important('display', 'inline'),
      important('white-space', 'normal'),
      important('overflow-wrap', 'break-word'),
      important('word-break', 'normal'),
    ]),
  ];
}
