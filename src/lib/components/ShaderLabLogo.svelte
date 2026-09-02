<script context="module" lang="ts">
  export type LogoAnimation = 'reveal' | 'hide' | 'spinner' | 'replay' | 'none';
</script>

<script lang="ts">
  export let animation: LogoAnimation = 'reveal';
  export let className = '';
  export let replay = 0;
</script>

{#key replay}
<svg
  class={`shaderlab-gizmo shaderlab-gizmo--${animation} ${className}`}
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
    {#if animation === 'hide' || animation === 'spinner' || animation === 'replay'}
      <mask id="shaderlab-logo-erase-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" />
        <use class="shaderlab-logo-eraser" href="#shaderlab-logo-main" />
        <use class="shaderlab-logo-eraser" href="#shaderlab-logo-orbit" />
        <use class="shaderlab-logo-eraser" href="#shaderlab-logo-tip-a" />
        <use class="shaderlab-logo-eraser" href="#shaderlab-logo-tip-b" />
      </mask>
    {/if}
  </defs>

  {#if animation === 'hide' || animation === 'spinner' || animation === 'replay'}
    <g mask="url(#shaderlab-logo-erase-mask)">
      <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-main" />
      <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-orbit" />
      <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-tip-a" />
      <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-tip-b" />
    </g>
  {:else}
    <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-main" />
    <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-orbit" />
    <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-tip-a" />
    <use class="shaderlab-logo-path shaderlab-logo-draw" href="#shaderlab-logo-tip-b" />
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

  .shaderlab-logo-draw {
    stroke-dasharray: 1 100;
    stroke-dashoffset: 0;
  }

  .shaderlab-gizmo--reveal .shaderlab-logo-draw { animation: shaderlab-logo-reveal 1100ms cubic-bezier(.65, 0, .35, 1) both; }
  .shaderlab-logo-eraser { fill: none; stroke: black; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 100; stroke-dashoffset: 1.1; }
  .shaderlab-gizmo--hide .shaderlab-logo-draw { stroke-dasharray: none; }
  .shaderlab-gizmo--hide .shaderlab-logo-eraser { animation: shaderlab-logo-erase 900ms cubic-bezier(.65, 0, .35, 1) both; }
  .shaderlab-gizmo--spinner .shaderlab-logo-draw { animation: shaderlab-logo-spinner-reveal 2200ms cubic-bezier(.65, 0, .35, 1) infinite; }
  .shaderlab-gizmo--spinner .shaderlab-logo-eraser { animation: shaderlab-logo-spinner-hide 2200ms cubic-bezier(.65, 0, .35, 1) infinite; }
  .shaderlab-gizmo--replay .shaderlab-logo-draw { animation: shaderlab-logo-replay 1800ms cubic-bezier(.65, 0, .35, 1) both; }
  .shaderlab-gizmo--replay .shaderlab-logo-eraser { animation: shaderlab-logo-replay-hide 1800ms cubic-bezier(.65, 0, .35, 1) both; }

  @keyframes shaderlab-logo-reveal { from { stroke-dashoffset: 1.1; } to { stroke-dashoffset: 0; } }
  @keyframes shaderlab-logo-erase { from { stroke-dashoffset: 1.1; } to { stroke-dashoffset: 0; } }
  @keyframes shaderlab-logo-spinner-reveal { 0%, 100% { stroke-dashoffset: 1.1; } 42%, 58% { stroke-dashoffset: 0; } }
  @keyframes shaderlab-logo-spinner-hide { 0%, 58% { stroke-dashoffset: 1.1; } 92%, 100% { stroke-dashoffset: 0; } }
  @keyframes shaderlab-logo-replay { 0%, 36% { stroke-dashoffset: 0; } 48%, 52% { stroke-dashoffset: 1.1; } 100% { stroke-dashoffset: 0; } }
  @keyframes shaderlab-logo-replay-hide { 0% { stroke-dashoffset: 1.1; } 36%, 48% { stroke-dashoffset: 0; } 52%, 100% { stroke-dashoffset: 1.1; } }

  @media (prefers-reduced-motion: reduce) {
    .shaderlab-gizmo--reveal .shaderlab-logo-draw,
    .shaderlab-gizmo--hide .shaderlab-logo-draw,
    .shaderlab-gizmo--spinner .shaderlab-logo-draw,
    .shaderlab-gizmo--replay .shaderlab-logo-draw {
      animation: none;
      stroke-dasharray: none;
      stroke-dashoffset: 0;
    }

  }
</style>
