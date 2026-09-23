type LoginResult = {
  token: string;
  tokenType?: string;
  expiresIn?: number;
};

type AuthUser = {
  username?: string;
  nickname?: string;
  name?: string;
};

type UserInfo = {
  user?: AuthUser;
  roles?: string[];
  permissions?: string[];
};

export type PageRoute = {
  path?: string;
  hidden?: boolean;
  children?: PageRoute[];
};

export const useAuthApi = () => {
  const { request } = useAdminApi();

  const login = (username: string, password: string) =>
    request<LoginResult>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
  const ssoLogin = (tokenId: string) =>
    request<LoginResult>("/auth/sso/login", {
      method: "POST",
      body: { tokenId },
    });

  const userInfo = () => request<UserInfo>("/auth/user-info");
  const routes = () => request<PageRoute[]>("/auth/routes");
  const logout = () => request<void>("/auth/logout", { method: "POST" });
  return { login, ssoLogin, userInfo, routes, logout };
};
