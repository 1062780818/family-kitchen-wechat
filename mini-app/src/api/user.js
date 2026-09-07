import { http } from './http.js';
import { hydrateImagePayload } from './storage.js';

export const userApi = {
  me() {
    return http.get('/users/me').then(hydrateImagePayload);
  },
  updateMe(data) {
    return http.patch('/users/me', data).then(hydrateImagePayload);
  },
  /** 绑定手机号 + 设置登录密码（开通 H5 账号密码登录） */
  bindCredentials(phone, password) {
    return http.patch('/users/me/credentials', { phone, password }, { silent: true });
  },
  deleteMe() {
    return http.delete('/users/me');
  },
  getChefLevel() {
    return http.get('/users/me/chef-level');
  },
  getNotificationPrefs() {
    return http.get('/users/me/notification-prefs');
  },
  updateNotificationPrefs(prefs) {
    return http.patch('/users/me/notification-prefs', prefs);
  },
};
