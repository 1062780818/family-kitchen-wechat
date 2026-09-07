import { http } from './http.js';
import { hydrateImagePayload } from './storage.js';

export const recipeApi = {
  list(params = {}) {
    const query = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') query[k] = v;
    }
    if (Array.isArray(query.mealTags)) query.mealTags = query.mealTags.join(',');
    if (Array.isArray(query.flavorTags)) query.flavorTags = query.flavorTags.join(',');
    return http.get('/recipes', query).then(hydrateImagePayload);
  },
  random() {
    return http.get('/recipes/random').then(hydrateImagePayload);
  },
  get(id) {
    return http.get(`/recipes/${id}`).then(hydrateImagePayload);
  },
  create(data) {
    return http.post('/recipes', data).then(hydrateImagePayload);
  },
  update(id, data) {
    return http.patch(`/recipes/${id}`, data).then(hydrateImagePayload);
  },
  remove(id) {
    return http.delete(`/recipes/${id}`);
  },
  favorite(id) {
    return http.post(`/recipes/${id}/favorite`);
  },
  unfavorite(id) {
    return http.delete(`/recipes/${id}/favorite`);
  },
};
