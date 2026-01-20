import { initDepthEstimator, generateDepthMap, loadImageAsUrl, resizeImageIfNeeded } from './depth-processor.js';
import { WebGLRenderer } from './webgl-renderer.js';
import { SplatRenderer } from './splat-renderer.js';

class VHSDepthEffect {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.renderer = null;
        this.splatRenderer = null;
        this.programs = {};
        this.framebuffers = {};
        this.depthTexture = null;
        this.depthMapSize = { width: 0, height: 0 };
        this.sourceImage = null; // Store original image for thumbnail
        this.sourceTexture = null; // WebGL texture for source image
        this.depthMapData = null; // Store depth data for thumbnail
        this.time = 0;
        this.animationId = null;
        this.isRunning = false;

        // View mode: 'effect' = VHS contour, 'depth' = depth map, 'splat' = 3D, 'source' = original image
        this.viewMode = 'effect';

        // Effect parameters (will be updated by sliders)
        this.params = {
            contourCount: 25,
            lineThickness: 1.5,
            waveAmplitude: 0.008,
            waveFrequency: 50,
            waveSpeed: 2,
            glowIntensity: 0.6,
            glowSize: 2,
            glowColorR: 0.1,
            glowColorG: 0.3,
            glowColorB: 0.9,
            lineBrightness: 0.9,
            grainAmount: 0.15,
            scanlineIntensity: 0.08,
            jitterAmount: 0.002,
            vignetteIntensity: 0.3,
            // Splat params
            pointSize: 15,
            depthScale: 1.5
        };
    }

    setViewMode(mode) {
        this.viewMode = mode;
        this.updateLayerSelection();
        this.updateSplatControlsVisibility();
    }

    updateLayerSelection() {
        // Update layer panel selection
        document.querySelectorAll('.layer-item').forEach(item => {
            item.classList.remove('selected');
            if (item.dataset.layer === this.viewMode) {
                item.classList.add('selected');
            }
        });
    }

    updateSplatControlsVisibility() {
        const splatControls = document.getElementById('splat-controls');
        if (splatControls) {
            splatControls.style.display = this.viewMode === 'splat' ? 'block' : 'none';
        }
    }

    setupLayerPanel() {
        document.querySelectorAll('.layer-item').forEach(item => {
            item.addEventListener('click', () => {
                const layer = item.dataset.layer;
                this.setViewMode(layer);
            });
        });
    }

    generateThumbnails() {
        const thumbSize = 32;

        // Source image thumbnail
        if (this.sourceImage) {
            const sourceThumb = document.getElementById('thumb-source');
            if (sourceThumb) {
                sourceThumb.width = thumbSize;
                sourceThumb.height = thumbSize;
                const ctx = sourceThumb.getContext('2d');
                // Draw image scaled to fit thumbnail
                const scale = Math.max(thumbSize / this.sourceImage.width, thumbSize / this.sourceImage.height);
                const w = this.sourceImage.width * scale;
                const h = this.sourceImage.height * scale;
                const x = (thumbSize - w) / 2;
                const y = (thumbSize - h) / 2;
                ctx.fillStyle = '#222';
                ctx.fillRect(0, 0, thumbSize, thumbSize);
                ctx.drawImage(this.sourceImage, x, y, w, h);
            }
        }

        // Depth map thumbnail
        if (this.depthMapData) {
            const depthThumb = document.getElementById('thumb-depth');
            if (depthThumb) {
                depthThumb.width = thumbSize;
                depthThumb.height = thumbSize;
                const ctx = depthThumb.getContext('2d');
                const imgData = ctx.createImageData(thumbSize, thumbSize);

                // Sample depth map at thumbnail resolution
                for (let y = 0; y < thumbSize; y++) {
                    for (let x = 0; x < thumbSize; x++) {
                        const srcX = Math.floor(x / thumbSize * this.depthMapData.width);
                        const srcY = Math.floor(y / thumbSize * this.depthMapData.height);
                        const srcIdx = srcY * this.depthMapData.width + srcX;
                        const val = Math.floor(this.depthMapData.data[srcIdx] * 255);
                        const dstIdx = (y * thumbSize + x) * 4;
                        imgData.data[dstIdx] = val;
                        imgData.data[dstIdx + 1] = val;
                        imgData.data[dstIdx + 2] = val;
                        imgData.data[dstIdx + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }
        }

        // VHS Effect thumbnail (simplified version with glow color)
        if (this.depthMapData) {
            const effectThumb = document.getElementById('thumb-effect');
            if (effectThumb) {
                effectThumb.width = thumbSize;
                effectThumb.height = thumbSize;
                const ctx = effectThumb.getContext('2d');
                const imgData = ctx.createImageData(thumbSize, thumbSize);

                const glowR = Math.floor(this.params.glowColorR * 255);
                const glowG = Math.floor(this.params.glowColorG * 255);
                const glowB = Math.floor(this.params.glowColorB * 255);

                for (let y = 0; y < thumbSize; y++) {
                    for (let x = 0; x < thumbSize; x++) {
                        const srcX = Math.floor(x / thumbSize * this.depthMapData.width);
                        const srcY = Math.floor(y / thumbSize * this.depthMapData.height);
                        const srcIdx = srcY * this.depthMapData.width + srcX;
                        const depth = this.depthMapData.data[srcIdx];

                        // Simplified contour effect
                        const scaledDepth = depth * this.params.contourCount;
                        const band = scaledDepth % 1;
                        const isLine = band < 0.1 || band > 0.9;

                        const dstIdx = (y * thumbSize + x) * 4;
                        if (isLine) {
                            imgData.data[dstIdx] = 220;
                            imgData.data[dstIdx + 1] = 225;
                            imgData.data[dstIdx + 2] = 230;
                        } else {
                            imgData.data[dstIdx] = Math.floor(glowR * 0.3 * depth);
                            imgData.data[dstIdx + 1] = Math.floor(glowG * 0.3 * depth);
                            imgData.data[dstIdx + 2] = Math.floor(glowB * 0.3 * depth);
                        }
                        imgData.data[dstIdx + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }
        }

        // 3D Splat thumbnail (similar to effect but with perspective hint)
        if (this.depthMapData) {
            const splatThumb = document.getElementById('thumb-splat');
            if (splatThumb) {
                splatThumb.width = thumbSize;
                splatThumb.height = thumbSize;
                const ctx = splatThumb.getContext('2d');
                const imgData = ctx.createImageData(thumbSize, thumbSize);

                const glowR = Math.floor(this.params.glowColorR * 255);
                const glowG = Math.floor(this.params.glowColorG * 255);
                const glowB = Math.floor(this.params.glowColorB * 255);

                for (let y = 0; y < thumbSize; y++) {
                    for (let x = 0; x < thumbSize; x++) {
                        const srcX = Math.floor(x / thumbSize * this.depthMapData.width);
                        const srcY = Math.floor(y / thumbSize * this.depthMapData.height);
                        const srcIdx = srcY * this.depthMapData.width + srcX;
                        const depth = this.depthMapData.data[srcIdx];

                        // Simplified contour for 3D hint
                        const scaledDepth = depth * this.params.contourCount;
                        const band = scaledDepth % 1;
                        const isLine = band < 0.12 || band > 0.88;

                        const dstIdx = (y * thumbSize + x) * 4;
                        if (isLine) {
                            imgData.data[dstIdx] = 200;
                            imgData.data[dstIdx + 1] = 210;
                            imgData.data[dstIdx + 2] = 220;
                        } else {
                            imgData.data[dstIdx] = Math.floor(glowR * 0.4 * (0.5 + depth * 0.5));
                            imgData.data[dstIdx + 1] = Math.floor(glowG * 0.4 * (0.5 + depth * 0.5));
                            imgData.data[dstIdx + 2] = Math.floor(glowB * 0.4 * (0.5 + depth * 0.5));
                        }
                        imgData.data[dstIdx + 3] = 255;
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }
        }
    }

    async init() {
        this.updateStatus('Initializing WebGL...');

        try {
            this.renderer = new WebGLRenderer(this.canvas);
            this.splatRenderer = new SplatRenderer(this.renderer.gl);
            await this.splatRenderer.init(this.canvas);
            await this.loadShaders();
            this.setupControls();
            this.updateStatus('Ready - Upload an image');
        } catch (error) {
            this.updateStatus(`Error: ${error.message}`);
            console.error(error);
        }
    }

    setupControls() {
        const sliderIds = [
            'contourCount', 'lineThickness',
            'waveAmplitude', 'waveFrequency', 'waveSpeed',
            'glowIntensity', 'glowSize',
            'lineBrightness',
            'grainAmount', 'scanlineIntensity', 'jitterAmount',
            'vignetteIntensity',
            'pointSize', 'depthScale'
        ];

        sliderIds.forEach(id => {
            const slider = document.getElementById(id);
            const valueDisplay = document.getElementById(`${id}-val`);

            if (slider) {
                // Set initial value from params
                slider.value = this.params[id];
                if (valueDisplay) valueDisplay.textContent = this.params[id];

                // Update on change
                slider.addEventListener('input', () => {
                    const val = parseFloat(slider.value);
                    this.params[id] = val;
                    if (valueDisplay) valueDisplay.textContent = val;
                });
            }
        });

        // Color picker setup
        const colorPicker = document.getElementById('glowColor');
        const hexInput = document.getElementById('glowColorHex');

        const updateColorFromHex = (hex) => {
            // Parse hex to RGB (0-1 range)
            const r = parseInt(hex.slice(1, 3), 16) / 255;
            const g = parseInt(hex.slice(3, 5), 16) / 255;
            const b = parseInt(hex.slice(5, 7), 16) / 255;
            this.params.glowColorR = r;
            this.params.glowColorG = g;
            this.params.glowColorB = b;
        };

        if (colorPicker && hexInput) {
            // Initialize from default
            updateColorFromHex(colorPicker.value);

            // Color picker changes
            colorPicker.addEventListener('input', () => {
                hexInput.value = colorPicker.value;
                updateColorFromHex(colorPicker.value);
            });

            // Hex input changes
            hexInput.addEventListener('input', () => {
                let hex = hexInput.value;
                if (!hex.startsWith('#')) hex = '#' + hex;
                if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    colorPicker.value = hex;
                    updateColorFromHex(hex);
                }
            });
        }
    }

    async loadShaders() {
        const vertSource = await fetch('shaders/quad.vert').then(r => r.text());
        const sideBySideFragSource = await fetch('shaders/side-by-side.frag').then(r => r.text());
        const passthroughFragSource = await fetch('shaders/passthrough.frag').then(r => r.text());

        this.programs.sideBySide = this.renderer.createProgram(vertSource, sideBySideFragSource);
        this.programs.passthrough = this.renderer.createProgram(vertSource, passthroughFragSource);
    }

    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = url;
        });
    }

    async processImage(file) {
        this.showLoading(true, 'Loading image...');

        try {
            // Create blob URL for the image
            const imageUrl = await loadImageAsUrl(file);

            // Load source image for thumbnail and create texture
            this.sourceImage = await this.loadImage(imageUrl);
            this.sourceTexture = this.renderer.createImageTexture(this.sourceImage);

            // Initialize depth estimator
            this.showLoading(true, 'Loading depth model (first time may take a moment)...');
            await initDepthEstimator((progress) => {
                if (progress.status === 'progress') {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    this.showLoading(true, `Downloading model: ${pct}%`);
                }
            });

            // Resize image if needed to avoid base64 size limits
            this.showLoading(true, 'Preparing image...');
            const resizedUrl = await resizeImageIfNeeded(imageUrl);

            // Generate depth map - pass the URL string
            this.showLoading(true, 'Generating depth map... 0%');
            const depthMap = await generateDepthMap(resizedUrl, (progress) => {
                this.showLoading(true, `Generating depth map... ${progress}%`);
            });

            // Store depth data for thumbnails
            this.depthMapData = depthMap;

            // Clean up resized URL if different from original
            if (resizedUrl !== imageUrl) {
                URL.revokeObjectURL(resizedUrl);
            }
            console.log('Depth map generated:', depthMap.width, 'x', depthMap.height);

            // Calculate canvas size maintaining aspect ratio with max dimensions
            const maxWidth = window.innerWidth - 500; // Account for side panels
            const maxHeight = window.innerHeight - 60;
            const aspectRatio = depthMap.width / depthMap.height;

            let canvasWidth, canvasHeight;
            if (maxWidth / aspectRatio <= maxHeight) {
                canvasWidth = Math.min(depthMap.width, maxWidth);
                canvasHeight = canvasWidth / aspectRatio;
            } else {
                canvasHeight = Math.min(depthMap.height, maxHeight);
                canvasWidth = canvasHeight * aspectRatio;
            }

            this.renderer.resize(Math.floor(canvasWidth), Math.floor(canvasHeight));

            // Upload depth texture
            this.depthTexture = this.renderer.createDepthTexture(depthMap);
            this.depthMapSize = { width: depthMap.width, height: depthMap.height };
            console.log('Depth texture created');

            // Set up splat renderer with depth texture
            this.splatRenderer.setDepthTexture(this.depthTexture, depthMap.width, depthMap.height);

            // Clean up blob URL
            URL.revokeObjectURL(imageUrl);

            // Start rendering
            this.showLoading(false);
            this.updateStatus('');
            console.log('Starting render loop, canvas size:', this.canvas.width, 'x', this.canvas.height);
            this.startRenderLoop();

            // Show the layers panel and generate thumbnails
            document.getElementById('layers-panel').classList.remove('hidden');
            this.generateThumbnails();
            this.updateLayerSelection();

        } catch (error) {
            this.showLoading(false);
            this.updateStatus(`Error: ${error.message}`);
            console.error(error);
        }
    }

    startRenderLoop() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.render();
    }

    stopRenderLoop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    render() {
        if (!this.isRunning) return;

        this.time += 0.016;
        const gl = this.renderer.gl;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // 3D Splat mode
        if (this.viewMode === 'splat') {
            this.splatRenderer.setParams(this.params);
            this.splatRenderer.render(width, height);
            this.animationId = requestAnimationFrame(() => this.render());
            return;
        }

        // Source image mode - render the original image
        if (this.viewMode === 'source' && this.sourceTexture) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, width, height);

            const passProgram = this.programs.passthrough;
            gl.useProgram(passProgram);
            this.renderer.setTextureUniform(passProgram, 'u_texture', this.sourceTexture, 0);
            this.renderer.drawQuad();

            this.animationId = requestAnimationFrame(() => this.render());
            return;
        }

        const program = this.programs.sideBySide;

        // Render depth map or contour VHS effect
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.useProgram(program);

        // Base uniforms
        this.renderer.setTextureUniform(program, 'u_depthMap', this.depthTexture, 0);
        this.renderer.setUniform(program, 'u_time', this.time);
        this.renderer.setUniform(program, 'u_resolution', [width, height]);

        // Contour params
        this.renderer.setUniform(program, 'u_contourCount', this.params.contourCount);
        this.renderer.setUniform(program, 'u_lineThickness', this.params.lineThickness);

        // Wave params
        this.renderer.setUniform(program, 'u_waveAmplitude', this.params.waveAmplitude);
        this.renderer.setUniform(program, 'u_waveFrequency', this.params.waveFrequency);
        this.renderer.setUniform(program, 'u_waveSpeed', this.params.waveSpeed);

        // Glow params
        this.renderer.setUniform(program, 'u_glowIntensity', this.params.glowIntensity);
        this.renderer.setUniform(program, 'u_glowSize', this.params.glowSize);
        this.renderer.setUniform(program, 'u_glowColor', [
            this.params.glowColorR,
            this.params.glowColorG,
            this.params.glowColorB
        ]);
        this.renderer.setUniform(program, 'u_lineBrightness', this.params.lineBrightness);

        // VHS params
        this.renderer.setUniform(program, 'u_grainAmount', this.params.grainAmount);
        this.renderer.setUniform(program, 'u_scanlineIntensity', this.params.scanlineIntensity);
        this.renderer.setUniform(program, 'u_jitterAmount', this.params.jitterAmount);

        // Post params
        this.renderer.setUniform(program, 'u_vignetteIntensity', this.params.vignetteIntensity);

        // View mode: 0 = effect, 1 = depth map
        const viewModeNum = this.viewMode === 'depth' ? 1 : 0;
        this.renderer.setUniform(program, 'u_viewMode', viewModeNum);

        this.renderer.drawQuad();

        this.animationId = requestAnimationFrame(() => this.render());
    }

    updateStatus(text) {
        document.getElementById('status').textContent = text;
    }

    showLoading(show, text = '') {
        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loading-text');

        if (show) {
            loading.classList.remove('hidden');
            loadingText.textContent = text;
        } else {
            loading.classList.add('hidden');
        }
    }
}

// Initialize application
const app = new VHSDepthEffect();

document.addEventListener('DOMContentLoaded', async () => {
    await app.init();

    // Set up layer panel click handlers
    app.setupLayerPanel();

    // Handle file upload
    document.getElementById('imageInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await app.processImage(file);
        }
    });
});
