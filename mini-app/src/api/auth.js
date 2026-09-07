import { http } from './http.js';

export const authApi = {
  /** @param {string} code wx.login() 拿到的 code
   *  @param {string} [gender] 'male' | 'female' */
  wxLogin(code, gender) {
    return http.post('/auth/wx-login', { code, gender });
  },
};
