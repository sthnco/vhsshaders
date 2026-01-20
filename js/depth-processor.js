import { pipeline, RawImage } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

let depthEstimator = null;

export async function initDepthEstimator(onProgress) {
    if (depthEstimator) return depthEstimator;

    depthEstimator = await pipeline(
        'depth-estimation',
        'onnx-community/depth-anything-v2-small',
        {
            device: 'webgpu',
            progress_callback: onProgress
        }
    ).catch(async () => {
        // Fallback to WASM if WebGPU not available
        console.log('WebGPU not available, falling back to WASM');
        return await pipeline(
            'depth-estimation',
            'onnx-community/depth-anything-v2-small',
            {
                device: 'wasm',
                progress_callback: onProgress
            }
        );
    });

    return depthEstimator;
}

export async function generateDepthMap(imageUrl) {
    if (!depthEstimator) {
        throw new Error('Depth estimator not initialized');
    }

    // Pass the URL string directly to the pipeline
    const result = await depthEstimator(imageUrl);

    // result.depth is a RawImage with depth values
    const depthImage = result.depth;

    // Get dimensions
    const width = depthImage.width;
    const height = depthImage.height;

    // Convert to normalized float array [0, 1]
    const depthData = new Float32Array(width * height);
    const rawData = depthImage.data;

    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < rawData.length; i++) {
        if (rawData[i] < min) min = rawData[i];
        if (rawData[i] > max) max = rawData[i];
    }

    // Normalize to [0, 1]
    const range = max - min || 1;
    for (let i = 0; i < rawData.length; i++) {
        depthData[i] = (rawData[i] - min) / range;
    }

    return {
        data: depthData,
        width,
        height
    };
}

export async function loadImageAsUrl(file) {
    return URL.createObjectURL(file);
}

export async function getImageDimensions(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = url;
    });
}
