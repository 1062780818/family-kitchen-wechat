import { http } from './http.js';
import { hydrateImagePayload } from './storage.js';

export const orderApi = {
  create(data) {
    return http.post('/orders', data).then(hydrateImagePayload);
  },
  getActive() {
    return http.get('/orders/active').then(hydrateImagePayload);
  },
  list(params = {}) {
    const query = { ...params };
    if (Array.isArray(query.statuses)) query.statuses = query.statuses.join(',');
    return http.get('/orders', query).then(hydrateImagePayload);
  },
  get(id) {
    return http.get(`/orders/${id}`).then(hydrateImagePayload);
  },
  accept(id, data = {}) {
    return http.post(`/orders/${id}/accept`, data).then(hydrateImagePayload);
  },
  reject(id, reason) {
    return http.post(`/orders/${id}/reject`, { reason }).then(hydrateImagePayload);
  },
  setPrepping(id) {
    return http.post(`/orders/${id}/prepping`).then(hydrateImagePayload);
  },
  setCooking(id) {
    return http.post(`/orders/${id}/cooking`).then(hydrateImagePayload);
  },
  serve(id, imageUrls) {
    return http.post(`/orders/${id}/serve`, { imageUrls }).then(hydrateImagePayload);
  },
  cancel(id, reason) {
    return http.post(`/orders/${id}/cancel`, { reason }).then(hydrateImagePayload);
  },
  rate(id, data) {
    return http.post(`/orders/${id}/rating`, data);
  },
};
