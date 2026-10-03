const objectUrls = new Map();

function objectEndpoint(key) {
    const base = import.meta.env.VITE_BASE_URL || '/api';
    return `${base}/object?key=${encodeURIComponent(key)}`;
}

export async function loadObjectUrl(key, {cache = true} = {}) {
    if (!key) return '';
    if (cache && objectUrls.has(key)) return objectUrls.get(key);

    const response = await fetch(objectEndpoint(key), {
        headers: {
            Authorization: localStorage.getItem('token') || '',
        },
        cache: 'no-store',
    });

    if (!response.ok) {
        throw new Error(`Object request failed: ${response.status}`);
    }

    const url = URL.createObjectURL(await response.blob());
    if (cache) objectUrls.set(key, url);
    return url;
}

export async function downloadObject(key, filename = 'download') {
    const url = await loadObjectUrl(key, {cache: false});
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function revokeObjectUrl(key) {
    const url = objectUrls.get(key);
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.delete(key);
}

export function clearObjectUrls() {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
}
