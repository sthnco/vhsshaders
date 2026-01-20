export class SplatRenderer {
    constructor(gl) {
        this.gl = gl;
        this.program = null;
        this.depthTexture = null;
        this.numPoints = 0;
        this.imageSize = [0, 0];

        // Camera state
        this.camera = {
            distance: 3.0,
            rotationX: 0.0,    // Pitch
            rotationY: 0.0,    // Yaw
            panX: 0.0,
            panY: 0.0
        };

        // Mouse state
        this.mouse = {
            down: false,
            rightDown: false,
            lastX: 0,
            lastY: 0
        };

        // Splat params
        this.params = {
            pointSize: 15.0,
            depthScale: 1.5,
            glowColor: [0.1, 0.3, 0.9],
            glowIntensity: 0.6,
            // VHS effect params
            contourCount: 25,
            lineThickness: 1.5,
            lineBrightness: 0.9,
            grainAmount: 0.15
        };

        this.time = 0;
    }

    async init(canvas) {
        this.canvas = canvas;
        await this.loadShaders();
        this.setupMouseControls();
    }

    async loadShaders() {
        const gl = this.gl;

        const [vertSource, fragSource] = await Promise.all([
            fetch('shaders/splat.vert').then(r => r.text()),
            fetch('shaders/splat.frag').then(r => r.text())
        ]);

        const vertShader = this.compileShader(gl.VERTEX_SHADER, vertSource);
        const fragShader = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

        this.program = gl.createProgram();
        gl.attachShader(this.program, vertShader);
        gl.attachShader(this.program, fragShader);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            throw new Error(`Splat program link error: ${gl.getProgramInfoLog(this.program)}`);
        }

        gl.deleteShader(vertShader);
        gl.deleteShader(fragShader);
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compile error: ${error}`);
        }

        return shader;
    }

    setupMouseControls() {
        const canvas = this.canvas;

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
            } else if (e.button === 2) {
                this.mouse.rightDown = true;
            }
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;
        });

        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.down = false;
            } else if (e.button === 2) {
                this.mouse.rightDown = false;
            }
        });

        canvas.addEventListener('mouseleave', () => {
            this.mouse.down = false;
            this.mouse.rightDown = false;
        });

        canvas.addEventListener('mousemove', (e) => {
            const dx = e.clientX - this.mouse.lastX;
            const dy = e.clientY - this.mouse.lastY;
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;

            if (this.mouse.down) {
                // Left drag: rotate
                this.camera.rotationY += dx * 0.01;
                this.camera.rotationX += dy * 0.01;
                // Clamp pitch to avoid flipping
                this.camera.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.camera.rotationX));
            } else if (this.mouse.rightDown) {
                // Right drag: pan
                this.camera.panX -= dx * 0.005;
                this.camera.panY += dy * 0.005;
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Scroll: zoom
            this.camera.distance += e.deltaY * 0.005;
            this.camera.distance = Math.max(1.0, Math.min(10.0, this.camera.distance));
        }, { passive: false });

        // Prevent context menu on right click
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setDepthTexture(texture, width, height) {
        this.depthTexture = texture;
        this.imageSize = [width, height];
        this.numPoints = width * height;
    }

    setParams(params) {
        if (params.glowColorR !== undefined) {
            this.params.glowColor = [params.glowColorR, params.glowColorG, params.glowColorB];
        }
        if (params.glowIntensity !== undefined) {
            this.params.glowIntensity = params.glowIntensity;
        }
        if (params.pointSize !== undefined) {
            this.params.pointSize = params.pointSize;
        }
        if (params.depthScale !== undefined) {
            this.params.depthScale = params.depthScale;
        }
        // VHS effect params
        if (params.contourCount !== undefined) {
            this.params.contourCount = params.contourCount;
        }
        if (params.lineThickness !== undefined) {
            this.params.lineThickness = params.lineThickness;
        }
        if (params.lineBrightness !== undefined) {
            this.params.lineBrightness = params.lineBrightness;
        }
        if (params.grainAmount !== undefined) {
            this.params.grainAmount = params.grainAmount;
        }
    }

    // Create view matrix from camera state
    getViewMatrix() {
        const c = this.camera;

        // Calculate camera position on a sphere
        const cosX = Math.cos(c.rotationX);
        const sinX = Math.sin(c.rotationX);
        const cosY = Math.cos(c.rotationY);
        const sinY = Math.sin(c.rotationY);

        const camX = c.distance * cosX * sinY + c.panX;
        const camY = c.distance * sinX + c.panY;
        const camZ = c.distance * cosX * cosY;

        // Look-at matrix (simplified)
        const eye = [camX, camY, camZ];
        const target = [c.panX, c.panY, 0];
        const up = [0, 1, 0];

        return this.lookAt(eye, target, up);
    }

    lookAt(eye, target, up) {
        const zAxis = this.normalize(this.subtract(eye, target));
        const xAxis = this.normalize(this.cross(up, zAxis));
        const yAxis = this.cross(zAxis, xAxis);

        return new Float32Array([
            xAxis[0], yAxis[0], zAxis[0], 0,
            xAxis[1], yAxis[1], zAxis[1], 0,
            xAxis[2], yAxis[2], zAxis[2], 0,
            -this.dot(xAxis, eye), -this.dot(yAxis, eye), -this.dot(zAxis, eye), 1
        ]);
    }

    // Perspective projection matrix
    getProjMatrix(aspect) {
        const fov = Math.PI / 4;
        const near = 0.1;
        const far = 100.0;

        const f = 1.0 / Math.tan(fov / 2);
        const rangeInv = 1.0 / (near - far);

        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (near + far) * rangeInv, -1,
            0, 0, near * far * rangeInv * 2, 0
        ]);
    }

    // Vector math helpers
    subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    cross(a, b) { return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]; }
    dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
    normalize(v) {
        const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        return len > 0 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
    }

    render(width, height) {
        if (!this.depthTexture || !this.program) return;

        this.time += 0.016;
        const gl = this.gl;

        gl.viewport(0, 0, width, height);

        // Background color derived from glow color
        const bgTint = this.params.glowColor.map(c => c * 0.05);
        gl.clearColor(bgTint[0], bgTint[1], bgTint[2], 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Enable blending for soft splats
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Enable depth test but allow some transparency overlap
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        gl.useProgram(this.program);

        // Set uniforms
        const viewMatrix = this.getViewMatrix();
        const projMatrix = this.getProjMatrix(width / height);

        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_viewMatrix'), false, viewMatrix);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_projMatrix'), false, projMatrix);
        gl.uniform2f(gl.getUniformLocation(this.program, 'u_imageSize'), this.imageSize[0], this.imageSize[1]);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_pointSize'), this.params.pointSize);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_depthScale'), this.params.depthScale);
        gl.uniform3fv(gl.getUniformLocation(this.program, 'u_glowColor'), this.params.glowColor);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_glowIntensity'), this.params.glowIntensity);

        // VHS effect uniforms
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_contourCount'), this.params.contourCount);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_lineThickness'), this.params.lineThickness);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_lineBrightness'), this.params.lineBrightness);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_grainAmount'), this.params.grainAmount);
        gl.uniform1f(gl.getUniformLocation(this.program, 'u_time'), this.time);

        // Bind depth texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.depthTexture);
        gl.uniform1i(gl.getUniformLocation(this.program, 'u_depthMap'), 0);

        // Draw points (one per pixel)
        gl.drawArrays(gl.POINTS, 0, this.numPoints);

        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
    }

    resetCamera() {
        this.camera = {
            distance: 3.0,
            rotationX: 0.0,
            rotationY: 0.0,
            panX: 0.0,
            panY: 0.0
        };
    }
}
