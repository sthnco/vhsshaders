#version 300 es
precision highp float;

uniform vec3 u_glowColor;
uniform float u_glowIntensity;
uniform float u_contourCount;
uniform float u_lineThickness;
uniform float u_lineBrightness;
uniform float u_time;
uniform float u_grainAmount;

in float v_depth;
in vec2 v_uv;

out vec4 fragColor;

// Pseudo-random function
float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // Calculate distance from center of point (gl_PointCoord is 0-1 within the point)
    vec2 centered = gl_PointCoord - 0.5;
    float dist = length(centered) * 2.0; // 0 at center, 1 at edge

    // Gaussian falloff for soft splat
    float alpha = exp(-dist * dist * 4.0);

    // Discard pixels outside the soft circle
    if (alpha < 0.01) discard;

    // === CONTOUR LINE GENERATION (same as VHS effect) ===
    float scaledDepth = v_depth * u_contourCount;
    float bandPosition = fract(scaledDepth);

    // Line width based on contour thickness
    float lineWidth = u_lineThickness * 0.03;

    // Generate contour line
    float contourLine = 1.0 - smoothstep(0.0, lineWidth, bandPosition);
    contourLine += 1.0 - smoothstep(0.0, lineWidth, 1.0 - bandPosition);
    contourLine = clamp(contourLine, 0.0, 1.0);

    // === COLOR (derived from glow color like VHS effect) ===
    vec3 glowTint = normalize(u_glowColor + 0.001);
    vec3 lineColor = vec3(u_lineBrightness) + glowTint * u_lineBrightness * 0.05;
    vec3 bgColor = glowTint * 0.12 * (1.0 - v_depth * 0.3);

    // Glow effect - simulate by boosting color near contour lines
    float glow = contourLine * 0.6;

    vec3 color = bgColor;
    color += u_glowColor * glow * u_glowIntensity;
    color = mix(color, lineColor, contourLine * 0.9);

    // === FILM GRAIN ===
    float grain = rand(v_uv * 500.0 + u_time * 100.0);
    grain = (grain - 0.5) * u_grainAmount * 0.5;
    color += grain;

    // Boost overall brightness slightly for 3D visibility
    color *= 1.2;

    fragColor = vec4(color, alpha * 0.85);
}
