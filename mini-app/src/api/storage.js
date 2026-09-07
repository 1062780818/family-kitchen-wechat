import { apiBaseUrl, http } from './http.js';
import { toStableImageRef } from '../utils/storage-ref.mjs';

export { toStableImageRef } from '../utils/storage-ref.mjs';

/**
 * 走 uni.uploadFile 上传单图到 /storage/upload?category=...
 * @returns {Promise<{ url: string, key: string, size: number, mimeType: string }>}
 */
export function uploadImage(filePath, category = 'other') {
  const token = uni.getStorageSync('token') || '';
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: `${apiBaseUrl}/storage/upload?category=${encodeURIComponent(category)}`,
      filePath,
      name: 'file',
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        try {
          const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            uni.showToast({ title: data?.message || '上传失败', icon: 'none' });
            reject(data);
          }
        } catch (err) {
          uni.showToast({ title: '上传响应解析失败', icon: 'none' });
          reject(err);
        }
      },
      fail: (err) => {
        uni.showToast({ title: '网络错误', icon: 'none' });
        reject(err);
      },
    });
  });
}

/** Convert a stable family object key (or a legacy signed URL) to its stable key. */
export async function resolveImageRef(value) {
  const ref = toStableImageRef(value);
  if (typeof ref !== 'string' || !ref.startsWith('family/')) return value;
  const response = await http.get('/storage/url', { key: ref }, { silent: true });
  return response.url;
}

/**
 * Hydrate image fields for display while preserving stable references in sibling
 * `imageRefs`, `servedImageRefs` and `avatarRef` fields.
 */
export async function hydrateImagePayload(payload) {
  async function walk(value) {
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (!value || typeof value !== 'object') return value;
    const output = { ...value };
    for (const [name, child] of Object.entries(value)) {
      if ((name === 'imageUrls' || name === 'servedImageUrls') && Array.isArray(child)) {
        const refs = child.map(toStableImageRef);
        const refName = name === 'servedImageUrls' ? 'servedImageRefs' : 'imageRefs';
        output[refName] = refs;
        output[name] = await Promise.all(refs.map(resolveImageRef));
      } else if (name === 'avatarUrl' && typeof child === 'string') {
        const ref = toStableImageRef(child);
        output.avatarRef = ref;
        output.avatarUrl = await resolveImageRef(ref);
      } else {
        output[name] = await walk(child);
      }
    }
    return output;
  }
  return walk(payload);
}

/**
 * 从相册选 1~N 张图，依次上传，返回含稳定 key 与临时 URL 的结果数组。
 */
export async function chooseAndUploadImages({ count = 5, category = 'other' } = {}) {
  const chosen = await new Promise((resolve, reject) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: resolve,
      fail: reject,
    });
  });
  const filePaths = chosen.tempFilePaths || [];
  const results = [];
  for (const path of filePaths) {
    const r = await uploadImage(path, category);
    results.push(r);
  }
  return results;
}
