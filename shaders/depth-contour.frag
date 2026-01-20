#version 300 es
precision highp float;

uniform sampler2D u_depthMap;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_contourCount;
uniform float u_lineThickness;
uniform float u_waveAmplitude;
uniform float u_waveFrequency;

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
    vec2 uv = v_texCoord;

    // === WAVY HORIZONTAL DISTORTION ===
    // Multi-frequency horizontal waves
    float wave = 0.0;
    wave += sin(uv.y * u_waveFrequency + u_time * 2.0) * u_waveAmplitude;
    wave += sin(uv.y * u_waveFrequency * 2.0 + u_time * 3.0) * u_waveAmplitude * 0.5;
    wave += sin(uv.y * u_waveFrequency * 0.5 - u_time * 1.5) * u_waveAmplitude * 0.7;

    // Per-scanline jitter
    float lineIndex = floor(uv.y * u_resolution.y);
    float jitter = (rand(vec2(lineIndex, floor(u_time * 30.0))) - 0.5) * 0.003;

    // Apply horizontal distortion
    vec2 distortedUV = vec2(clamp(uv.x + wave + jitter, 0.0, 1.0), uv.y);

    // === SAMPLE DEPTH MAP ===
    float depth = texture(u_depthMap, distortedUV).r;

    // === CONTOUR LINE GENERATION ===
    // Scale depth to contour space
    float scaledDepth = depth * u_contourCount;

    // Get fractional part (position within current contour band)
    float bandPosition = fract(scaledDepth);

    // Calculate screen-space derivative for anti-aliased line width
    float depthDerivative = fwidth(scaledDepth);

    // Line thickness in contour-space units
    float lineWidth = u_lineThickness * max(depthDerivative, 0.01);

    // Generate contour line using smoothstep for anti-aliasing
    // Line appears when bandPosition is close to 0 (band boundary)
    float contourLine = 1.0 - smoothstep(0.0, lineWidth, bandPosition);
    contourLine += 1.0 - smoothstep(0.0, lineWidth, 1.0 - bandPosition);
    contourLine = clamp(contourLine, 0.0, 1.0);

    // === DEPTH-BASED LINE INTENSITY ===
    // Lines are slightly brighter in foreground
    float lineIntensity = mix(0.6, 1.0, depth);

    // === EDGE ENHANCEMENT ===
    // Detect depth edges for extra definition
    float dx = texture(u_depthMap, distortedUV + vec2(1.0/u_resolution.x, 0.0)).r -
               texture(u_depthMap, distortedUV - vec2(1.0/u_resolution.x, 0.0)).r;
    float dy = texture(u_depthMap, distortedUV + vec2(0.0, 1.0/u_resolution.y)).r -
               texture(u_depthMap, distortedUV - vec2(0.0, 1.0/u_resolution.y)).r;
    float edge = length(vec2(dx, dy)) * 10.0;

    // Boost contour at depth edges
    contourLine = min(contourLine + edge * 0.3, 1.0);

    // === OUTPUT ===
    float finalLine = contourLine * lineIntensity;

    // Store: R = line intensity, G = depth, B = edge strength, A = 1
    fragColor = vec4(finalLine, depth, edge, 1.0);
}
