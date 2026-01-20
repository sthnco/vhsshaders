#version 300 es
precision highp float;

uniform sampler2D u_depthMap;
uniform float u_time;
uniform vec2 u_resolution;

in vec2 v_texCoord;
out vec4 fragColor;

// Pseudo-random function
float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// Simple noise function
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = rand(i);
    float b = rand(i + vec2(1.0, 0.0));
    float c = rand(i + vec2(0.0, 1.0));
    float d = rand(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    // Flip Y coordinate to correct orientation
    vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);

    // === PARAMETERS ===
    float contourCount = 25.0;
    float lineThickness = 1.5;
    float waveAmplitude = 0.008;
    float waveFrequency = 50.0;
    float grainAmount = 0.15;

    // === WAVY HORIZONTAL DISTORTION ===
    float wave = 0.0;
    wave += sin(uv.y * waveFrequency + u_time * 2.0) * waveAmplitude;
    wave += sin(uv.y * waveFrequency * 2.3 + u_time * 3.5) * waveAmplitude * 0.4;
    wave += sin(uv.y * waveFrequency * 0.7 - u_time * 1.8) * waveAmplitude * 0.6;

    // Per-scanline jitter for VHS feel
    float lineIndex = floor(uv.y * u_resolution.y);
    float jitter = (rand(vec2(lineIndex, floor(u_time * 20.0))) - 0.5) * 0.002;

    // Apply horizontal distortion
    vec2 distortedUV = vec2(clamp(uv.x + wave + jitter, 0.0, 1.0), uv.y);

    // === SAMPLE DEPTH MAP ===
    float depth = texture(u_depthMap, distortedUV).r;

    // === CONTOUR LINE GENERATION ===
    float scaledDepth = depth * contourCount;
    float bandPosition = fract(scaledDepth);

    // Calculate screen-space derivative for anti-aliased line width
    float depthDerivative = fwidth(scaledDepth);
    float lineWidth = lineThickness * max(depthDerivative, 0.015);

    // Generate contour line
    float contourLine = 1.0 - smoothstep(0.0, lineWidth, bandPosition);
    contourLine += 1.0 - smoothstep(0.0, lineWidth, 1.0 - bandPosition);
    contourLine = clamp(contourLine, 0.0, 1.0);

    // === EDGE ENHANCEMENT ===
    float dx = texture(u_depthMap, distortedUV + vec2(1.0/u_resolution.x, 0.0)).r -
               texture(u_depthMap, distortedUV - vec2(1.0/u_resolution.x, 0.0)).r;
    float dy = texture(u_depthMap, distortedUV + vec2(0.0, 1.0/u_resolution.y)).r -
               texture(u_depthMap, distortedUV - vec2(0.0, 1.0/u_resolution.y)).r;
    float edge = length(vec2(dx, dy)) * 8.0;

    contourLine = min(contourLine + edge * 0.2, 1.0);

    // === GLOW EFFECT ===
    // Sample neighboring depths for glow spread
    float glow = 0.0;
    for (float i = -2.0; i <= 2.0; i += 1.0) {
        for (float j = -2.0; j <= 2.0; j += 1.0) {
            vec2 offset = vec2(i, j) * 2.0 / u_resolution;
            float neighborDepth = texture(u_depthMap, distortedUV + offset).r;
            float neighborScaled = neighborDepth * contourCount;
            float neighborBand = fract(neighborScaled);
            float neighborLine = 1.0 - smoothstep(0.0, lineWidth * 1.5, neighborBand);
            neighborLine += 1.0 - smoothstep(0.0, lineWidth * 1.5, 1.0 - neighborBand);
            glow += clamp(neighborLine, 0.0, 1.0);
        }
    }
    glow /= 25.0;

    // === COLOR: Blue glow with white/gray contour lines ===
    vec3 glowColor = vec3(0.1, 0.3, 0.9); // Deep blue glow
    vec3 lineColor = vec3(0.85, 0.9, 0.95); // Slightly blue-white lines

    // Background is dark blue based on depth
    vec3 bgColor = vec3(0.02, 0.05, 0.15) * (1.0 - depth * 0.3);

    // Combine glow and lines
    vec3 color = bgColor;
    color += glowColor * glow * 0.6; // Blue glow behind lines
    color = mix(color, lineColor, contourLine * 0.9); // White lines on top

    // === FILM GRAIN ===
    float grain = rand(uv * u_resolution + u_time * 1000.0);
    grain = (grain - 0.5) * grainAmount;
    color += grain;

    // === SCANLINES (subtle) ===
    float scanline = sin(uv.y * u_resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 0.8);
    color *= mix(0.92, 1.0, scanline);

    // === VIGNETTE (subtle) ===
    float vignette = 1.0 - length((uv - 0.5) * 1.2) * 0.3;
    color *= vignette;

    fragColor = vec4(color, 1.0);
}
