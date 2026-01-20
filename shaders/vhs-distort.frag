#version 300 es
precision highp float;

uniform sampler2D u_contourTexture;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_scanlineIntensity;
uniform float u_noiseAmount;
uniform float u_trackingDistortion;

in vec2 v_texCoord;
out vec4 fragColor;

// High-quality random
float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

// Noise function
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

    // === VHS TRACKING DISTORTION ===
    // Horizontal displacement that varies with Y
    float trackingNoise = noise(vec2(uv.y * 10.0, u_time * 0.5));
    float tracking = sin(uv.y * 2.0 + u_time) * trackingNoise * u_trackingDistortion;

    // Occasional strong glitch bands
    float glitchBand = step(0.995, rand(vec2(floor(u_time * 8.0), floor(uv.y * 15.0))));
    tracking += glitchBand * (rand(vec2(uv.y, u_time)) - 0.5) * 0.08;

    // === HORIZONTAL SYNC WOBBLE ===
    float hsyncWobble = sin(uv.y * 400.0 + u_time * 8.0) * 0.0008;
    hsyncWobble *= smoothstep(0.0, 0.1, uv.y) * smoothstep(1.0, 0.9, uv.y);

    // === APPLY DISTORTIONS ===
    vec2 distortedUV = vec2(uv.x + tracking + hsyncWobble, uv.y);
    distortedUV = clamp(distortedUV, 0.001, 0.999);

    // === CHROMATIC ABERRATION ===
    float chromaOffset = 0.002 + abs(tracking) * 0.3;
    vec4 rSample = texture(u_contourTexture, distortedUV + vec2(chromaOffset, 0.0));
    vec4 gSample = texture(u_contourTexture, distortedUV);
    vec4 bSample = texture(u_contourTexture, distortedUV - vec2(chromaOffset, 0.0));

    float r = rSample.r;
    float g = gSample.r;
    float b = bSample.r;
    float depth = gSample.g;
    float edge = gSample.b;

    // === SCANLINE EFFECT ===
    float scanlineY = uv.y * u_resolution.y;
    float scanline = sin(scanlineY * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 0.6);
    float scanlineModulation = mix(1.0 - u_scanlineIntensity, 1.0, scanline);

    // === FILM GRAIN / NOISE ===
    float grain = rand(uv * u_resolution + u_time * 1000.0);
    grain = (grain - 0.5) * u_noiseAmount;

    // === VERTICAL BANDING (subtle) ===
    float vBand = sin(uv.x * u_resolution.x * 0.3 + u_time * 30.0);
    vBand = smoothstep(0.0, 0.05, abs(vBand)) * 0.08 + 0.92;

    // === COMBINE EFFECTS ===
    vec3 color = vec3(r, g, b);
    color *= scanlineModulation;
    color *= vBand;
    color += grain;

    // === OUTPUT ===
    fragColor = vec4(color, 1.0);
    fragColor.g = depth;  // Pass depth through for composite
    fragColor.b = edge;   // Pass edge through for composite
}
