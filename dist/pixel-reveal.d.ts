export interface PixelRevealOptions {
    canvas: HTMLCanvasElement;
    imageSrc: string;
    blockSize?: number;
    pixelsPerFrame?: number;
    glitchRegion?: number;
    delay?: number;
    onComplete?: () => void;
}
export declare function createPixelReveal(opts: PixelRevealOptions): () => void;
