export function createAsciiRenderer(opts) {
    const { canvas, imageSrc, chars = ' 0123456789', fontSize = 9, fontFamily = '"DM Mono", monospace', brightnessBoost = 2.2, posterize = 32, parallaxStrength = 8, scale = 1.15, colorFn, } = opts;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, charW = 0, charH = 0, cols = 0, rows = 0;
    let pixelData = null;
    let sampledW = 0, revealT = 0;
    let cursorNX = 0, cursorNY = 0, targetNX = 0, targetNY = 0;
    let cellSeed;
    let glitchRows = new Map();
    let nextGlitchTime = 0;
    let rafId = 0;
    const onMouseMove = (e) => {
        targetNX = (e.clientX / window.innerWidth - 0.5) * 2;
        targetNY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    const sourceImg = new Image();
    sourceImg.crossOrigin = 'anonymous';
    sourceImg.src = imageSrc;
    function setup() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        w = rect.width;
        h = rect.height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = `${fontSize}px ${fontFamily}`;
        charW = ctx.measureText('0').width;
        charH = fontSize;
        cols = Math.ceil(w / charW);
        rows = Math.ceil(h / charH);
        cellSeed = new Float32Array(cols * rows);
        for (let i = 0; i < cols * rows; i++)
            cellSeed[i] = Math.random();
        sampleSource();
    }
    function sampleSource() {
        if (!sourceImg.complete || !sourceImg.naturalWidth)
            return;
        const off = document.createElement('canvas');
        off.width = cols;
        off.height = rows;
        const oc = off.getContext('2d');
        const dw = cols * scale, dh = rows * scale;
        oc.drawImage(sourceImg, 0, 0, sourceImg.naturalWidth, sourceImg.naturalHeight, (cols - dw) / 2, (rows - dh) / 2, dw, dh);
        pixelData = oc.getImageData(0, 0, cols, rows).data;
        sampledW = cols;
    }
    function updateGlitches(time) {
        if (time > nextGlitchTime) {
            glitchRows.clear();
            for (let g = 0; g < 1 + Math.floor(Math.random() * 3); g++) {
                const startRow = Math.floor(Math.random() * rows);
                const ht = 1 + Math.floor(Math.random() * 3);
                const offset = (Math.random() - 0.5) * charW * 6;
                for (let r = startRow; r < Math.min(rows, startRow + ht); r++)
                    glitchRows.set(r, offset);
            }
            nextGlitchTime = time + 0.2 + Math.random() * 0.6;
            setTimeout(() => glitchRows.clear(), 50 + Math.random() * 100);
        }
    }
    function defaultColor(bright) {
        const cr = Math.floor(100 + bright * 155);
        const cg = Math.floor(140 + bright * 115);
        const cb = Math.floor(200 + bright * 55);
        return `rgb(${cr},${cg},${cb})`;
    }
    function draw() {
        if (!pixelData) {
            rafId = requestAnimationFrame(draw);
            return;
        }
        cursorNX += (targetNX - cursorNX) * 0.05;
        cursorNY += (targetNY - cursorNY) * 0.05;
        ctx.clearRect(0, 0, w, h);
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'top';
        revealT += 1 / 60;
        updateGlitches(revealT);
        const midX = cols / 2, midY = rows / 2;
        for (let row = 0; row < rows; row++) {
            const rowGlitch = glitchRows.get(row) || 0;
            for (let col = 0; col < cols; col++) {
                const pi = (row * sampledW + col) * 4;
                const r = pixelData[pi], g = pixelData[pi + 1], bv = pixelData[pi + 2], a = pixelData[pi + 3];
                if (a < 10)
                    continue;
                let lum = (r * 0.299 + g * 0.587 + bv * 0.114) / 255;
                lum = Math.min(1, lum * brightnessBoost * (a / 255));
                lum = Math.round(lum * posterize) / posterize;
                if (lum < 0.03)
                    continue;
                const edgeDist = Math.min(col / cols, 1 - col / cols);
                const cellIdx = row * cols + col;
                const cellThreshold = edgeDist + cellSeed[cellIdx] * 0.15;
                const revealWave = (revealT / 2.0) * 0.6;
                if (cellThreshold > revealWave)
                    continue;
                const cellReveal = Math.min(1, (revealWave - cellThreshold) * 6);
                const px = col * charW + cursorNX * parallaxStrength + rowGlitch;
                const py = row * charH + cursorNY * parallaxStrength * 0.6;
                const ci = Math.min(chars.length - 1, Math.floor(lum * (chars.length - 1)));
                const b2 = lum * cellReveal;
                const distFromCenter = Math.sqrt(Math.pow((col - midX) / midX, 2) + Math.pow((row - midY) / midY, 2));
                const depthFade = Math.max(0.3, 1 - distFromCenter * 0.5);
                const bright = b2 * depthFade;
                ctx.fillStyle = colorFn ? colorFn(bright, distFromCenter) : defaultColor(bright);
                ctx.fillText(chars[ci], px, py);
            }
        }
        rafId = requestAnimationFrame(draw);
    }
    function onReady() { setup(); draw(); }
    sourceImg.onload = onReady;
    if (sourceImg.complete && sourceImg.naturalWidth)
        onReady();
    window.addEventListener('resize', setup);
    return () => {
        cancelAnimationFrame(rafId);
        document.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('resize', setup);
    };
}
