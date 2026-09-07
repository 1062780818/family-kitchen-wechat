export function toStableImageRef(value) {
  if (typeof value !== 'string') return value;
  if (value.startsWith('family/')) return value;
  if (!/[?&]X-Amz-Signature=/i.test(value)) return value;
  try {
    const parts = new URL(value).pathname
      .split('/')
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    const familyIndex = parts.indexOf('family');
    return familyIndex >= 0 ? parts.slice(familyIndex).join('/') : value;
  } catch {
    return value;
  }
}
