#version 300 es

uniform sampler2D u_depthMap;
uniform mat4 u_viewMatrix;
uniform mat4 u_projMatrix;
uniform vec2 u_imageSize;
uniform float u_pointSize;
uniform float u_depthScale;

out float v_depth;
out vec2 v_uv;
flat out int v_vertexID;

void main() {
    v_vertexID = gl_VertexID;
    // Calculate UV from vertex ID (we're drawing a grid of points)
    int width = int(u_imageSize.x);
    int x = gl_VertexID % width;
    int y = gl_VertexID / width;

    vec2 uv = vec2(float(x) / u_imageSize.x, float(y) / u_imageSize.y);
    v_uv = uv;

    // Sample depth at this point
    float depth = texture(u_depthMap, uv).r;
    v_depth = depth;

    // Convert to 3D position
    // X and Y centered around origin, Z from depth
    vec3 position = vec3(
        (uv.x - 0.5) * 2.0,                    // X: -1 to 1
        (0.5 - uv.y) * 2.0 * (u_imageSize.y / u_imageSize.x), // Y: maintain aspect ratio, flip
        (depth - 0.5) * u_depthScale           // Z: depth scaled
    );

    // Apply view and projection matrices
    vec4 viewPos = u_viewMatrix * vec4(position, 1.0);
    gl_Position = u_projMatrix * viewPos;

    // Point size - larger when closer, smaller when further
    float dist = length(viewPos.xyz);
    gl_PointSize = u_pointSize / dist;
}
