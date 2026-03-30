export interface AsciiOptions {
  canvas: HTMLCanvasElement
  imageSrc: string
  chars?: string
  fontSize?: number
  fontFamily?: string
  brightnessBoost?: number
  posterize?: number
  parallaxStrength?: number
  scale?: number
  colorFn?: (luminance: number, distFromCenter: number) => string
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_glyphs;
uniform vec2 u_resolution;
uniform vec2 u_cellSize;
uniform vec2 u_gridSize;
uniform float u_numChars;
uniform float u_brightnessBoost;
uniform float u_posterize;
uniform float u_revealT;
uniform float u_parallaxX;
uniform float u_parallaxY;
uniform float u_glitchSeed;
uniform float u_scale;

// hash for glitch + cell seed
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 px = vec2(v_uv.x, v_uv.y) * u_resolution;

  // parallax offset
  px -= vec2(u_parallaxX, u_parallaxY * 0.6);

  // glitch: random row offsets
  float rowIdx = floor(px.y / u_cellSize.y);
  float glitchH = hash(vec2(rowIdx, u_glitchSeed));
  float glitchActive = step(0.92, glitchH); // ~8% of rows
  float glitchOffset = (hash(vec2(rowIdx + 100.0, u_glitchSeed)) - 0.5) * u_cellSize.x * 6.0;
  px.x -= glitchActive * glitchOffset;

  vec2 cellIdx = floor(px / u_cellSize);
  vec2 cellFrac = fract(px / u_cellSize);

  if (cellIdx.x < 0.0 || cellIdx.y < 0.0 || cellIdx.x >= u_gridSize.x || cellIdx.y >= u_gridSize.y) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // sample image at cell center (with scale)
  vec2 imageUV = (cellIdx + 0.5) / u_gridSize;
  imageUV = (imageUV - 0.5) / u_scale + 0.5;
  if (imageUV.x < 0.0 || imageUV.x > 1.0 || imageUV.y < 0.0 || imageUV.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }
  vec4 texColor = texture2D(u_image, imageUV);
  if (texColor.a < 0.04) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // luminance
  float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
  lum = min(1.0, lum * u_brightnessBoost * texColor.a);
  lum = floor(lum * u_posterize + 0.5) / u_posterize;
  if (lum < 0.03) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // reveal wave: edge distance + cell seed
  float edgeDist = min(cellIdx.x / u_gridSize.x, 1.0 - cellIdx.x / u_gridSize.x);
  float cellSeed = hash(cellIdx) * 0.15;
  float threshold = edgeDist + cellSeed;
  float revealWave = u_revealT * 0.3;
  if (threshold > revealWave) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }
  float cellReveal = min(1.0, (revealWave - threshold) * 6.0);

  // depth fade from center
  vec2 mid = u_gridSize * 0.5;
  float distFromCenter = length((cellIdx - mid) / mid);
  float depthFade = max(0.3, 1.0 - distFromCenter * 0.5);
  float bright = lum * cellReveal * depthFade;

  // char index
  float charF = floor(min(1.0, lum) * (u_numChars - 1.0));

  // sample glyph atlas
  float atlasU = (charF + cellFrac.x) / u_numChars;
  float glyphA = texture2D(u_glyphs, vec2(atlasU, cellFrac.y)).a;

  if (glyphA < 0.01) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  // default color: blue-tinted gradient
  float cr = (100.0 + bright * 155.0) / 255.0;
  float cg = (140.0 + bright * 115.0) / 255.0;
  float cb = (200.0 + bright * 55.0) / 255.0;

  gl_FragColor = vec4(cr * glyphA, cg * glyphA, cb * glyphA, glyphA);
}`

// custom color variant: renders to 2d canvas overlay for colorFn support
const FRAG_LUM_ONLY = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_glyphs;
uniform vec2 u_resolution;
uniform vec2 u_cellSize;
uniform vec2 u_gridSize;
uniform float u_numChars;
uniform float u_brightnessBoost;
uniform float u_posterize;
uniform float u_revealT;
uniform float u_parallaxX;
uniform float u_parallaxY;
uniform float u_glitchSeed;
uniform float u_scale;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 px = vec2(v_uv.x, v_uv.y) * u_resolution;
  px -= vec2(u_parallaxX, u_parallaxY * 0.6);

  float rowIdx = floor(px.y / u_cellSize.y);
  float glitchH = hash(vec2(rowIdx, u_glitchSeed));
  float glitchActive = step(0.92, glitchH);
  float glitchOffset = (hash(vec2(rowIdx + 100.0, u_glitchSeed)) - 0.5) * u_cellSize.x * 6.0;
  px.x -= glitchActive * glitchOffset;

  vec2 cellIdx = floor(px / u_cellSize);
  vec2 cellFrac = fract(px / u_cellSize);

  if (cellIdx.x < 0.0 || cellIdx.y < 0.0 || cellIdx.x >= u_gridSize.x || cellIdx.y >= u_gridSize.y) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec2 imageUV = (cellIdx + 0.5) / u_gridSize;
  imageUV = (imageUV - 0.5) / u_scale + 0.5;
  if (imageUV.x < 0.0 || imageUV.x > 1.0 || imageUV.y < 0.0 || imageUV.y > 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec4 texColor = texture2D(u_image, imageUV);
  if (texColor.a < 0.04) { gl_FragColor = vec4(0.0); return; }

  float lum = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
  lum = min(1.0, lum * u_brightnessBoost * texColor.a);
  lum = floor(lum * u_posterize + 0.5) / u_posterize;
  if (lum < 0.03) { gl_FragColor = vec4(0.0); return; }

  float edgeDist = min(cellIdx.x / u_gridSize.x, 1.0 - cellIdx.x / u_gridSize.x);
  float cellSeed = hash(cellIdx) * 0.15;
  float revealWave = u_revealT * 0.3;
  if (edgeDist + cellSeed > revealWave) { gl_FragColor = vec4(0.0); return; }
  float cellReveal = min(1.0, (revealWave - edgeDist - cellSeed) * 6.0);

  vec2 mid = u_gridSize * 0.5;
  float distFromCenter = length((cellIdx - mid) / mid);
  float depthFade = max(0.3, 1.0 - distFromCenter * 0.5);
  float bright = lum * cellReveal * depthFade;

  float charF = floor(min(1.0, lum) * (u_numChars - 1.0));
  float atlasU = (charF + cellFrac.x) / u_numChars;
  float glyphA = texture2D(u_glyphs, vec2(atlasU, cellFrac.y)).a;

  // encode brightness + distFromCenter in RG channels for colorFn readback
  gl_FragColor = vec4(bright, distFromCenter, 0.0, glyphA);
}`

export function createAsciiRenderer(opts: AsciiOptions): () => void {
  const {
    canvas,
    imageSrc,
    chars = ' 0123456789',
    fontSize = 9,
    fontFamily = '"DM Mono", monospace',
    brightnessBoost = 2.2,
    posterize = 32,
    parallaxStrength = 8,
    scale = 1.15,
    colorFn,
  } = opts

  // if colorFn is provided, fall back to Canvas2D renderer for full compatibility
  if (colorFn) return createCanvas2DFallback(opts)

  let w = 0, h = 0, charW = 0, charH = 0, cols = 0, rows = 0
  let rafId = 0
  let revealT = 0
  let cursorNX = 0, cursorNY = 0, targetNX = 0, targetNY = 0
  let nextGlitchTime = 0
  let glitchSeed = 0
  let imageLoaded = false

  const onMouseMove = (e: MouseEvent) => {
    targetNX = (e.clientX / window.innerWidth - 0.5) * 2
    targetNY = (e.clientY / window.innerHeight - 0.5) * 2
  }
  document.addEventListener('mousemove', onMouseMove, { passive: true })

  // WebGL init
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })!
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

  function compile(src: string, type: number): WebGLShader {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)!)
    return s
  }

  const prog = gl.createProgram()!
  gl.attachShader(prog, compile(VERT, gl.VERTEX_SHADER))
  gl.attachShader(prog, compile(FRAG, gl.FRAGMENT_SHADER))
  gl.linkProgram(prog)
  gl.useProgram(prog)

  const buf = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const uResolution = gl.getUniformLocation(prog, 'u_resolution')!
  const uCellSize = gl.getUniformLocation(prog, 'u_cellSize')!
  const uGridSize = gl.getUniformLocation(prog, 'u_gridSize')!
  const uNumChars = gl.getUniformLocation(prog, 'u_numChars')!
  const uBrightnessBoost = gl.getUniformLocation(prog, 'u_brightnessBoost')!
  const uPosterize = gl.getUniformLocation(prog, 'u_posterize')!
  const uRevealT = gl.getUniformLocation(prog, 'u_revealT')!
  const uParallaxX = gl.getUniformLocation(prog, 'u_parallaxX')!
  const uParallaxY = gl.getUniformLocation(prog, 'u_parallaxY')!
  const uGlitchSeed = gl.getUniformLocation(prog, 'u_glitchSeed')!
  const uScale = gl.getUniformLocation(prog, 'u_scale')!
  const uImage = gl.getUniformLocation(prog, 'u_image')!
  const uGlyphs = gl.getUniformLocation(prog, 'u_glyphs')!

  const imageTex = gl.createTexture()!
  const glyphTex = gl.createTexture()!

  function initTex(tex: WebGLTexture, unit: number) {
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  }
  initTex(imageTex, 0)
  initTex(glyphTex, 1)
  gl.uniform1i(uImage, 0)
  gl.uniform1i(uGlyphs, 1)

  function setup() {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    w = rect.width; h = rect.height
    canvas.width = w * dpr; canvas.height = h * dpr
    gl.viewport(0, 0, canvas.width, canvas.height)

    // measure char size
    const mc = new OffscreenCanvas(100, 100)
    const mctx = mc.getContext('2d')!
    mctx.font = `${fontSize}px ${fontFamily}`
    charW = mctx.measureText('0').width
    charH = fontSize
    cols = Math.ceil(w / charW)
    rows = Math.ceil(h / charH)

    buildGlyphAtlas()
  }

  function buildGlyphAtlas() {
    const cw = Math.ceil(charW)
    const ch = charH + 2
    const atlas = new OffscreenCanvas(cw * chars.length, ch)
    const ac = atlas.getContext('2d')!
    ac.font = `${fontSize}px ${fontFamily}`
    ac.textBaseline = 'top'
    ac.fillStyle = '#fff'
    for (let i = 0; i < chars.length; i++) {
      ac.fillText(chars[i]!, i * cw, 1)
    }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, glyphTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
  }

  // load source image
  const sourceImg = new Image()
  sourceImg.crossOrigin = 'anonymous'
  sourceImg.src = imageSrc
  sourceImg.onload = () => {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, imageTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceImg)
    imageLoaded = true
    setup()
    draw()
  }
  if (sourceImg.complete && sourceImg.naturalWidth) {
    sourceImg.onload!(new Event('load'))
  }

  function draw() {
    if (!imageLoaded) { rafId = requestAnimationFrame(draw); return }

    cursorNX += (targetNX - cursorNX) * 0.05
    cursorNY += (targetNY - cursorNY) * 0.05
    revealT += 1 / 60

    // glitch seed changes periodically
    if (revealT > nextGlitchTime) {
      glitchSeed = Math.random() * 1000
      nextGlitchTime = revealT + 0.2 + Math.random() * 0.6
      setTimeout(() => { glitchSeed = -1 }, 50 + Math.random() * 100)
    }

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.uniform2f(uResolution, w, h)
    gl.uniform2f(uCellSize, charW, charH)
    gl.uniform2f(uGridSize, cols, rows)
    gl.uniform1f(uNumChars, chars.length)
    gl.uniform1f(uBrightnessBoost, brightnessBoost)
    gl.uniform1f(uPosterize, posterize)
    gl.uniform1f(uRevealT, revealT)
    gl.uniform1f(uParallaxX, cursorNX * parallaxStrength)
    gl.uniform1f(uParallaxY, cursorNY * parallaxStrength)
    gl.uniform1f(uGlitchSeed, glitchSeed)
    gl.uniform1f(uScale, scale)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    rafId = requestAnimationFrame(draw)
  }

  window.addEventListener('resize', setup)

  return () => {
    cancelAnimationFrame(rafId)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', setup)
  }
}

// Canvas2D fallback for custom colorFn — same logic as original
function createCanvas2DFallback(opts: AsciiOptions): () => void {
  const {
    canvas,
    imageSrc,
    chars = ' 0123456789',
    fontSize = 9,
    fontFamily = '"DM Mono", monospace',
    brightnessBoost = 2.2,
    posterize = 32,
    parallaxStrength = 8,
    scale = 1.15,
    colorFn,
  } = opts

  const ctx = canvas.getContext('2d')!
  let w = 0, h = 0, charW = 0, charH = 0, cols = 0, rows = 0
  let pixelData: Uint8ClampedArray | null = null
  let sampledW = 0, revealT = 0
  let cursorNX = 0, cursorNY = 0, targetNX = 0, targetNY = 0
  let cellSeed: Float32Array
  let glitchRows = new Map<number, number>()
  let nextGlitchTime = 0
  let rafId = 0

  const onMouseMove = (e: MouseEvent) => {
    targetNX = (e.clientX / window.innerWidth - 0.5) * 2
    targetNY = (e.clientY / window.innerHeight - 0.5) * 2
  }
  document.addEventListener('mousemove', onMouseMove, { passive: true })

  const sourceImg = new Image()
  sourceImg.crossOrigin = 'anonymous'
  sourceImg.src = imageSrc

  function setup() {
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    w = rect.width; h = rect.height
    canvas.width = w * dpr; canvas.height = h * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.font = `${fontSize}px ${fontFamily}`
    charW = ctx.measureText('0').width
    charH = fontSize
    cols = Math.ceil(w / charW); rows = Math.ceil(h / charH)
    cellSeed = new Float32Array(cols * rows)
    for (let i = 0; i < cols * rows; i++) cellSeed[i] = Math.random()
    sampleSource()
  }

  function sampleSource() {
    if (!sourceImg.complete || !sourceImg.naturalWidth) return
    const off = document.createElement('canvas')
    off.width = cols; off.height = rows
    const oc = off.getContext('2d')!
    const dw = cols * scale, dh = rows * scale
    oc.drawImage(sourceImg, 0, 0, sourceImg.naturalWidth, sourceImg.naturalHeight,
      (cols - dw) / 2, (rows - dh) / 2, dw, dh)
    pixelData = oc.getImageData(0, 0, cols, rows).data
    sampledW = cols
  }

  function updateGlitches(time: number) {
    if (time > nextGlitchTime) {
      glitchRows.clear()
      for (let g = 0; g < 1 + Math.floor(Math.random() * 3); g++) {
        const startRow = Math.floor(Math.random() * rows)
        const ht = 1 + Math.floor(Math.random() * 3)
        const offset = (Math.random() - 0.5) * charW * 6
        for (let r = startRow; r < Math.min(rows, startRow + ht); r++) glitchRows.set(r, offset)
      }
      nextGlitchTime = time + 0.2 + Math.random() * 0.6
      setTimeout(() => glitchRows.clear(), 50 + Math.random() * 100)
    }
  }

  function draw() {
    if (!pixelData) { rafId = requestAnimationFrame(draw); return }
    cursorNX += (targetNX - cursorNX) * 0.05
    cursorNY += (targetNY - cursorNY) * 0.05
    ctx.clearRect(0, 0, w, h)
    ctx.font = `${fontSize}px ${fontFamily}`
    ctx.textBaseline = 'top'
    revealT += 1 / 60
    updateGlitches(revealT)
    const midX = cols / 2, midY = rows / 2

    for (let row = 0; row < rows; row++) {
      const rowGlitch = glitchRows.get(row) || 0
      for (let col = 0; col < cols; col++) {
        const pi = (row * sampledW + col) * 4
        const r = pixelData[pi]!, g = pixelData[pi + 1]!, bv = pixelData[pi + 2]!, a = pixelData[pi + 3]!
        if (a < 10) continue
        let lum = (r * 0.299 + g * 0.587 + bv * 0.114) / 255
        lum = Math.min(1, lum * brightnessBoost * (a / 255))
        lum = Math.round(lum * posterize) / posterize
        if (lum < 0.03) continue
        const edgeDist = Math.min(col / cols, 1 - col / cols)
        const cellIdx = row * cols + col
        const cellThreshold = edgeDist + cellSeed[cellIdx]! * 0.15
        const revealWave = (revealT / 2.0) * 0.6
        if (cellThreshold > revealWave) continue
        const cellReveal = Math.min(1, (revealWave - cellThreshold) * 6)
        const px = col * charW + cursorNX * parallaxStrength + rowGlitch
        const py = row * charH + cursorNY * parallaxStrength * 0.6
        const ci = Math.min(chars.length - 1, Math.floor(lum * (chars.length - 1)))
        const b2 = lum * cellReveal
        const distFromCenter = Math.sqrt(
          Math.pow((col - midX) / midX, 2) + Math.pow((row - midY) / midY, 2)
        )
        const depthFade = Math.max(0.3, 1 - distFromCenter * 0.5)
        const bright = b2 * depthFade
        ctx.fillStyle = colorFn!(bright, distFromCenter)
        ctx.fillText(chars[ci]!, px, py)
      }
    }
    rafId = requestAnimationFrame(draw)
  }

  function onReady() { setup(); draw() }
  sourceImg.onload = onReady
  if (sourceImg.complete && sourceImg.naturalWidth) onReady()
  window.addEventListener('resize', setup)

  return () => {
    cancelAnimationFrame(rafId)
    document.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('resize', setup)
  }
}
