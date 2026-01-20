#version 300 es
precision highp float;

uniform sampler2D u_vhsTexture;
uniform sampler2D u_depthMap;
uniform float u_time;
uniform vec2 u_resolution;

in vec2 v_texCoord;
out vec4 fragColor;

// Color palette
const vec3 DEEP_BLUE = vec3(0.02, 0.05, 0.18);
const vec3 MID_BLUE = vec3(0.08, 0.15, 0.45);
const vec3 LIGHT_BLUE = vec3(0.3, 0.5, 0.85);
const vec3 WHITE = vec3(0.85, 0.9, 1.0);
const vec3 HIGHLIGHT = vec3(0.6, 0.8, 1.0);

float rand(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 uv = v_texCoord;

    // Sample textures
    vec4 vhsData = texture(u_vhsTexture, uv);
    float contourIntensity = vhsData.r;
    float depth = texture(u_depthMap, uv).r;

    // === BACKGROUND COLOR (depth-based) ===
    // Deeper areas (lower depth value) are darker blue
    vec3 bgColor = mix(DEEP_BLUE, MID_BLUE, depth);
    bgColor = mix(bgColor, LIGHT_BLUE, pow(depth, 2.5) * 0.4);

    // Add subtle depth-based blue glow
    float depthGlow = pow(depth, 3.0) * 0.2;
    bgColor += vec3(0.0, 0.1, 0.3) * depthGlow;

    // === CONTOUR LINE COLOR ===
    // Lines are white/light blue, with slight depth variation
    vec3 lineColor = mix(HIGHLIGHT, WHITE, depth);

    // === BLEND LINES OVER BACKGROUND ===
    vec3 color = mix(bgColor, lineColor, contourIntensity);

    // === SUBTLE BLUE TINT OVERLAY ===
    color = mix(color, color * vec3(0.85, 0.92, 1.1), 0.15);

    // === FINAL GRAIN PASS ===
    float finalGrain = rand(uv * u_resolution + u_time * 500.0);
    finalGrain = (finalGrain - 0.5) * 0.06;
    color += finalGrain;

    // === VIGNETTE ===
    vec2 vignetteUV = uv * (1.0 - uv);
    float vignette = vignetteUV.x * vignetteUV.y * 20.0;
    vignette = pow(clamp(vignette, 0.0, 1.0), 0.3);
    color *= vignette;

    // === SUBTLE CRT CURVATURE DARKENING ===
    float distFromCenter = length(uv - 0.5) * 2.0;
    float crtDark = 1.0 - pow(distFromCenter, 2.0) * 0.15;
    color *= crtDark;

    // === OUTPUT ===
    // Ensure black background where there's no content
    float hasContent = step(0.001, depth + contourIntensity);
    color *= hasContent;

    // Clamp final output
    color = clamp(color, 0.0, 1.0);

    fragColor = vec4(color, 1.0);
}
