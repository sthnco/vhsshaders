#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
    // Flip Y coordinate to correct orientation
    vec2 uv = vec2(v_texCoord.x, 1.0 - v_texCoord.y);
    fragColor = texture(u_texture, uv);
}
