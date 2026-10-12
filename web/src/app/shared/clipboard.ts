/** Copies text, falling back to execCommand where the async Clipboard API is unavailable (older Safari, http). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const copied = document.execCommand('copy');
    el.remove();
    return copied;
  }
}
