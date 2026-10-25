/** 同一套实心几何图标，避免用表情或字符图案代替按钮美术。 */
const paths: Record<string, string> = {
  warning:
    '<path d="M10.1 3.3a2.2 2.2 0 0 1 3.8 0l9 15.4A2.2 2.2 0 0 1 21 22H3a2.2 2.2 0 0 1-1.9-3.3Z"/><path d="M11 8h2v7h-2Zm0 9h2v2h-2Z" fill="#fff5e8"/>',
  mountain: '<path d="m2 20 7-15 5 8 3-5 7 12ZM7 13l2-4 3 5-3-2Z"/>',
  arrow: '<path d="M3 10h13l-5-5 2-2 9 9-9 9-2-2 5-5H3Z"/>',
  back: '<path d="m14 3 2 2-7 7 7 7-2 2L5 12Z"/>',
  pause:
    '<rect x="5" y="3" width="5" height="18" rx="1"/><rect x="14" y="3" width="5" height="18" rx="1"/>',
  play: '<path d="M6 2v20l17-10Z"/>',
  gear: '<path d="m9 1 6 0 1 4 3-1 3 5-3 3 3 3-3 5-4-1-1 4H9l-1-4-4 1-3-5 3-3-3-3 3-5 4 1ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" fill-rule="evenodd"/>',
  star: '<path d="m12 1 3.3 7 7.7 1.1-5.5 5.3 1.3 7.6L12 18.4 5.2 22l1.3-7.6L1 9.1 7.7 8Z"/>',
  crystal:
    '<path d="M12 1 3 8l3 11 6 4 6-4 3-11ZM12 5l4 4-4 10-4-10Z" fill-rule="evenodd"/>',
  flag: '<path d="M4 2h2v21H4ZM7 3c4-4 8 4 14 0v11c-6 4-10-4-14 0Z"/>',
  check: '<path d="m2 12 3-3 5 5L20 3l3 3-13 14Z"/>',
  sound:
    '<path d="M2 9h5l6-6v18l-6-6H2ZM17 6c5 4 5 8 0 12l-2-2c3-3 3-5 0-8Z"/>',
  outfit: '<path d="m7 2-7 6 4 5 3-2v12h10V11l3 2 4-5-7-6c-1 4-9 4-10 0Z"/>',
  book: '<path d="M2 2h8l2 2 2-2h8v19h-8l-2 2-2-2H2Zm3 4v2h4V6Zm0 5v2h4v-2Zm10-5v2h4V6Zm0 5v2h4v-2Z" fill-rule="evenodd"/>',
  bolt: '<path d="m14 0-3 9h9L8 24l3-11H3Z"/>',
  reset: '<path d="M5 6a10 10 0 1 1-2 11l3-1a7 7 0 1 0 1-8l4 3H1V1Z"/>',
  fullscreen:
    '<path d="M1 1h8v3H4v5H1Zm14 0h8v8h-3V4h-5ZM1 15h3v5h5v3H1Zm19 0h3v8h-8v-3h5Z"/>',
};
export const icon = (name: string, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.mountain}</svg>`;
