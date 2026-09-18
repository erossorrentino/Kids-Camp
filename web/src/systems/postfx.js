import * as THREE from '../../vendor/three/three.module.js';
import { EffectComposer } from '../../vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../../vendor/three/examples/jsm/postprocessing/OutputPass.js';

// Adds a GTA5-at-night-style glow to genuinely bright things — neon
// underglow, headlights, shop signage, emissive gun parts, sky/sun — without
// touching how anything is modeled: the threshold just picks out whatever's
// already bright, so every emissive material added over the course of this
// project starts blooming for free. RenderPass -> UnrealBloomPass -> OutputPass
// is the standard three.js r15x+ composer chain; OutputPass is required at
// the end for correct tone-mapping/color-space output when using a composer
// (skipping it leaves the image looking flat/washed out).
export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // threshold is high enough that plain sky/fog brightness never crosses
    // it (that was reading as a big white haze — see world/sky.js) while
    // genuinely emissive things (neon, headlights, lit windows) still do.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 0.97);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  render() {
    this.composer.render();
  }
}
