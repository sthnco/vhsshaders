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
        this.time = 0;
        this.animationId = null;
        this.isRunning = false;

        // View mode: 0 = contour effect, 1 = depth map, 2 = 3D splat
        this.viewMode = 0;

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

    toggleViewMode() {
        // Toggle between 0 (effect) and 1 (depth map) only
        this.viewMode = this.viewMode === 0 ? 1 : 0;
        const btn = document.getElementById('toggleView');
        if (btn) {
            btn.textContent = this.viewMode === 0 ? 'Show Depth Map' : 'Show Effect';
        }
        this.updateSplatControlsVisibility();
    }

    toggle3DMode() {
        // Toggle 3D splat mode
        if (this.viewMode === 2) {
            this.viewMode = 0;
        } else {
            this.viewMode = 2;
        }
        const btn = document.getElementById('toggle3D');
        if (btn) {
            btn.textContent = this.viewMode === 2 ? 'Exit 3D View' : '3D Splat View';
        }
        const viewBtn = document.getElementById('toggleView');
        if (viewBtn) {
            viewBtn.textContent = 'Show Depth Map';
        }
        this.updateSplatControlsVisibility();
    }

    updateSplatControlsVisibility() {
        const splatControls = document.getElementById('splat-controls');
        if (splatControls) {
            splatControls.style.display = this.viewMode === 2 ? 'block' : 'none';
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

        this.programs.sideBySide = this.renderer.createProgram(vertSource, sideBySideFragSource);
    }

    async processImage(file) {
        this.showLoading(true, 'Loading image...');

        try {
            // Create blob URL for the image
            const imageUrl = await loadImageAsUrl(file);

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

            // Show the toggle buttons
            document.getElementById('toggleView').classList.remove('hidden');
            document.getElementById('toggle3D').classList.remove('hidden');

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
        if (this.viewMode === 2) {
            this.splatRenderer.setParams(this.params);
            this.splatRenderer.render(width, height);
            this.animationId = requestAnimationFrame(() => this.render());
            return;
        }

        const program = this.programs.sideBySide;

        // Render side-by-side: depth map | contour VHS effect
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

        // View mode
        this.renderer.setUniform(program, 'u_viewMode', this.viewMode);

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

    // Handle file upload
    document.getElementById('imageInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await app.processImage(file);
        }
    });

    // Handle view toggle
    document.getElementById('toggleView').addEventListener('click', () => {
        app.toggleViewMode();
    });

    // Handle 3D toggle
    document.getElementById('toggle3D').addEventListener('click', () => {
        app.toggle3DMode();
    });
});
