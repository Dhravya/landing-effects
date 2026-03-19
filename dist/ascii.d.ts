export interface AsciiOptions {
    canvas: HTMLCanvasElement;
    imageSrc: string;
    chars?: string;
    fontSize?: number;
    fontFamily?: string;
    brightnessBoost?: number;
    posterize?: number;
    parallaxStrength?: number;
    scale?: number;
    colorFn?: (luminance: number, distFromCenter: number) => string;
}
export declare function createAsciiRenderer(opts: AsciiOptions): () => void;
