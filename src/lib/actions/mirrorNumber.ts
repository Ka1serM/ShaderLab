export interface MirrorNumberOptions {
  value: number;
  onValueChange?: () => void;
}

const format = (value: number) => String(Math.round(value * 1000) / 1000);

export function mirrorNumber(node: HTMLInputElement, options: MirrorNumberOptions) {
  let { value } = options;
  const show = () => {
    if (document.activeElement === node) return;
    const text = format(value);
    if (node.value !== text) node.value = text;
  };
  node.addEventListener('blur', show);
  show();
  return {
    update(next: MirrorNumberOptions) {
      if (Math.abs(next.value - value) >= 0.0005) next.onValueChange?.();
      value = next.value;
      show();
    },
    destroy() {
      node.removeEventListener('blur', show);
    }
  };
}

export function enteredNumber(input: HTMLInputElement) {
  if (input.value.trim() === '') return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? value : null;
}
