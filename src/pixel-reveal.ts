export interface PixelRevealOptions {
  canvas: HTMLCanvasElement
  imageSrc: string
  blockSize?: number
  pixelsPerFrame?: number
  glitchRegion?: number // 0-1, fraction of height from top that gets glitch treatment
  delay?: number
  onComplete?: () => void
}

export function createPixelReveal(opts: PixelRevealOptions): () => void {
  const {
    canvas,
    imageSrc,
    blockSize: BLOCK_SIZE = 8,
    pixelsPerFrame: PIXELS_PER_FRAME = 120,
    glitchRegion = 0.36,
    delay = 200,
    onComplete,
  } = opts

  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  let rafId = 0
  let delayTimer: ReturnType<typeof setTimeout>

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = imageSrc

  img.onload = () => {
    const off = document.createElement('canvas')
    off.width = w; off.height = h
    const oc = off.getContext('2d')!
    oc.drawImage(img, 0, 0, w, h)
    const imgData = oc.getImageData(0, 0, w, h)

    const cols = Math.ceil(w / BLOCK_SIZE)
    const rows = Math.ceil(h / BLOCK_SIZE)

    // Build shuffled block indices (only non-transparent)
    const blocks: number[] = []
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        const sx = Math.min(bx * BLOCK_SIZE + Math.floor(BLOCK_SIZE / 2), w - 1)
        const sy = Math.min(by * BLOCK_SIZE + Math.floor(BLOCK_SIZE / 2), h - 1)
        if (imgData.data[(sy * w + sx) * 4 + 3] > 20) blocks.push(by * cols + bx)
      }
    }
    for (let i = blocks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]]
    }

    let startTime = 0
    let revealed = 0
    let phase = 0
    let phaseOneStart = 0

    function draw(time: number) {
      if (!startTime) startTime = time
      const elapsed = (time - startTime) / 1000

      if (phase === 0) {
        const batch = Math.min(revealed + PIXELS_PER_FRAME, blocks.length)
        for (let i = revealed; i < batch; i++) {
          const idx = blocks[i]
          const bx = idx % cols
          const by = Math.floor(idx / cols)
          const sx = Math.min(bx * BLOCK_SIZE + Math.floor(BLOCK_SIZE / 2), w - 1)
          const sy = Math.min(by * BLOCK_SIZE + Math.floor(BLOCK_SIZE / 2), h - 1)
          const pi = (sy * w + sx) * 4
          ctx.fillStyle = `rgba(${imgData.data[pi]},${imgData.data[pi + 1]},${imgData.data[pi + 2]},${imgData.data[pi + 3] / 255})`
          ctx.fillRect(bx * BLOCK_SIZE, by * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE)
        }
        revealed = batch
        if (revealed >= blocks.length) {
          phase = 1
          phaseOneStart = elapsed
        }
      } else if (phase === 1) {
        const glitchProgress = Math.min(1, (elapsed - phaseOneStart) / 1.5)
        const blockSize = Math.max(1, Math.floor(BLOCK_SIZE * (1 - glitchProgress)))
        const glitchBoundary = h * glitchRegion

        ctx.clearRect(0, 0, w, h)

        // Below glitch boundary: draw crisp
        ctx.drawImage(img, 0, glitchBoundary, w, h - glitchBoundary, 0, glitchBoundary, w, h - glitchBoundary)

        // Above glitch boundary: draw with glitch blocks
        const gc = Math.ceil(w / blockSize)
        const gr = Math.ceil(glitchBoundary / blockSize)
        for (let gy = 0; gy < gr; gy++) {
          for (let gx = 0; gx < gc; gx++) {
            const sx = Math.min(gx * blockSize + Math.floor(blockSize / 2), w - 1)
            const sy = Math.min(gy * blockSize + Math.floor(blockSize / 2), h - 1)
            const pi = (sy * w + sx) * 4
            if (imgData.data[pi + 3] < 20) continue

            let ox = 0
            if (Math.random() < 0.05 * (1 - glitchProgress)) {
              ox = (Math.random() - 0.5) * 24 * (1 - glitchProgress)
            }

            ctx.fillStyle = `rgba(${imgData.data[pi]},${imgData.data[pi + 1]},${imgData.data[pi + 2]},${imgData.data[pi + 3] / 255})`
            ctx.fillRect(gx * blockSize + ox, gy * blockSize, blockSize, blockSize)
          }
        }

        if (glitchProgress >= 1) phase = 2
      } else {
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        onComplete?.()
        return
      }

      rafId = requestAnimationFrame(draw)
    }

    delayTimer = setTimeout(() => { rafId = requestAnimationFrame(draw) }, delay)
  }

  return () => {
    cancelAnimationFrame(rafId)
    clearTimeout(delayTimer)
  }
}
