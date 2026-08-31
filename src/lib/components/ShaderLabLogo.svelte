<script context="module" lang="ts">
  export type LogoAnimation = 'reveal' | 'spinner' | 'none';
</script>

<script lang="ts">
  export let animation: LogoAnimation = 'reveal';
  export let className = '';
  export let replay = 0;
</script>

{#key replay}
<svg
  class={`shaderlab-gizmo shaderlab-gizmo--${animation} ${animation === 'reveal' && replay > 0 ? 'shaderlab-gizmo--replay' : ''} ${className}`}
  viewBox="0 0 24 24"
  fill="none"
  shape-rendering="geometricPrecision"
  aria-hidden="true"
>
  <defs>
    <path id="shaderlab-logo-main" pathLength="1" d="M16.466 7.5C15.643 4.237 13.952 2 12 2 9.239 2 7 6.477 7 12s2.239 10 5 10c.342 0 .677-.069 1-.2" />
    <path id="shaderlab-logo-orbit" pathLength="1" d="M21.8 11C20.873 8.718 16.838 7 12 7 6.477 7 2 9.239 2 12s4.477 5 10 5c2.726 0 5.196-.545 7-1.43" />
    <path id="shaderlab-logo-tip-a" pathLength="1" d="M19.008 15.567 15.194 13.707" />
    <path id="shaderlab-logo-tip-b" pathLength="1" d="M19.008 15.567 17.148 19.381" />

    {#if animation === 'spinner' || (animation === 'reveal' && replay > 0)}
      <mask id="shaderlab-logo-long-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" />
        <use class="shaderlab-logo-eraser-long" href="#shaderlab-logo-main" />
        <use class="shaderlab-logo-eraser-long" href="#shaderlab-logo-orbit" />
      </mask>

      <mask id="shaderlab-logo-tip-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" />
        <use class="shaderlab-logo-eraser-tip" href="#shaderlab-logo-tip-a" />
        <use class="shaderlab-logo-eraser-tip" href="#shaderlab-logo-tip-b" />
      </mask>
    {/if}
  </defs>

  {#if animation === 'spinner' || (animation === 'reveal' && replay > 0)}
    <g mask="url(#shaderlab-logo-long-mask)">
      <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-main" />
      <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-orbit" />
    </g>
    <g mask="url(#shaderlab-logo-tip-mask)">
      <use class="shaderlab-logo-path shaderlab-logo-draw shaderlab-logo-draw-tip" href="#shaderlab-logo-tip-a" />
      <use class="shaderlab-logo-path shaderlab-logo-draw shaderlab-logo-draw-tip" href="#shaderlab-logo-tip-b" />
    </g>
  {:else}
    <use class="shaderlab-logo-path" href="#shaderlab-logo-main" />
    <use class="shaderlab-logo-path" href="#shaderlab-logo-orbit" />
    <use class="shaderlab-logo-path shaderlab-logo-tip" href="#shaderlab-logo-tip-a" />
    <use class="shaderlab-logo-path shaderlab-logo-tip" href="#shaderlab-logo-tip-b" />
  {/if}
</svg>
{/key}

<style>
  .shaderlab-gizmo {
    display: block;
    overflow: visible;
  }

  .shaderlab-logo-path {
    fill: none;
    stroke: var(--app-red, #bf2732);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .shaderlab-gizmo--none .shaderlab-logo-path {
    stroke-dasharray: none;
    stroke-dashoffset: 0;
  }

  .shaderlab-gizmo--reveal .shaderlab-logo-path,
  .shaderlab-gizmo--spinner .shaderlab-logo-draw {
    stroke-dasharray: 1 100;
    stroke-dashoffset: 1.1;
    animation: shaderlab-logo-grow 2200ms cubic-bezier(.65, 0, .35, 1) both;
  }

  .shaderlab-gizmo--reveal .shaderlab-logo-tip,
  .shaderlab-gizmo--replay .shaderlab-logo-draw-tip {
    animation-name: shaderlab-logo-grow-tip;
    animation-timing-function: cubic-bezier(.16, 1, .3, 1);
  }

  .shaderlab-gizmo--spinner .shaderlab-logo-draw-tip {
    animation-name: shaderlab-logo-spinner-grow-tip;
    animation-timing-function: cubic-bezier(.65, 0, .35, 1);
  }

  .shaderlab-gizmo--spinner .shaderlab-logo-draw,
  .shaderlab-gizmo--spinner .shaderlab-logo-eraser-long,
  .shaderlab-gizmo--spinner .shaderlab-logo-eraser-tip {
    stroke-dasharray: 1 100;
  }

  .shaderlab-gizmo--spinner .shaderlab-logo-draw {
    stroke: var(--app-red, #bf2732);
    stroke-dashoffset: 1.1;
    animation-name: shaderlab-logo-spinner-grow;
    animation-iteration-count: infinite;
  }

  .shaderlab-gizmo--spinner .shaderlab-logo-draw-tip {
    animation-name: shaderlab-logo-spinner-grow-tip;
  }

  .shaderlab-gizmo--replay .shaderlab-logo-draw,
  .shaderlab-gizmo--replay .shaderlab-logo-eraser-long,
  .shaderlab-gizmo--replay .shaderlab-logo-eraser-tip {
    stroke-dasharray: 1 100;
  }

  .shaderlab-gizmo--replay .shaderlab-logo-draw {
    stroke: var(--app-red, #bf2732);
    animation: shaderlab-logo-replay-grow 2200ms cubic-bezier(.65, 0, .35, 1) both;
  }

  .shaderlab-gizmo--replay .shaderlab-logo-draw-tip {
    animation-name: shaderlab-logo-replay-grow-tip;
  }

  .shaderlab-gizmo--spinner .shaderlab-logo-eraser-long,
  .shaderlab-gizmo--spinner .shaderlab-logo-eraser-tip {
    fill: none;
    stroke: black;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dashoffset: 1.1;
    animation: shaderlab-logo-spinner-erase 2200ms cubic-bezier(.65, 0, .35, 1) infinite;
  }

  .shaderlab-gizmo--spinner .shaderlab-logo-eraser-tip {
    animation-name: shaderlab-logo-spinner-erase-tip;
    animation-timing-function: cubic-bezier(.65, 0, .35, 1);
  }

  .shaderlab-gizmo--replay .shaderlab-logo-eraser-long,
  .shaderlab-gizmo--replay .shaderlab-logo-eraser-tip {
    fill: none;
    stroke: black;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: shaderlab-logo-replay-erase 2200ms cubic-bezier(.65, 0, .35, 1) both;
  }

  .shaderlab-gizmo--replay .shaderlab-logo-eraser-tip {
    animation-name: shaderlab-logo-replay-erase-tip;
    animation-timing-function: cubic-bezier(.16, 1, .3, 1);
  }

  @keyframes shaderlab-logo-draw {
    to { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-grow {
    0% { stroke-dashoffset: 1.1; }
    42%, 100% { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-grow-tip {
    0%, 30% { stroke-dashoffset: 1.1; }
    46%, 100% { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-spinner-grow {
    0% { stroke-dashoffset: 1.1; }
    42%, 88% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 1.1; }
  }

  @keyframes shaderlab-logo-spinner-grow-tip {
    0%, 30% { stroke-dashoffset: 1.1; }
    46%, 99% { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 1.1; }
  }

  @keyframes shaderlab-logo-spinner-erase {
    0%, 58% { stroke-dashoffset: 1.1; }
    88%, 100% { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-spinner-erase-tip {
    0%, 58% { stroke-dashoffset: 1.1; }
    100% { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-replay-grow {
    0%, 38% { stroke-dashoffset: 0; }
    45%, 52% { stroke-dashoffset: 1.1; }
    86%, 100% { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-replay-grow-tip {
    0%, 44% { stroke-dashoffset: 0; }
    51%, 58% { stroke-dashoffset: 1.1; }
    94%, 100% { stroke-dashoffset: 0; }
  }

  @keyframes shaderlab-logo-replay-erase {
    0% { stroke-dashoffset: 1.1; }
    38% { stroke-dashoffset: 0; }
    45%, 100% { stroke-dashoffset: 1.1; }
  }

  @keyframes shaderlab-logo-replay-erase-tip {
    0% { stroke-dashoffset: 1.1; }
    44% { stroke-dashoffset: 0; }
    51%, 100% { stroke-dashoffset: 1.1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .shaderlab-gizmo--reveal .shaderlab-logo-path,
    .shaderlab-gizmo--spinner .shaderlab-logo-draw,
    .shaderlab-gizmo--replay .shaderlab-logo-draw {
      animation: none;
      stroke-dasharray: none;
      stroke-dashoffset: 0;
    }

    .shaderlab-gizmo--spinner .shaderlab-logo-eraser-long,
    .shaderlab-gizmo--spinner .shaderlab-logo-eraser-tip,
    .shaderlab-gizmo--replay .shaderlab-logo-eraser-long,
    .shaderlab-gizmo--replay .shaderlab-logo-eraser-tip {
      display: none;
    }
  }
</style>
