import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { UserSession, UserRole } from '../types';
import { apiService, auth } from './apiService';

interface Ctx { user: UserSession | null; loading: boolean; login(email: string, senha: string, lembrar: boolean): Promise<void>; logout(): void; refresh(): Promise<void> }
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(!!auth.token);

  useEffect(() => {
    if (!auth.token) return;
    apiService.me().then(setUser).catch(() => auth.clear()).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, senha: string, lembrar: boolean) => {
    const { token } = await apiService.login(email, senha);
    auth.save(token, lembrar);
    setUser(await apiService.me());
  }, []);
  const logout = useCallback(() => { auth.clear(); setUser(null); }, []);
  const refresh = useCallback(async () => { setUser(await apiService.me()); }, []);

  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthCtx.Provider>;
};

export const RequireAuth: React.FC<{ roles?: UserRole[]; children: React.ReactElement }> = ({ roles, children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 font-bold">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};
