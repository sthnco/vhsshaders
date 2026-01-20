#version 300 es
precision highp float;

uniform sampler2D u_depthMap;
uniform vec2 u_resolution;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    // Flip Y coordinate to correct orientation
    vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    float depth = texture(u_depthMap, uv).r;

    // Display depth as grayscale (white = close, black = far)
    fragColor = vec4(vec3(depth), 1.0);
}
