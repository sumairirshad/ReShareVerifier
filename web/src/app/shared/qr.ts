import { toDataURL } from 'qrcode';

/** PNG data URL of a QR code, for the "open on your phone" steps. */
export function qrDataUrl(text: string): Promise<string> {
  return toDataURL(text, { margin: 0, width: 280, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' } });
}
