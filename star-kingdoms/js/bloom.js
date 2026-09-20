/* Star Kingdoms — a compact HDR bloom chain written against three.js core,
   because the add-on post-processing modules are ES-module only.
   Scene renders linear + untonemapped into a float target; bright areas are
   extracted, blurred at two scales, then composited with ACES tonemapping
   and sRGB encoding applied last, which is what makes the neon read. */
(function (SK) {
  'use strict';

  const QUAD = new THREE.PlaneGeometry(2, 2);

  const VERT = [
    'varying vec2 vUv;',
    'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
  ].join('\n');

  const BRIGHT = [
    'uniform sampler2D tDiffuse; uniform float threshold; uniform float knee;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  float w = smoothstep(threshold, threshold + knee, l);',
    '  gl_FragColor = vec4(c * w, 1.0);',
    '}'
  ].join('\n');

  const BLUR = [
    'uniform sampler2D tDiffuse; uniform vec2 dir; uniform vec2 texel;',
    'varying vec2 vUv;',
    'void main(){',
    '  vec2 o = dir * texel;',
    '  vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;',
    '  s += texture2D(tDiffuse, vUv + o * 1.3846153846).rgb * 0.3162162162;',
    '  s += texture2D(tDiffuse, vUv - o * 1.3846153846).rgb * 0.3162162162;',
    '  s += texture2D(tDiffuse, vUv + o * 3.2307692308).rgb * 0.0702702703;',
    '  s += texture2D(tDiffuse, vUv - o * 3.2307692308).rgb * 0.0702702703;',
    '  gl_FragColor = vec4(s, 1.0);',
    '}'
  ].join('\n');

  const COMPOSITE = [
    'uniform sampler2D tBase; uniform sampler2D tBloomA; uniform sampler2D tBloomB;',
    'uniform float strength; uniform float exposure; uniform float vignette;',
    'varying vec2 vUv;',
    // ACES filmic approximation (Narkowicz) — cheap and keeps highlights sane
    'vec3 aces(vec3 x){',
    '  const float a = 2.51; const float b = 0.03; const float c = 2.43;',
    '  const float d = 0.59; const float e = 0.14;',
    '  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);',
    '}',
    'void main(){',
    '  vec3 base = texture2D(tBase, vUv).rgb;',
    '  vec3 bl = texture2D(tBloomA, vUv).rgb * 0.62 + texture2D(tBloomB, vUv).rgb * 0.38;',
    '  vec3 col = base + bl * strength;',
    '  col = aces(col * exposure);',
    '  vec2 q = vUv - 0.5;',
    '  float v = 1.0 - dot(q, q) * vignette;',
    '  col *= clamp(v, 0.0, 1.0);',
    '  col = pow(col, vec3(1.0 / 2.2));',   // linear -> sRGB
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function makePass(frag, uniforms) {
    return new THREE.ShaderMaterial({
      uniforms: uniforms, vertexShader: VERT, fragmentShader: frag,
      depthTest: false, depthWrite: false
    });
  }

  function Bloom(renderer, width, height) {
    this.renderer = renderer;
    this.enabled = true;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(QUAD, null);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);

    const type = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const opts = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: type, depthBuffer: true, stencilBuffer: false
    };
    this.rtScene = new THREE.WebGLRenderTarget(width, height, opts);
    const half = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: type, depthBuffer: false, stencilBuffer: false };
    this.rtA1 = new THREE.WebGLRenderTarget(width >> 1, height >> 1, half);
    this.rtA2 = new THREE.WebGLRenderTarget(width >> 1, height >> 1, half);
    this.rtB1 = new THREE.WebGLRenderTarget(width >> 2, height >> 2, half);
    this.rtB2 = new THREE.WebGLRenderTarget(width >> 2, height >> 2, half);

    this.mBright = makePass(BRIGHT, {
      tDiffuse: { value: null }, threshold: { value: 1.05 }, knee: { value: 0.75 }
    });
    this.mBlur = makePass(BLUR, {
      tDiffuse: { value: null }, dir: { value: new THREE.Vector2(1, 0) },
      texel: { value: new THREE.Vector2(1 / width, 1 / height) }
    });
    this.mComposite = makePass(COMPOSITE, {
      tBase: { value: this.rtScene.texture },
      tBloomA: { value: this.rtA2.texture },
      tBloomB: { value: this.rtB2.texture },
      strength: { value: 0.7 }, exposure: { value: 0.95 }, vignette: { value: 0.62 }
    });
    this.setSize(width, height);
  }

  Bloom.prototype.setSize = function (w, h) {
    w = Math.max(2, w | 0); h = Math.max(2, h | 0);
    this.width = w; this.height = h;
    this.rtScene.setSize(w, h);
    this.rtA1.setSize(w >> 1, h >> 1);
    this.rtA2.setSize(w >> 1, h >> 1);
    this.rtB1.setSize(w >> 2, h >> 2);
    this.rtB2.setSize(w >> 2, h >> 2);
  };

  Bloom.prototype._blit = function (material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target || null);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.quadScene, this.quadCam);
  };

  Bloom.prototype.render = function (scene, camera, exposure, strength) {
    const r = this.renderer;
    this.mComposite.uniforms.exposure.value = exposure == null ? 1.0 : exposure;
    this.mComposite.uniforms.strength.value = strength == null ? 0.85 : strength;

    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    // bright pass at half resolution
    this.mBright.uniforms.tDiffuse.value = this.rtScene.texture;
    this._blit(this.mBright, this.rtA1);

    const bw = this.width >> 1, bh = this.height >> 1;
    this.mBlur.uniforms.texel.value.set(1 / bw, 1 / bh);
    this.mBlur.uniforms.tDiffuse.value = this.rtA1.texture;
    this.mBlur.uniforms.dir.value.set(1, 0);
    this._blit(this.mBlur, this.rtA2);
    this.mBlur.uniforms.tDiffuse.value = this.rtA2.texture;
    this.mBlur.uniforms.dir.value.set(0, 1);
    this._blit(this.mBlur, this.rtA1);
    // swap so rtA2 always holds the finished half-res bloom
    const t = this.rtA1; this.rtA1 = this.rtA2; this.rtA2 = t;
    this.mComposite.uniforms.tBloomA.value = this.rtA2.texture;

    // wider second octave at quarter resolution
    this.mBlur.uniforms.texel.value.set(1 / (this.width >> 2), 1 / (this.height >> 2));
    this.mBlur.uniforms.tDiffuse.value = this.rtA2.texture;
    this.mBlur.uniforms.dir.value.set(2, 0);
    this._blit(this.mBlur, this.rtB1);
    this.mBlur.uniforms.tDiffuse.value = this.rtB1.texture;
    this.mBlur.uniforms.dir.value.set(0, 2);
    this._blit(this.mBlur, this.rtB2);
    this.mComposite.uniforms.tBloomB.value = this.rtB2.texture;

    this.mComposite.uniforms.tBase.value = this.rtScene.texture;
    this._blit(this.mComposite, null);
    r.setRenderTarget(null);
  };

  Bloom.prototype.dispose = function () {
    [this.rtScene, this.rtA1, this.rtA2, this.rtB1, this.rtB2].forEach((t) => t.dispose());
  };

  SK.Bloom = Bloom;
})(window.SK);
