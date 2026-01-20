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

export async function generateDepthMap(imageUrl, onProgress) {
    if (!depthEstimator) {
        throw new Error('Depth estimator not initialized');
    }

    console.log('Starting depth estimation for:', imageUrl);
    const startTime = performance.now();

    // Start a simulated progress indicator (inference doesn't report progress)
    let progressInterval = null;
    if (onProgress) {
        let elapsed = 0;
        progressInterval = setInterval(() => {
            elapsed += 100;
            // Asymptotic progress - never reaches 100% until done
            const progress = Math.min(95, (1 - Math.exp(-elapsed / 5000)) * 100);
            onProgress(Math.round(progress));
        }, 100);
    }

    try {
        // Pass the URL string directly to the pipeline
        const result = await depthEstimator(imageUrl);

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`Depth estimation completed in ${elapsed}s`);

        if (progressInterval) {
            clearInterval(progressInterval);
            onProgress(100);
        }

        return processDepthResult(result);
    } catch (error) {
        if (progressInterval) clearInterval(progressInterval);
        console.error('Depth estimation failed:', error);
        throw error;
    }
}

function processDepthResult(result) {
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

// Maximum dimension to prevent base64 size exceeding API limits
// 5MB limit = ~3.75MB raw (base64 overhead) = ~1250x1250 JPEG at high quality
const MAX_IMAGE_DIMENSION = 1200;

export async function resizeImageIfNeeded(imageUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const { width, height } = img;

            // Check if resizing is needed
            if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
                resolve(imageUrl);
                return;
            }

            // Calculate new dimensions maintaining aspect ratio
            let newWidth, newHeight;
            if (width > height) {
                newWidth = MAX_IMAGE_DIMENSION;
                newHeight = Math.round(height * (MAX_IMAGE_DIMENSION / width));
            } else {
                newHeight = MAX_IMAGE_DIMENSION;
                newWidth = Math.round(width * (MAX_IMAGE_DIMENSION / height));
            }

            // Create canvas and resize
            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, newWidth, newHeight);

            // Convert to blob URL with lower quality to ensure size limit
            canvas.toBlob((blob) => {
                if (blob) {
                    const resizedUrl = URL.createObjectURL(blob);
                    resolve(resizedUrl);
                } else {
                    reject(new Error('Failed to resize image'));
                }
            }, 'image/jpeg', 0.7);
        };
        img.onerror = reject;
        img.src = imageUrl;
    });
}

export async function getImageDimensions(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = url;
    });
}
