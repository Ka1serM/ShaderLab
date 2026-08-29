<script lang="ts">
  import ArrowRight from 'phosphor-svelte/lib/ArrowRightIcon';
  import ExternalLink from 'phosphor-svelte/lib/ArrowSquareOutIcon';
  import BookOpen from 'phosphor-svelte/lib/BookOpenIcon';
  import Code2 from 'phosphor-svelte/lib/CodeIcon';
  import GraduationCap from 'phosphor-svelte/lib/GraduationCapIcon';
  import { resolve } from '$app/paths';
  import tasks from '$lib/data/tasks.json';
  import teaching from '$lib/data/teaching.json';
  import HomeViewport from '$lib/components/HomeViewport.svelte';

  const taskCount = tasks.length;
  const teachingCount = teaching.length;
</script>

<svelte:head>
  <title>ShaderLab · Computergrafik Labor · HSD</title>
  <meta name="description" content="ShaderLab ist eine interaktive Lehrumgebung für GPU-Programmierung und GLSL an der Hochschule Düsseldorf." />
</svelte:head>

<div class="hsd-page">
  <main>
    <section class="hero">
      <div class="hero-copy">
        <p class="section-kicker">Computergrafik Labor</p>
        <h1>Shader<span>Lab</span></h1>
        <p class="hero-intro">Eine interaktive Lehrumgebung für GPU-Programmierung. Hier lässt sich direkt mit GLSL arbeiten und beobachten, wie aus wenigen Codezeilen ein gerendertes Bild entsteht.</p>
        <div class="hero-links">
          <a href={resolve('/tasks')}>Aufgaben ansehen <ArrowRight size={16} /></a>
          <a href={resolve('/teach')}>Lehr-Demos <ArrowRight size={16} /></a>
        </div>
        <p class="hero-note">Für die Grundlagen und weiterführende Erklärungen empfehlen wir <a href="https://learnopengl.com/" target="_blank" rel="noreferrer">LearnOpenGL <ExternalLink size={12} /></a>.</p>
      </div>

      <div class="hero-visual" aria-label="Animierte Darstellung eines gerenderten Shader-Objekts">
        <div class="visual-heading">GPU / ECHTZEIT <i></i></div>
        <div class="visual-frame">
          <HomeViewport />
        </div>
        <div class="visual-footer"><span>LIVE-ANSICHT</span><span>GLSL / 3D</span></div>
      </div>
    </section>

    <section class="overview" aria-labelledby="overview-title">
      <div class="overview-heading"><p class="section-kicker">Was ist ShaderLab?</p><h2 id="overview-title">Code direkt<br /><b>sichtbar machen.</b></h2></div>
      <div class="overview-copy"><p>ShaderLab unterstützt das Lernen von Computergrafik dort, wo die Konzepte sichtbar werden: im Shader. Übungen und Beispiele laufen direkt mit GPU-Code im Browser und geben unmittelbar visuelles Feedback.</p><p>So lassen sich Vertex- und Fragment-Shader, Transformationen, Lichtmodelle und 3D-Szenen ausprobieren, ohne zwischen Theorie und Ergebnis wechseln zu müssen.</p></div>
      <div class="overview-facts"><div><strong>{taskCount}</strong><span>Aufgaben</span></div><div><strong>{teachingCount}</strong><span>Lehr-Demos</span></div><div><strong>GLSL</strong><span>GPU-Code</span></div></div>
    </section>

    <section class="entry-section" aria-label="Inhalte">
      <div class="entry-list">
        <a class="entry-row" href={resolve('/tasks')}>
          <span class="entry-icon"><BookOpen size={21} /></span><span class="entry-text"><b>Aufgaben</b><small>Shader selbst implementieren und mit Referenzbildern vergleichen.</small></span><ArrowRight class="entry-arrow" size={20} />
        </a>
        <a class="entry-row" href={resolve('/teach')}>
          <span class="entry-icon"><GraduationCap size={21} /></span><span class="entry-text"><b>Lehr-Demos</b><small>Parameter, Matrizen und Rendering-Konzepte direkt im Ergebnis untersuchen.</small></span><ArrowRight class="entry-arrow" size={20} />
        </a>
        <a class="entry-row external-row" href="https://learnopengl.com/" target="_blank" rel="noreferrer">
          <span class="entry-icon"><Code2 size={21} /></span><span class="entry-text"><b>LearnOpenGL</b><small>Weiterführende Erklärungen zu OpenGL, Rendering und moderner Computergrafik.</small></span><ExternalLink class="entry-arrow" size={18} />
        </a>
      </div>
    </section>
  </main>

</div>

<style>
  /* svelte-ignore css-unused-selector */
  .hsd-page { --red: #bf2732; --red-dark: #bf2732; --black: #111; --paper: var(--background); --surface: #c6c6c6; --soft-surface: #d8d8d8; --copy: #4f4f4f; --copy-muted: #666; --line: #aaa; --muted: #636363; container-type: inline-size; width: 100%; min-width: 0; min-height: 100%; box-sizing: border-box; overflow-x: hidden; overflow-y: auto; color: var(--black); background: var(--paper); font-family: Arial, Helvetica, sans-serif; }
  main { width: 100%; box-sizing: border-box; padding-inline: clamp(14px, 4vw, 64px); margin: 0; }
  .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 24rem), 1fr)); gap: clamp(20px, 4vw, 65px); min-height: min(540px, 100svh); padding: clamp(28px, 5vw, 48px) 0 clamp(36px, 5vw, 48px); }.section-kicker { margin: 0 0 19px; color: var(--red); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }.hero-copy { container-type: inline-size; max-width: 560px; }.hero h1 { margin: 0; max-width: 100%; font-family: 'HSDSans', Arial, Helvetica, sans-serif; font-size: clamp(60px, 16cqw, 123px); font-weight: 700; letter-spacing: -.1em; line-height: .78; white-space: nowrap; }.hero h1 span { color: var(--red); }.hero-intro { max-width: 365px; margin: 33px 0 0; font-size: clamp(15px, 1.2vw, 17px); line-height: 1.42; }.hero-links { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 31px; }.hero-links a, .hero-note a { display: inline-flex; align-items: center; gap: 8px; color: var(--red); font-size: 13px; font-weight: 700; text-decoration: none; }.hero-links a:hover, .hero-note a:hover { color: var(--red-dark); text-decoration: underline; }.hero-note { max-width: 330px; margin-top: clamp(35px, 4vw, 52px); color: var(--muted); font-size: 11px; line-height: 1.5; }.hero-note a { font-size: inherit; }.hero-visual { min-width: 0; padding-top: 5px; }.visual-heading, .visual-footer { display: flex; align-items: center; justify-content: space-between; gap: 11px; color: var(--red); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.visual-heading i { width: 8px; height: 8px; margin-left: auto; border-radius: 50%; background: var(--red); animation: blink 1.7s ease-in-out infinite; }.visual-frame { position: relative; height: clamp(300px, 40vw, 410px); margin-top: 12px; overflow: hidden; border-radius: var(--radius-md); background: var(--surface); perspective: 900px; }.visual-frame::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.42), transparent 29%), linear-gradient(135deg, rgba(255,255,255,.22), transparent 45%); }.visual-footer { margin-top: 10px; color: var(--muted); font-size: 9px; }
  .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr)); gap: clamp(14px, 2vw, 26px); padding: clamp(38px, 4vw, 51px) 0 clamp(48px, 5vw, 62px); }.overview-heading h2 { margin: 0; font-family: 'HSDSans', Arial, Helvetica, sans-serif; font-size: clamp(30px, 4vw, 49px); letter-spacing: -.07em; line-height: .93; }.overview-heading h2 b { color: var(--red); font-weight: 700; }.overview-copy { padding-top: clamp(12px, 2vw, 29px); color: var(--copy); font-size: 13px; line-height: 1.58; }.overview-copy p { margin: 0 0 15px; }.overview-facts { display: flex; grid-column: 1 / -1; flex-flow: row wrap; gap: clamp(15px, 3vw, 28px); padding-top: 18px; }.overview-facts div { display: flex; align-items: baseline; gap: 9px; }.overview-facts strong { color: var(--red); font-size: 22px; }.overview-facts span { color: var(--copy-muted); font-size: 10px; text-transform: uppercase; }.entry-section { padding: 0 0 71px; }.entry-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: clamp(12px, 2vw, 20px); }.entry-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 20px; align-items: center; min-height: 8rem; box-sizing: border-box; border: 1px solid var(--app-line); border-radius: .45rem; background: var(--card); color: var(--black); padding: clamp(16px, 2vw, 22px); text-decoration: none; transition: background .2s ease, box-shadow .2s ease, transform .2s ease; }.entry-row:hover { background: var(--secondary); box-shadow: inset 0 0 0 2px var(--app-red); transform: translateY(-3px); }.entry-icon { display: flex; color: var(--red); }.entry-text { display: flex; min-width: 0; flex-direction: column; gap: 5px; }.entry-text b { font-size: clamp(15px, 1.5vw, 18px); }.entry-text small { color: var(--copy-muted); font-size: clamp(10px, 1vw, 12px); line-height: 1.35; }.entry-row :global(svg) { color: var(--red); }
  @keyframes blink { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  @container (min-width: 68rem) { .overview { grid-template-columns: calc(50% - 13px) minmax(0, 1fr) 180px; }.overview-facts { grid-column: auto; flex-direction: column; gap: 16px; padding: 28px 0 0 22px; } }
  :global(.dark) .hsd-page { --black: #ffffff; --surface: #191919; --soft-surface: #151515; --copy: #d0d0d0; --copy-muted: #bcbcbc; --line: #414141; --muted: #bcbcbc; color-scheme: dark; }
  :global(.dark) .hsd-page .visual-frame { border-color: #f1f1f1; }
  :global(.dark) .hsd-page .visual-frame::before { background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.08), transparent 29%), linear-gradient(135deg, rgba(255,255,255,.06), transparent 45%); }
  :global(.dark) .hsd-page .overview-copy, :global(.dark) .hsd-page .entry-text small { color: var(--copy); }
  :global(.dark) .hsd-page .entry-row:hover { background: var(--soft-surface); }
  .hero, .hero-copy, .hero-visual { min-width: 0; }
  .visual-frame { width: 100%; box-sizing: border-box; }
  @media (prefers-reduced-motion: reduce) { .hsd-page *, .hsd-page *::before, .hsd-page *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
</style>
