import { initDepthEstimator, generateDepthMap, loadImageAsUrl, getImageDimensions } from './depth-processor.js';
import { WebGLRenderer } from './webgl-renderer.js';

class VHSDepthEffect {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.renderer = null;
        this.programs = {};
        this.framebuffers = {};
        this.depthTexture = null;
        this.time = 0;
        this.animationId = null;
        this.isRunning = false;

        // Effect parameters
        this.params = {
            contourCount: 30,
            lineThickness: 1.8,
            waveAmplitude: 0.006,
            waveFrequency: 60.0,
            scanlineIntensity: 0.12,
            noiseAmount: 0.08,
            trackingDistortion: 0.008
        };
    }

    async init() {
        this.updateStatus('Initializing WebGL...');

        try {
            this.renderer = new WebGLRenderer(this.canvas);
            await this.loadShaders();
            this.updateStatus('Ready - Upload an image');
        } catch (error) {
            this.updateStatus(`Error: ${error.message}`);
            console.error(error);
        }
    }

    async loadShaders() {
        const vertSource = await fetch('shaders/quad.vert').then(r => r.text());
        const contourFragSource = await fetch('shaders/depth-contour.frag').then(r => r.text());
        const vhsFragSource = await fetch('shaders/vhs-distort.frag').then(r => r.text());
        const compositeFragSource = await fetch('shaders/composite.frag').then(r => r.text());

        this.programs.contour = this.renderer.createProgram(vertSource, contourFragSource);
        this.programs.vhs = this.renderer.createProgram(vertSource, vhsFragSource);
        this.programs.composite = this.renderer.createProgram(vertSource, compositeFragSource);
    }

    async processImage(file) {
        this.showLoading(true, 'Loading image...');

        try {
            // Create blob URL for the image
            const imageUrl = await loadImageAsUrl(file);
            const { width, height } = await getImageDimensions(imageUrl);

            // Resize canvas
            this.renderer.resize(width, height);

            // Create framebuffers
            this.framebuffers.contour = this.renderer.createFramebuffer(width, height);
            this.framebuffers.vhs = this.renderer.createFramebuffer(width, height);

            // Initialize depth estimator
            this.showLoading(true, 'Loading depth model (first time may take a moment)...');
            await initDepthEstimator((progress) => {
                if (progress.status === 'progress') {
                    const pct = Math.round((progress.loaded / progress.total) * 100);
                    this.showLoading(true, `Downloading model: ${pct}%`);
                }
            });

            // Generate depth map - pass the URL string
            this.showLoading(true, 'Generating depth map...');
            const depthMap = await generateDepthMap(imageUrl);

            // Upload depth texture
            this.depthTexture = this.renderer.createDepthTexture(depthMap);

            // Clean up blob URL
            URL.revokeObjectURL(imageUrl);

            // Start rendering
            this.showLoading(false);
            this.updateStatus('Rendering...');
            this.startRenderLoop();

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

        // Pass 1: Depth Contours
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.contour.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.programs.contour);

        this.renderer.setTextureUniform(this.programs.contour, 'u_depthMap', this.depthTexture, 0);
        this.renderer.setUniform(this.programs.contour, 'u_time', this.time);
        this.renderer.setUniform(this.programs.contour, 'u_resolution', [width, height]);
        this.renderer.setUniform(this.programs.contour, 'u_contourCount', this.params.contourCount);
        this.renderer.setUniform(this.programs.contour, 'u_lineThickness', this.params.lineThickness);
        this.renderer.setUniform(this.programs.contour, 'u_waveAmplitude', this.params.waveAmplitude);
        this.renderer.setUniform(this.programs.contour, 'u_waveFrequency', this.params.waveFrequency);

        this.renderer.drawQuad();

        // Pass 2: VHS Distortion
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.vhs.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.programs.vhs);

        this.renderer.setTextureUniform(this.programs.vhs, 'u_contourTexture', this.framebuffers.contour.texture, 0);
        this.renderer.setUniform(this.programs.vhs, 'u_time', this.time);
        this.renderer.setUniform(this.programs.vhs, 'u_resolution', [width, height]);
        this.renderer.setUniform(this.programs.vhs, 'u_scanlineIntensity', this.params.scanlineIntensity);
        this.renderer.setUniform(this.programs.vhs, 'u_noiseAmount', this.params.noiseAmount);
        this.renderer.setUniform(this.programs.vhs, 'u_trackingDistortion', this.params.trackingDistortion);

        this.renderer.drawQuad();

        // Pass 3: Final Composite
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.programs.composite);

        this.renderer.setTextureUniform(this.programs.composite, 'u_vhsTexture', this.framebuffers.vhs.texture, 0);
        this.renderer.setTextureUniform(this.programs.composite, 'u_depthMap', this.depthTexture, 1);
        this.renderer.setUniform(this.programs.composite, 'u_time', this.time);
        this.renderer.setUniform(this.programs.composite, 'u_resolution', [width, height]);

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
});
