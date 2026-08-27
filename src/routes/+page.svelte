<script lang="ts">
  import { ArrowRight, BookOpen, Code2, ExternalLink, GraduationCap } from 'lucide-svelte';
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
        <p class="section-kicker"><span></span>Computergrafik Labor</p>
        <h1>Shader<span>Lab</span></h1>
        <p class="hero-intro">Eine interaktive Lehrumgebung für GPU-Programmierung. Hier lässt sich direkt mit GLSL arbeiten und beobachten, wie aus wenigen Codezeilen ein gerendertes Bild entsteht.</p>
        <div class="hero-links">
          <a href={resolve('/tasks')}>Aufgaben ansehen <ArrowRight size={16} /></a>
          <a href={resolve('/teach')}>Lehr-Demos <ArrowRight size={16} /></a>
        </div>
        <p class="hero-note">Für die Grundlagen und weiterführende Erklärungen empfehlen wir <a href="https://learnopengl.com/" target="_blank" rel="noreferrer">LearnOpenGL <ExternalLink size={12} /></a>.</p>
      </div>

      <div class="hero-visual" aria-label="Animierte Darstellung eines gerenderten Shader-Objekts">
        <div class="visual-heading">GPU / REALTIME <i></i></div>
        <div class="visual-frame">
          <HomeViewport />
        </div>
        <div class="visual-footer"><span>LIVE VIEWPORT</span><span class="visual-line"></span><span>GLSL / 3D</span></div>
      </div>
    </section>

    <section class="overview" aria-labelledby="overview-title">
      <div class="overview-heading"><p class="section-kicker"><span></span>Was ist ShaderLab?</p><h2 id="overview-title">Code direkt<br /><b>sichtbar machen.</b></h2></div>
      <div class="overview-copy"><p>ShaderLab unterstützt das Lernen von Computergrafik dort, wo die Konzepte sichtbar werden: im Shader. Übungen und Beispiele laufen direkt mit GPU-Code im Browser und geben unmittelbar visuelles Feedback.</p><p>So lassen sich Vertex- und Fragment-Shader, Transformationen, Lichtmodelle und 3D-Szenen ausprobieren, ohne zwischen Theorie und Ergebnis wechseln zu müssen.</p></div>
      <div class="overview-facts"><div><strong>{taskCount}</strong><span>Aufgaben</span></div><div><strong>{teachingCount}</strong><span>Lehr-Demos</span></div><div><strong>GLSL</strong><span>GPU-Code</span></div></div>
    </section>

    <section class="entry-section" aria-label="Inhalte">
      <div class="entry-list">
        <a class="entry-row" href={resolve('/tasks')}>
          <span class="entry-icon"><BookOpen size={21} /></span><span class="entry-index">01</span><span class="entry-text"><b>Aufgaben</b><small>Shader selbst implementieren und mit Referenzbildern vergleichen.</small></span><ArrowRight class="entry-arrow" size={20} />
        </a>
        <a class="entry-row" href={resolve('/teach')}>
          <span class="entry-icon"><GraduationCap size={21} /></span><span class="entry-index">02</span><span class="entry-text"><b>Lehr-Demos</b><small>Parameter, Matrizen und Rendering-Konzepte direkt im Ergebnis untersuchen.</small></span><ArrowRight class="entry-arrow" size={20} />
        </a>
        <a class="entry-row external-row" href="https://learnopengl.com/" target="_blank" rel="noreferrer">
          <span class="entry-icon"><Code2 size={21} /></span><span class="entry-index">03</span><span class="entry-text"><b>LearnOpenGL</b><small>Weiterführende Erklärungen zu OpenGL, Rendering und moderner Computergrafik.</small></span><ExternalLink class="entry-arrow" size={18} />
        </a>
      </div>
    </section>
  </main>

</div>

<style>
  @font-face { font-family: 'HSDSans'; src: url('/fonts/HSDSans/HSDSans-Regular.ttf') format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }
  /* svelte-ignore css-unused-selector */
  .hsd-page { --red: #bf2732; --red-dark: #98232c; --black: #111; --gray: #d4d4d4; --paper: var(--background); --surface: #c6c6c6; --soft-surface: #d8d8d8; --copy: #4f4f4f; --copy-muted: #666; --line: #aaa; --muted: #636363; width: 100%; min-width: 0; min-height: 100%; box-sizing: border-box; overflow-x: hidden; overflow-y: auto; color: var(--black); background: var(--paper); font-family: Arial, Helvetica, sans-serif; }
  main { width: 100%; box-sizing: border-box; padding-left: clamp(20px, 4vw, 64px); padding-right: clamp(20px, 4vw, 64px); margin: 0; }
  .hero { display: grid; grid-template-columns: .86fr 1.14fr; gap: 65px; min-height: 540px; padding: 48px 0 36px; }.section-kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 19px; color: var(--red); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }.section-kicker span { display: inline-block; width: 27px; height: 2px; background: var(--red); }.hero h1 { margin: 0; max-width: 100%; font-family: 'HSDSans', Arial, Helvetica, sans-serif; font-size: clamp(70px, 10vw, 123px); font-weight: 700; letter-spacing: -.1em; line-height: .78; white-space: nowrap; }.hero h1 span { color: var(--red); }.hero-intro { max-width: 365px; margin: 33px 0 0; font-size: 17px; line-height: 1.42; }.hero-links { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 31px; }.hero-links a, .hero-note a { display: inline-flex; align-items: center; gap: 8px; color: var(--red); font-size: 13px; font-weight: 700; text-decoration: none; }.hero-links a:hover, .hero-note a:hover { color: var(--red-dark); text-decoration: underline; }.hero-note { max-width: 330px; margin-top: 52px; color: var(--muted); font-size: 11px; line-height: 1.5; }.hero-note a { font-size: inherit; }.hero-visual { min-width: 0; padding-top: 5px; }.visual-heading, .visual-footer { display: flex; align-items: center; gap: 11px; color: var(--red); font-size: 10px; font-weight: 700; letter-spacing: .14em; }.visual-heading i { width: 8px; height: 8px; margin-left: auto; border-radius: 50%; background: var(--red); animation: blink 1.7s ease-in-out infinite; }.visual-frame { position: relative; height: 410px; margin-top: 12px; overflow: hidden; border: 2px solid var(--black); background: var(--surface); perspective: 900px; }.visual-frame::before { content: ''; position: absolute; inset: 0; background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.42), transparent 29%), linear-gradient(135deg, rgba(255,255,255,.22), transparent 45%); }.visual-footer { margin-top: 10px; color: var(--muted); font-size: 9px; }.visual-line { width: 45px; height: 1px; background: var(--red); }
  .overview { display: grid; grid-template-columns: .9fr 1.05fr 180px; gap: 26px; padding: 51px 0 62px; border-top: 2px solid var(--black); }.overview-heading h2 { margin: 0; font-family: 'HSDSans', Arial, Helvetica, sans-serif; font-size: clamp(30px, 4vw, 49px); letter-spacing: -.07em; line-height: .93; }.overview-heading h2 b { color: var(--red); font-weight: 700; }.overview-copy { padding-top: 29px; color: var(--copy); font-size: 13px; line-height: 1.58; }.overview-copy p { margin: 0 0 15px; }.overview-facts { display: flex; flex-direction: column; gap: 16px; padding-top: 28px; border-left: 1px solid var(--line); padding-left: 22px; }.overview-facts div { display: flex; align-items: baseline; gap: 9px; }.overview-facts strong { color: var(--red); font-size: 22px; }.overview-facts span { color: var(--copy-muted); font-size: 10px; text-transform: uppercase; }.entry-section { display: grid; grid-template-columns: 1fr; gap: 26px; padding: 0 0 71px; }.entry-list { border-top: 2px solid var(--black); }.entry-row { display: grid; grid-template-columns: 44px 46px 1fr 30px; align-items: center; min-height: 87px; border-bottom: 1px solid var(--line); color: var(--black); text-decoration: none; transition: background .2s ease, padding .2s ease; }.entry-row:hover { padding-left: 10px; background: var(--soft-surface); }.entry-icon { display: flex; color: var(--red); }.entry-index { color: var(--red); font-size: 11px; }.entry-text { display: flex; flex-direction: column; gap: 5px; }.entry-text b { font-size: 18px; }.entry-text small { color: var(--copy-muted); font-size: 12px; }.entry-row :global(svg) { color: var(--red); }
  @keyframes blink { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  @media (max-width: 850px) { main { width: 100%; padding-left: 20px; padding-right: 20px; }.hero { grid-template-columns: 1fr; gap: 20px; padding-top: 54px; }.hero-copy { max-width: 560px; }.hero-visual { margin-top: 15px; }.overview { grid-template-columns: 1fr 1fr; }.overview-facts { grid-column: 1 / -1; flex-direction: row; border-left: 0; border-top: 1px solid var(--line); padding: 18px 0 0; }.entry-section { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { main { width: 100%; padding-left: 14px; padding-right: 14px; }.hero { min-height: 0; padding: 45px 0 48px; }.hero h1 { font-size: clamp(58px, 20vw, 76px); }.hero-intro { font-size: 15px; }.hero-note { margin-top: 35px; }.visual-frame { height: 300px; }.overview { grid-template-columns: 1fr; gap: 14px; padding: 38px 0 48px; }.overview-heading, .overview-copy, .overview-facts { grid-column: 1; }.overview-copy { padding-top: 12px; }.overview-facts { gap: 15px; flex-wrap: wrap; }.entry-section { grid-template-columns: 1fr; gap: 14px; }.entry-row { grid-template-columns: 30px 31px 1fr 20px; min-height: 78px; }.entry-text b { font-size: 15px; }.entry-text small { font-size: 10px; line-height: 1.35; } }
  @media (max-width: 480px) { .hero h1 { font-size: clamp(48px, 15vw, 60px); letter-spacing: -.09em; } }
  :global(.dark) .hsd-page { --black: #ffffff; --surface: #191919; --soft-surface: #151515; --copy: #d0d0d0; --copy-muted: #bcbcbc; --line: #414141; --muted: #bcbcbc; color-scheme: dark; }
  :global(.dark) .hsd-page .visual-frame { border-color: #f1f1f1; }
  :global(.dark) .hsd-page .visual-frame::before { background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.08), transparent 29%), linear-gradient(135deg, rgba(255,255,255,.06), transparent 45%); }
  :global(.dark) .hsd-page .overview-copy, :global(.dark) .hsd-page .entry-text small { color: var(--copy); }
  :global(.dark) .hsd-page .entry-row:hover { background: var(--soft-surface); }
  .hero, .hero-copy, .hero-visual { min-width: 0; }
  .visual-frame { width: 100%; box-sizing: border-box; }
  @media (prefers-reduced-motion: reduce) { .hsd-page *, .hsd-page *::before, .hsd-page *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
</style>
