import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, AuthState, LoginCredentials, ForgotPasswordRequest, AuthResponse } from '@/types';
import { authApi, LoginResponse } from '@/lib/authApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://api.ethicspress.com';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  loginWithToken: (token: string, userData: any) => void;
  logout: () => Promise<void>;
  forgotPassword: (data: ForgotPasswordRequest) => Promise<void>;
  getToken: () => string | null;
  isReviewer1: boolean;
  isReviewer2: boolean;
  isAnyReviewer: boolean;
  isAuthor: boolean;
  isDesigner: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map API roles to internal roles
const mapApiRole = (apiRole?: string | null): 'reviewer_1' | 'reviewer_2' | 'author' | 'designer' => {
  const normalizedRole = (apiRole || '').toString().trim().toLowerCase();

  switch (normalizedRole) {
    case 'admin':
    case 'decision_reviewer':
    case 'reviewer_1':
    case 'reviewer1':
    case 'dr':
      return 'reviewer_1';
    case 'peer_reviewer':
    case 'reviewer_2':
    case 'reviewer2':
    case 'pr':
      return 'reviewer_2';
    case 'designer':
    case 'cover_designer':
      return 'designer';
    default:
      return 'author'; // Authors and any other role default to author dashboard
  }
};

// Detect whether the raw API role represents an admin user. Admins still act
// as Decision Reviewers (role mapped to 'reviewer_1'), but get extra abilities.
const isAdminApiRole = (apiRole?: string | null): boolean => {
  const normalized = (apiRole || '').toString().trim().toLowerCase();
  return normalized === 'admin';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    profile: null,
    isAuthenticated: false,
    isLoading: true,
  });
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Initialize auth state from localStorage
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        const normalizedUser: User = {
          ...parsedUser,
          role: mapApiRole(parsedUser?.role),
        };

        // Keep localStorage in sync with normalized role values
        localStorage.setItem('user', JSON.stringify(normalizedUser));

        setIsAdmin(isAdminApiRole(parsedUser?.raw_role ?? parsedUser?.role));
        setState({
          user: normalizedUser,
          profile: null,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const loginWithToken = useCallback((token: string, data: any) => {
    // Store token
    localStorage.setItem('auth_token', token);

    const rawRole = data.user?.role || data.role || '';
    // Map user data
    const user: User = {
      id: data.user?.id || data.id || data.email,
      email: data.user?.email || data.email,
      name: data.user?.name || data.name || data.email.split('@')[0],
      role: mapApiRole(rawRole),
    };

    // Persist the raw role alongside the normalized user so we can recover
    // admin status after a page reload without losing DR mapping.
    localStorage.setItem('user', JSON.stringify({ ...user, raw_role: rawRole }));

    setIsAdmin(isAdminApiRole(rawRole));
    setState({
      user,
      profile: null,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    // This is the old flow, kept for compatibility if needed, but the new flow uses authApi directly
    // and calls loginWithToken on success.
    // However, for strict compatibility with existing code calling login(), we can wrap it.
    
    const response = await authApi.login(credentials.email, credentials.password);
    
    if (response.token) {
      loginWithToken(response.token, response);
    } else if (response.requires_otp) {
      // If the old login() is called but OTP is required, we can't fully handle it here without UI changes.
      // The calling component needs to handle requires_otp.
      // For now, we'll throw a specific error or let the component handle it.
      throw { message: 'OTP required', requires_otp: true };
    }
  }, [loginWithToken]);

  const logout = useCallback(async () => {
    // Call API to clear server-side session marker
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await fetch(`${import.meta.env.VITE_API_BASE_URL || 'https://api.ethicspress.com'}/api/proposals/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // Proceed with local cleanup even if API call fails
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setIsAdmin(false);
    setState({
      user: null,
      profile: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const forgotPassword = useCallback(async (data: ForgotPasswordRequest) => {
    await authApi.forgotPassword(data.email);
  }, []);

  const getToken = useCallback(() => {
    return localStorage.getItem('auth_token');
  }, []);

  const isReviewer1 = state.user?.role === 'reviewer_1';
  const isReviewer2 = state.user?.role === 'reviewer_2';
  const isAnyReviewer = isReviewer1 || isReviewer2;
  const isAuthor = state.user?.role === 'author';
  const isDesigner = state.user?.role === 'designer';

  return (
    <AuthContext.Provider 
      value={{ 
        ...state, 
        login, 
        loginWithToken,
        logout, 
        forgotPassword, 
        getToken,
        isReviewer1,
        isReviewer2,
        isAnyReviewer,
        isAuthor,
        isDesigner,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // During HMR, context may temporarily be undefined — redirect to login
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
