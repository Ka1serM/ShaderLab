type MaximizableOptions = {
  active: boolean;
  target?: string;
};

const DEFAULT_TARGET = '[data-panel-maximizer]';
const DURATION = 240;
export function maximizable(node: HTMLElement, options: MaximizableOptions) {
  let active = false;
  let placeholder: Comment | null = null;
  let originalParent: ParentNode | null = null;
  let originalStyle = '';

  function animate(from: DOMRect, to: DOMRect) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    const translateX = from.left - to.left;
    const translateY = from.top - to.top;

    node.animate(
      [
        { transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`, transformOrigin: 'top left' },
        { transform: 'none', transformOrigin: 'top left' }
      ],
      { duration: DURATION, easing: 'cubic-bezier(.2, .8, .2, 1)' }
    );
  }

  function maximize(target: string) {
    const host = document.querySelector<HTMLElement>(target);
    if (!host || !node.parentNode) return;

    const from = node.getBoundingClientRect();
    originalParent = node.parentNode;
    placeholder = document.createComment('maximized-panel');
    originalParent.replaceChild(placeholder, node);
    originalStyle = node.style.cssText;

    node.dataset.maximized = 'true';
    node.style.cssText += ';position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:auto;background:var(--background);';
    host.appendChild(node);
    animate(from, node.getBoundingClientRect());
    active = true;
  }

  function minimize(animateTransition = true) {
    if (!active || !originalParent || !placeholder) return;

    const from = node.getBoundingClientRect();
    node.style.cssText = originalStyle;
    delete node.dataset.maximized;
    originalParent.insertBefore(node, placeholder);
    placeholder.remove();

    if (animateTransition) animate(from, node.getBoundingClientRect());

    active = false;
    placeholder = null;
    originalParent = null;
  }

  queueMicrotask(() => {
    if (options.active && !active) maximize(options.target ?? DEFAULT_TARGET);
  });

  return {
    update(next: MaximizableOptions) {
      if (next.active && !active) maximize(next.target ?? DEFAULT_TARGET);
      if (!next.active && active) minimize();
    },
    destroy() {
      minimize(false);
    }
  };
}
