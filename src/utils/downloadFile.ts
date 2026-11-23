/**
 * Downloads a file from an internal /api/* endpoint using same-origin fetch + Blob URL.
 *
 * Why this is used instead of a raw <a href="/api/..." download> tag:
 * Inside embedded preview iframes behind an auth proxy, top-level link downloads
 * can lose partitioned session context and trigger a proxy cookie redirect instead
 * of fetching the report bytes. Fetching via XHR/fetch keeps the iframe's session
 * and Bearer token intact, verifies the response Content-Type, and saves the exact file.
 */
export async function downloadFromApi(
  url: string,
  fallbackFilename: string,
  authToken?: string | null
): Promise<void> {
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const res = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let message = `Download failed (HTTP ${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = parsed.message;
    } catch {
      // non-JSON body
    }
    throw new Error(message);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new Error('Unexpected HTML response instead of report file. Please refresh and retry.');
  }

  let filename = fallbackFilename;
  const disposition = res.headers.get('content-disposition');
  if (disposition) {
    const match = /filename\*?=(?:UTF-8''|"?)([^";\n]+)"?/i.exec(disposition);
    if (match?.[1]) {
      filename = decodeURIComponent(match[1].replace(/["']/g, '').trim());
    }
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
