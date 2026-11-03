import type { SimulationSettings } from '$lib/renderer/Renderer';
import type { ViewportSlot } from './viewport.svelte';

export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2] as const;

/**
 * Runs the compute stage of a task in every viewport at once, so reference
 * and output stay comparable: one play button, one speed, one reset.
 */
export class SimulationController {
  running = $state(true);
  speed = $state(1);
  private stepsPerFrame = 1;

  constructor(private readonly viewports: ViewportSlot[]) {}

  /** The settings a newly loaded viewport starts with. */
  get settings(): SimulationSettings {
    return { stepsPerFrame: this.stepsPerFrame, running: this.running, speed: this.speed };
  }

  /** A newly opened task starts running at normal speed. */
  start(stepsPerFrame = 1) {
    this.stepsPerFrame = stepsPerFrame;
    this.running = true;
    this.speed = 1;
  }

  toggle() {
    this.running = !this.running;
    this.apply();
  }

  /** Pauses and advances by one frame. */
  step() {
    if (this.running) {
      this.running = false;
      this.apply();
    }
    this.viewports.forEach(viewport => viewport.renderer?.stepSimulation());
  }

  reset() {
    this.viewports.forEach(viewport => viewport.renderer?.resetSimulation());
  }

  /** Cycles through the speeds. */
  nextSpeed() {
    const index = SIMULATION_SPEEDS.indexOf(this.speed as typeof SIMULATION_SPEEDS[number]);
    this.speed = SIMULATION_SPEEDS[(index + 1) % SIMULATION_SPEEDS.length];
    this.apply();
  }

  private apply() {
    const settings = this.settings;
    this.viewports.forEach(viewport => viewport.renderer?.setSimulation(settings));
  }
}
