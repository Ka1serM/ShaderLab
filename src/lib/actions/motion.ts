const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const FINE_POINTER = '(hover: hover) and (pointer: fine)';

function matchesQuery(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

export function prefersReducedMotion() {
  return matchesQuery(REDUCED_MOTION);
}

export function hasFinePointer() {
  return matchesQuery(FINE_POINTER);
}

export type RevealOptions = {
  disabled?: boolean;
  index?: number;
  step?: number;
  max?: number;
  threshold?: number;
};

const REVEAL_STEP = 55;
const REVEAL_MAX = 320;
const REVEAL_THRESHOLD = 0.15;

const BATCH_WINDOW = 120;

const revealOptions = new WeakMap<Element, RevealOptions>();
const observers = new Map<number, IntersectionObserver>();

let batchSlot = 0;
let batchStamp = 0;

function play(node: HTMLElement) {
  const options = revealOptions.get(node) ?? {};

  if (prefersReducedMotion()) {
    node.classList.add('is-revealed');
    return;
  }

  const slot = options.index ?? batchSlot++;
  const delay = Math.min(slot * (options.step ?? REVEAL_STEP), options.max ?? REVEAL_MAX);

  node.style.setProperty('--motion-delay', `${delay}ms`);
  node.classList.add('is-revealed');

  window.setTimeout(() => node.style.removeProperty('--motion-delay'), delay + 600);
}

function handleIntersections(entries: IntersectionObserverEntry[], observer: IntersectionObserver) {
  const now = performance.now();
  if (now - batchStamp > BATCH_WINDOW) batchSlot = 0;
  batchStamp = now;

  entries
    .filter((entry) => entry.isIntersecting)
    .sort((a, b) =>
      a.boundingClientRect.top - b.boundingClientRect.top ||
      a.boundingClientRect.left - b.boundingClientRect.left)
    .forEach((entry) => {
      observer.unobserve(entry.target);
      play(entry.target as HTMLElement);
    });
}

function observerFor(threshold: number) {
  let observer = observers.get(threshold);
  if (!observer) {
    observer = new IntersectionObserver(handleIntersections, { threshold, rootMargin: '0px 0px -4% 0px' });
    observers.set(threshold, observer);
  }
  return observer;
}

export function reveal(node: HTMLElement, options: RevealOptions = {}) {
  if (options.disabled) return {};

  node.classList.add('motion-reveal');
  revealOptions.set(node, options);

  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
    node.classList.add('is-revealed');
    return {};
  }

  let threshold = options.threshold ?? REVEAL_THRESHOLD;
  observerFor(threshold).observe(node);

  return {
    update(next: RevealOptions = {}) {
      revealOptions.set(node, next);

      const nextThreshold = next.threshold ?? REVEAL_THRESHOLD;
      if (nextThreshold === threshold || node.classList.contains('is-revealed')) return;

      observerFor(threshold).unobserve(node);
      threshold = nextThreshold;
      observerFor(threshold).observe(node);
    },
    destroy() {
      observerFor(threshold).unobserve(node);
      revealOptions.delete(node);
    }
  };
}

type TextSlot = { node: Text; text: string };

function textSlots(root: HTMLElement): TextSlot[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const slots: TextSlot[] = [];
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    const text = current.nodeValue ?? '';
    if (text.trim()) slots.push({ node: current as Text, text });
  }
  return slots;
}

function restoreText(slots: TextSlot[]) {
  for (const slot of slots) slot.node.nodeValue = slot.text;
}

function whenVisible(node: HTMLElement, threshold: number, run: () => void) {
  if (typeof IntersectionObserver === 'undefined') {
    run();
    return () => {};
  }

  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    run();
  }, { threshold });

  observer.observe(node);
  return () => observer.disconnect();
}

export type WriteInOptions = {
  step?: number;
  duration?: number;
  delay?: number;
  threshold?: number;
};

const WRITE_STEP = 34;
const WRITE_DURATION = 300;

export function writeIn(node: HTMLElement, options: WriteInOptions = {}) {
  const slots = textSlots(node);
  const label = slots.map((slot) => slot.text).join('');
  const original = node.innerHTML;
  const previousLabel = node.getAttribute('aria-label');
  let stopWatching = () => {};

  node.classList.add('motion-letters');

  if (prefersReducedMotion()) {
    node.classList.add('is-revealed');
    return {};
  }

  node.style.setProperty('--motion-letter-step', `${options.step ?? WRITE_STEP}ms`);
  node.style.setProperty('--motion-letter-duration', `${options.duration ?? WRITE_DURATION}ms`);
  node.style.setProperty('--motion-letter-delay', `${options.delay ?? 0}ms`);
  node.setAttribute('aria-label', label);

  let index = 0;
  for (const slot of slots) {
    const fragment = document.createDocumentFragment();
    for (const char of slot.text) {
      if (!char.trim()) {
        fragment.append(char);
        continue;
      }
      const letter = document.createElement('span');
      letter.className = 'motion-letter';
      letter.setAttribute('aria-hidden', 'true');
      letter.style.setProperty('--motion-letter-index', String(index++));
      letter.textContent = char;
      fragment.append(letter);
    }
    slot.node.replaceWith(fragment);
  }

  stopWatching = whenVisible(node, options.threshold ?? 0.2, () => node.classList.add('is-revealed'));

  return {
    destroy() {
      stopWatching();
      node.innerHTML = original;
      if (previousLabel === null) node.removeAttribute('aria-label');
      else node.setAttribute('aria-label', previousLabel);
    }
  };
}

export type ScrambleOptions = {
  speed?: number;
  delay?: number;
  churn?: number;
  charset?: string;
  threshold?: number;
};

const SCRAMBLE_SPEED = 32;
const SCRAMBLE_CHURN = 45;
const SCRAMBLE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>[]{}()/\\|*+=#%&$~^';

export function scramble(node: HTMLElement, options: ScrambleOptions = {}) {
  const slots = textSlots(node);
  const total = slots.reduce((count, slot) => count + slot.text.length, 0);
  const noise: string[] = [];
  let frame = 0;
  let lastChurn = 0;
  let stopWatching = () => {};

  function draw(elapsed: number) {
    const speed = options.speed ?? SCRAMBLE_SPEED;
    const delay = options.delay ?? 0;
    const charset = options.charset ?? SCRAMBLE_CHARSET;

    const reroll = elapsed - lastChurn >= (options.churn ?? SCRAMBLE_CHURN);
    if (reroll) lastChurn = elapsed;

    let index = 0;
    for (const slot of slots) {
      let out = '';
      for (const char of slot.text) {
        if (!char.trim() || elapsed >= delay + index * speed) {
          out += char;
        } else {
          if (reroll || !noise[index]) noise[index] = charset[(Math.random() * charset.length) | 0];
          out += noise[index];
        }
        index++;
      }
      slot.node.nodeValue = out;
    }
  }

  function finish() {
    cancelAnimationFrame(frame);
    restoreText(slots);
  }

  function start() {
    node.classList.add('is-revealed');

    const settled = (options.delay ?? 0) + total * (options.speed ?? SCRAMBLE_SPEED);
    let begin = -1;

    function step(now: number) {
      if (begin < 0) begin = now;
      const elapsed = now - begin;
      if (elapsed >= settled) {
        finish();
        return;
      }
      draw(elapsed);
      frame = requestAnimationFrame(step);
    }

    frame = requestAnimationFrame(step);
  }

  if (prefersReducedMotion()) {
    node.classList.add('is-revealed');
    return {};
  }

  draw(0);
  stopWatching = whenVisible(node, options.threshold ?? 0.2, start);

  return {
    destroy() {
      stopWatching();
      finish();
    }
  };
}

export type TiltOptions = {
  rotation?: number;
  depth?: number;
  disabled?: boolean;
};

const TILT_ROTATION = 6;
const TILT_DEPTH = 900;

export function tilt(node: HTMLElement, options: TiltOptions = {}) {
  let settings: TiltOptions = { ...options };
  let frame = 0;

  if (settings.disabled) return {};

  node.classList.add('motion-tilt');
  node.style.setProperty('--tilt-depth', `${settings.depth ?? TILT_DEPTH}px`);

  function allowed(event?: PointerEvent) {
    if (settings.disabled || prefersReducedMotion() || !hasFinePointer()) return false;
    return !event || event.pointerType === 'mouse';
  }

  function onPointerEnter() {
    node.style.setProperty('--motion-delay', '0ms');
  }

  function onPointerMove(event: PointerEvent) {
    if (!allowed(event)) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const bounds = node.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;

      const rotation = settings.rotation ?? TILT_ROTATION;
      const x = (event.clientX - bounds.left) / bounds.width - 0.5;
      const y = (event.clientY - bounds.top) / bounds.height - 0.5;

      node.dataset.tilting = 'true';
      node.style.setProperty('--tilt-rx', `${(-y * rotation).toFixed(2)}deg`);
      node.style.setProperty('--tilt-ry', `${(x * rotation * 1.3).toFixed(2)}deg`);
    });
  }

  function reset() {
    cancelAnimationFrame(frame);
    delete node.dataset.tilting;
    node.style.setProperty('--tilt-rx', '0deg');
    node.style.setProperty('--tilt-ry', '0deg');
  }

  node.addEventListener('pointerenter', onPointerEnter);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerleave', reset);
  node.addEventListener('pointercancel', reset);
  node.addEventListener('blur', reset);

  return {
    update(next: TiltOptions = {}) {
      settings = { ...next };
      node.style.setProperty('--tilt-depth', `${settings.depth ?? TILT_DEPTH}px`);
      if (settings.disabled) reset();
    },
    destroy() {
      reset();
      node.removeEventListener('pointerenter', onPointerEnter);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerleave', reset);
      node.removeEventListener('pointercancel', reset);
      node.removeEventListener('blur', reset);
    }
  };
}
