// 静态适配示例：由云函数初始化代码注入官方服务端 auth 对象；本文件不会连接云端。
import { trustedWechatIdentity } from './core.mjs';

export function identityFromCloudBaseAuth(auth) {
  // 官方服务端SDK从运行上下文取得用户信息；不得改读客户端event.openid。
  const user = auth.getUserInfo();
  return trustedWechatIdentity({
    openId: user.openId,
    isAnonymous: user.isAnonymous,
  });
}

export function createHandler({ auth, members, writeService }) {
  return async function handler(event) {
    const identity = identityFromCloudBaseAuth(auth);
    return writeService({
      identity,
      members,
      familyId: event.familyId,
      requestId: event.requestId,
      payload: event.payload,
    });
  };
}
