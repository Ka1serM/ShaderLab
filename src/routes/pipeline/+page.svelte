<script lang="ts">
  import ArrowRight from 'phosphor-svelte/lib/ArrowRightIcon';
  import PipelineViewport from '$lib/components/PipelineViewport.svelte';

  type Stage = {
    title: string;
    space: string;
    shader: string;
    scene: number;
    summary: string;
    input: string;
    output: string;
    detail: string;
  };

  const lectureStages: Stage[] = [
    {
      title: 'Geometry', space: 'Model space · origin', shader: 'Geometry', scene: 0,
      summary: 'Der Cube startet an seinem lokalen Ursprung.',
      input: 'v, vn und f aus dem Mesh', output: 'Geometrie in Object Coordinates',
      detail: 'Die Vorlesung beschreibt die Geometrie über Vertex-Positionen (v), Vertex-Normalen (vn) und Flächen (f).'
    },
    {
      title: 'Transformation', space: 'World space', shader: 'Model matrix', scene: 1,
      summary: 'Das Objekt wird in die Welt transformiert.',
      input: 'Object Coordinates', output: 'World Coordinates',
      detail: 'Modellmatrix aus Translation, Rotation und Skalierung positioniert den Cube in der Szene.'
    },
    {
      title: 'Illumination / shading', space: 'World / view space', shader: 'Per vertex', scene: 2,
      summary: 'Lokale Illumination wird pro Vertex bestimmt.',
      input: 'Normale, Licht-, Kamera- und Materialwerte', output: 'Beleuchtungswerte pro Vertex',
      detail: 'Die Vorlesung trennt Illumination und Shading: Die Beleuchtung nutzt Normalen sowie Licht- und Kameravektor.'
    },
    {
      title: 'Camera space', space: 'View space', shader: 'View matrix', scene: 3,
      summary: 'Die Kamera liegt im Ursprung und blickt nach −Z.',
      input: 'World Coordinates', output: 'View Coordinates',
      detail: 'Die inverse Kameratransformation wird auf die Szene angewendet. Der Cube wird in das Kamerakoordinatensystem überführt.'
    },
    {
      title: 'Projection', space: 'Clip space', shader: 'Per vertex', scene: 4,
      summary: 'Die Projektionsmatrix erzeugt Clip Coordinates.',
      input: 'View Coordinates', output: 'Clip Coordinates',
      detail: 'Die Division durch die w-Komponente erzeugt die Projektion; danach liegen normierte Koordinaten vor.'
    },
    {
      title: 'Clipping', space: 'Clip / NDC space', shader: 'Fixed function', scene: 5,
      summary: 'Polygone werden gegen das Viewing Frustum geclippt.',
      input: 'Clip Coordinates', output: 'Sichtbare, geclippte Primitive',
      detail: '3D-Objekte werden am Ansichtvolumen geclippt, bevor sie rasterisiert werden.'
    },
    {
      title: 'Viewport mapping', space: 'Screen space', shader: 'Fixed function', scene: 6,
      summary: 'Das normierte Sichtquadrat wird auf das Fenster abgebildet.',
      input: 'Normierte Koordinaten', output: 'Pixelkoordinaten im Viewport',
      detail: 'Die Viewporttransformation rechnet normierte Werte auf die endgültige Fenstergröße um.'
    },
    {
      title: 'Rasterization', space: 'Fragments', shader: 'Fixed function', scene: 7,
      summary: 'Dreiecke werden in diskrete Fragmente zerlegt.',
      input: 'Primitive in Screen Space', output: 'Fragmente',
      detail: 'Rastering überführt die kontinuierliche Geometrie in die diskreten Bildpunkte des Rasters.'
    },
    {
      title: 'Image', space: '2D image', shader: 'Image', scene: 9,
      summary: 'Die Pipeline endet im 2D Image.',
      input: 'Rasterisierte Werte', output: '2D Image',
      detail: 'Die vereinfachte Vorlesungspipeline führt von 3D-Geometrie über Rastering zum Bild.'
    }
  ];

  const programmableStages: Stage[] = [
    lectureStages[0]!,
    {
      title: 'Vertex shader', space: 'Per vertex', shader: 'Vertex shader', scene: 1,
      summary: 'Transformiert Positionen und bereitet Werte für die Interpolation vor.',
      input: 'Object Coordinates, Normalen und Attribute', output: 'World-Position und Varyings',
      detail: 'Der Vertex-Shader transformiert die Objektposition. Normalen sowie Licht- und View-Vektoren werden als Varyings vorbereitet – noch nicht beleuchtet.'
    },
    {
      title: 'View transform', space: 'View space', shader: 'Vertex shader', scene: 3,
      summary: 'Die View-Matrix transformiert die Welt in das Kamerasystem.',
      input: 'World Coordinates', output: 'View Coordinates',
      detail: 'Die Kamera liegt im Ursprung und blickt nach −Z; die Szene wird mit der inversen Kameratransformation bewegt.'
    },
    {
      title: 'Projection', space: 'Clip space', shader: 'Vertex shader', scene: 4,
      summary: 'Die Vertex-Position wird in Clip Coordinates geschrieben.',
      input: 'View Coordinates', output: 'gl_Position',
      detail: 'Die Projektionsmatrix ist Teil des Vertex-Shaders. Die perspektivische Division folgt in der festen Pipeline.'
    },
    lectureStages[5]!,
    lectureStages[6]!,
    {
      title: 'Rasterization', space: 'Fragments', shader: 'Fixed function', scene: 7,
      summary: 'Die GPU erzeugt Fragmente und interpoliert die Varyings.',
      input: 'Dreiecke und Vertex-Varyings', output: 'Interpolierte Vektoren pro Fragment',
      detail: 'Normalen sowie Licht- und View-Vektoren werden zwischen den Vertices interpoliert. Im Fragment-Shader müssen sie normalerweise erneut normalisiert werden.'
    },
    {
      title: 'Fragment shading', space: 'Per fragment', shader: 'Fragment shader', scene: 8,
      summary: 'Illumination und Shading werden pro Fragment berechnet.',
      input: 'Interpolierte Normalen, Licht- und View-Vektoren', output: 'Fragmentfarbe',
      detail: 'Hier findet die Beleuchtungsrechnung statt: Die interpolierten Vektoren werden normalisiert und etwa mit Lambert oder Phong ausgewertet.'
    },
    lectureStages[8]!
  ];

  let pipelineMode: 'lecture' | 'programmable' = 'lecture';
  let selected = 0;
  let hoveredStage: number | null = null;
  $: stages = pipelineMode === 'lecture' ? lectureStages : programmableStages;
  $: stage = stages[selected]!;

  function previewStage(index: number) {
    selected = index;
    hoveredStage = index;
  }

  function switchPipeline(mode: 'lecture' | 'programmable') {
    pipelineMode = mode;
    selected = 0;
    hoveredStage = null;
  }

</script>

<svelte:head>
  <title>Graphics Pipeline · ShaderLab</title>
  <meta name="description" content="An interactive overview of the real-time graphics pipeline, from geometry to the final image." />
</svelte:head>

<main class="pipeline-page" aria-labelledby="pipeline-title">
  <div class="pipeline-content">
    <header class="pipeline-toolbar">
      <h1 id="pipeline-title">The Graphics Pipeline</h1>
      <div class="pipeline-mode-switch" aria-label="Pipeline-Modus">
        <button class:active={pipelineMode === 'lecture'} onclick={() => switchPipeline('lecture')}>Vorlesung</button>
        <button class:active={pipelineMode === 'programmable'} onclick={() => switchPipeline('programmable')}>Programmable</button>
      </div>
    </header>

    <section class="pipeline-preview" aria-label="Visualisierung der Pipeline-Stufe">
      {#if hoveredStage !== null}
        <PipelineViewport stage={stage.scene} space={stage.space} />
      {/if}
    </section>

    <section class="pipeline-track" aria-label="Graphics pipeline stages" onmouseleave={() => hoveredStage = null}>
    {#each stages as item, index}
      <button
        class:active={index === hoveredStage}
        class:shader-stage={pipelineMode === 'programmable' && (item.shader === 'Vertex shader' || item.shader === 'Fragment shader')}
        class="pipeline-stage"
        aria-pressed={index === selected}
        onmouseenter={() => previewStage(index)}
        onfocus={() => previewStage(index)}
        onclick={() => previewStage(index)}
      >
        <span class="stage-number">{String(index + 1).padStart(2, '0')}</span>
        <strong>{item.title}</strong>
        <small>{item.space}</small>
      </button>
      {#if index < stages.length - 1}<ArrowRight class="pipeline-arrow" aria-hidden="true" size={18} />{/if}
    {/each}
  </section>

    <section class="pipeline-explanation" aria-live="polite">
      {#if hoveredStage !== null}
      <div class="stage-explanation">
        <span>Stage {String(hoveredStage + 1).padStart(2, '0')} · {stage.shader}</span>
        <h2>{stage.title}</h2>
        <p>{stage.summary}</p>
        <dl>
          <div><dt>Input</dt><dd>{stage.input}</dd></div>
          <div><dt>Output</dt><dd>{stage.output}</dd></div>
        </dl>
      </div>
      {/if}
    </section>
  </div>
</main>

<style>
  .pipeline-page { width: 100%; height: 100%; min-height: 0; flex: 1 1 0; box-sizing: border-box; overflow: hidden; }
  .pipeline-track { display: flex; width: fit-content; max-width: 100%; align-self: center; align-items: stretch; min-width: 0; overflow-x: auto; padding: .35rem 0 .55rem; scrollbar-color: var(--app-line) transparent; }
  .pipeline-stage { position: relative; display: grid; width: 6.35rem; min-width: 6.35rem; min-height: 4.85rem; align-content: start; gap: .2rem; border: 1px solid color-mix(in srgb, var(--app-line) 70%, transparent); border-radius: var(--radius-sm); background: var(--card); padding: .55rem; text-align: left; color: var(--foreground); transition: transform var(--motion-base) var(--motion-emphasized), border-color var(--motion-fast), background-color var(--motion-fast), box-shadow var(--motion-fast); }
  .pipeline-stage:hover, .pipeline-stage:focus-visible { z-index: 1; border-color: var(--app-red); outline: none; transform: translateY(-.16rem); }
  .pipeline-stage.active { border-color: var(--app-red); background: color-mix(in srgb, var(--app-red) 9%, var(--card)); box-shadow: 0 .5rem 1.1rem rgb(0 0 0 / 12%); }
  .pipeline-stage.shader-stage::after { position: absolute; top: .55rem; right: .55rem; width: .35rem; height: .35rem; border-radius: 50%; background: var(--app-red); content: ''; }
  .stage-number { color: var(--muted-foreground); font-family: ui-monospace, monospace; font-size: .59rem; }
  .pipeline-stage strong { font-size: .78rem; line-height: 1.1; } .pipeline-stage small { color: var(--muted-foreground); font-size: .59rem; line-height: 1.2; }
  :global(.pipeline-arrow) { flex: none; align-self: center; margin: 0 .18rem; color: var(--muted-foreground); }
  dd { margin: .25rem 0 0; color: var(--foreground); font-size: .72rem; line-height: 1.35; }
  @keyframes pipeline-rise { from { opacity: .7; transform: translateY(34vh); } to { opacity: 1; transform: translateY(0); } }
  @keyframes explanation-unfold { from { opacity: 0; transform: translateY(1.25rem) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  /* Flexible page layout: toolbar, pipeline strip, then an optional detail area. */
  .pipeline-content { display: flex; width: min(100%, 88rem); height: 100%; min-height: 0; flex-direction: column; margin: 0 auto; padding: clamp(.65rem, 1.5vw, 1.25rem); }
  .pipeline-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .65rem; padding-bottom: .4rem; }
  .pipeline-toolbar h1 { margin: 0; font-size: .8rem; font-weight: 600; letter-spacing: -.015em; }
  .pipeline-mode-switch { display: inline-flex; align-items: center; gap: .2rem; margin-left: auto; border: 1px solid var(--app-line); border-radius: .45rem; background: color-mix(in srgb, var(--background) 90%, transparent); padding: .2rem; font-size: .68rem; }
  .pipeline-mode-switch button { border-radius: .3rem; padding: .28rem .4rem; color: var(--muted-foreground); font-weight: 600; }
  .pipeline-mode-switch button:hover, .pipeline-mode-switch button:focus-visible { color: var(--foreground); outline: none; }
  .pipeline-mode-switch button.active { background: color-mix(in srgb, var(--app-red) 16%, transparent); color: var(--foreground); }
  .pipeline-track { flex: none; }
  .pipeline-preview { display: flex; width: min(100%, 66rem); min-height: 0; flex: 1 1 0; align-self: center; align-items: stretch; }
  .pipeline-preview :global(.pipeline-viewport) { min-height: 0; height: 100%; }
  .pipeline-explanation { display: flex; width: min(100%, 46rem); min-height: 0; flex: 1 1 0; align-self: center; align-items: flex-start; }
  .stage-explanation { display: flex; width: 100%; flex-direction: column; align-self: stretch; border: 1px solid var(--app-line); border-left: .2rem solid var(--app-red); border-radius: var(--radius-md); background: var(--card); padding: clamp(.8rem, 1.5vw, 1.1rem); animation: explanation-unfold .35s var(--motion-emphasized) both; }
  .stage-explanation > span, .stage-explanation dt { color: var(--app-red); font-size: .66rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .stage-explanation h2 { margin: .35rem 0 .5rem; font-size: clamp(1.1rem, 1.8vw, 1.45rem); letter-spacing: -.045em; }
  .stage-explanation p { margin: 0; color: var(--muted-foreground); font-size: .8rem; line-height: 1.45; }
  .stage-explanation dl { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; margin: .75rem 0 0; padding-top: .7rem; }
  .stage-explanation dl div { border-top: 1px solid var(--app-line); padding-top: .5rem; }
  @media (max-width: 52rem) { .pipeline-content { height: auto; min-height: 100%; } .pipeline-toolbar { flex-wrap: wrap; } .pipeline-mode-switch { order: 3; width: 100%; margin-left: 0; } .pipeline-preview { min-height: 20rem; flex: none; } .pipeline-explanation { min-height: 14rem; flex: none; } }
  @media (max-width: 42rem) { .pipeline-page { overflow-y: auto; } .pipeline-content { height: auto; min-height: 100%; padding: 1rem; } .pipeline-track { width: 100%; } }
  @media (prefers-reduced-motion: reduce) { .pipeline-stage { transition: none; } .pipeline-stage:hover, .pipeline-stage:focus-visible { transform: none; } .stage-explanation { animation: none; } }
</style>
