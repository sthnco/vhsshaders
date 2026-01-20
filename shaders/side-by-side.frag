#version 300 es
precision highp float;

uniform sampler2D u_depthMap;
uniform float u_time;
uniform vec2 u_resolution;

// Contour params
uniform float u_contourCount;
uniform float u_lineThickness;

// Wave params
uniform float u_waveAmplitude;
uniform float u_waveFrequency;
uniform float u_waveSpeed;

// Glow params
uniform float u_glowIntensity;
uniform float u_glowSize;
uniform vec3 u_glowColor;
uniform float u_lineBrightness;

// VHS params
uniform float u_grainAmount;
uniform float u_scanlineIntensity;
uniform float u_jitterAmount;

// Post params
uniform float u_vignetteIntensity;

in vec2 v_texCoord;
out vec4 fragColor;

// Pseudo-random function
float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 renderDepthMap(vec2 uv) {
    float depth = texture(u_depthMap, uv).r;
    return vec3(depth);
}

vec3 renderContourVHS(vec2 uv, vec2 singleRes) {
    // === SAMPLE DEPTH MAP FIRST (undistorted) ===
    float depth = texture(u_depthMap, uv).r;

    // === CALCULATE DEPTH GRADIENT ===
    // This tells us where depth changes (edges/contours) vs flat areas
    float dx = texture(u_depthMap, uv + vec2(1.0/singleRes.x, 0.0)).r -
               texture(u_depthMap, uv - vec2(1.0/singleRes.x, 0.0)).r;
    float dy = texture(u_depthMap, uv + vec2(0.0, 1.0/singleRes.y)).r -
               texture(u_depthMap, uv - vec2(0.0, 1.0/singleRes.y)).r;
    float depthGradient = length(vec2(dx, dy));

    // === CONTOUR LINE GENERATION ===
    float scaledDepth = depth * u_contourCount;
    float bandPosition = fract(scaledDepth);

    // Calculate screen-space derivative for anti-aliased line width
    float depthDerivative = fwidth(scaledDepth);
    float lineWidth = u_lineThickness * max(depthDerivative, 0.015);

    // Generate contour line - only where depth actually changes
    float contourLine = 1.0 - smoothstep(0.0, lineWidth, bandPosition);
    contourLine += 1.0 - smoothstep(0.0, lineWidth, 1.0 - bandPosition);
    contourLine = clamp(contourLine, 0.0, 1.0);

    // Fade out contours in flat areas (where gradient is very low)
    float gradientMask = smoothstep(0.001, 0.02, depthGradient);
    contourLine *= gradientMask;

    // === WAVY DISTORTION APPLIED TO CONTOURS ===
    // Wave distortion affects the contour sampling, not the whole image
    float wave = 0.0;
    wave += sin(uv.y * u_waveFrequency + u_time * u_waveSpeed) * u_waveAmplitude;
    wave += sin(uv.y * u_waveFrequency * 2.3 + u_time * u_waveSpeed * 1.75) * u_waveAmplitude * 0.4;
    wave += sin(uv.y * u_waveFrequency * 0.7 - u_time * u_waveSpeed * 0.9) * u_waveAmplitude * 0.6;

    // Per-scanline jitter for VHS feel
    float lineIndex = floor(uv.y * singleRes.y);
    float jitter = (rand(vec2(lineIndex, floor(u_time * 20.0))) - 0.5) * u_jitterAmount;

    // Sample contours with wave offset for wavy line effect
    vec2 wavyUV = vec2(clamp(uv.x + wave + jitter, 0.0, 1.0), uv.y);
    float wavyDepth = texture(u_depthMap, wavyUV).r;
    float wavyScaled = wavyDepth * u_contourCount;
    float wavyBand = fract(wavyScaled);
    float wavyDerivative = fwidth(wavyScaled);
    float wavyLineWidth = u_lineThickness * max(wavyDerivative, 0.015);

    float wavyContour = 1.0 - smoothstep(0.0, wavyLineWidth, wavyBand);
    wavyContour += 1.0 - smoothstep(0.0, wavyLineWidth, 1.0 - wavyBand);
    wavyContour = clamp(wavyContour, 0.0, 1.0);

    // Recalculate gradient mask for wavy position
    float wdx = texture(u_depthMap, wavyUV + vec2(1.0/singleRes.x, 0.0)).r -
                texture(u_depthMap, wavyUV - vec2(1.0/singleRes.x, 0.0)).r;
    float wdy = texture(u_depthMap, wavyUV + vec2(0.0, 1.0/singleRes.y)).r -
                texture(u_depthMap, wavyUV - vec2(0.0, 1.0/singleRes.y)).r;
    float wavyGradient = length(vec2(wdx, wdy));
    float wavyMask = smoothstep(0.001, 0.02, wavyGradient);
    wavyContour *= wavyMask;

    // Use the wavy contours
    contourLine = wavyContour;

    // Edge enhancement (subtle)
    float edge = depthGradient * 8.0;
    contourLine = min(contourLine + edge * 0.15, 1.0);

    // === GLOW EFFECT ===
    float glow = 0.0;
    float glowSamples = 0.0;
    for (float i = -2.0; i <= 2.0; i += 1.0) {
        for (float j = -2.0; j <= 2.0; j += 1.0) {
            vec2 offset = vec2(i, j) * u_glowSize / singleRes;
            vec2 sampleUV = wavyUV + offset;
            float neighborDepth = texture(u_depthMap, sampleUV).r;
            float neighborScaled = neighborDepth * u_contourCount;
            float neighborBand = fract(neighborScaled);
            float neighborLine = 1.0 - smoothstep(0.0, lineWidth * 1.5, neighborBand);
            neighborLine += 1.0 - smoothstep(0.0, lineWidth * 1.5, 1.0 - neighborBand);

            // Apply gradient mask to glow samples too
            float gdx = texture(u_depthMap, sampleUV + vec2(1.0/singleRes.x, 0.0)).r -
                        texture(u_depthMap, sampleUV - vec2(1.0/singleRes.x, 0.0)).r;
            float gdy = texture(u_depthMap, sampleUV + vec2(0.0, 1.0/singleRes.y)).r -
                        texture(u_depthMap, sampleUV - vec2(0.0, 1.0/singleRes.y)).r;
            float gMask = smoothstep(0.001, 0.02, length(vec2(gdx, gdy)));

            glow += clamp(neighborLine, 0.0, 1.0) * gMask;
            glowSamples += 1.0;
        }
    }
    glow /= glowSamples;

    // === COLOR ===
    // Derive line and background tints from the glow color
    vec3 glowTint = normalize(u_glowColor + 0.001); // Normalized glow direction
    vec3 lineColor = vec3(u_lineBrightness) + glowTint * u_lineBrightness * 0.05;
    vec3 bgColor = glowTint * 0.08 * (1.0 - depth * 0.3);

    vec3 color = bgColor;
    color += u_glowColor * glow * u_glowIntensity;
    color = mix(color, lineColor, contourLine * 0.9);

    // === FILM GRAIN ===
    float grain = rand(uv * singleRes + u_time * 1000.0);
    grain = (grain - 0.5) * u_grainAmount;
    color += grain;

    // === SCANLINES ===
    float scanline = sin(uv.y * singleRes.y * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 0.8);
    color *= mix(1.0 - u_scanlineIntensity, 1.0, scanline);

    // === VIGNETTE ===
    float vignette = 1.0 - length((uv - 0.5) * 1.2) * u_vignetteIntensity;
    color *= vignette;

    return color;
}

// View mode: 0 = contour effect, 1 = depth map
uniform float u_viewMode;

void main() {
    // Flip Y coordinate to correct orientation
    vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);

    vec3 color;

    if (u_viewMode > 0.5) {
        // Depth map view
        color = renderDepthMap(uv);
    } else {
        // Contour VHS effect view
        color = renderContourVHS(uv, u_resolution);
    }

    fragColor = vec4(color, 1.0);
}
