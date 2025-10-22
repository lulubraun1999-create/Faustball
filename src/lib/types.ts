export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: 'user' | 'admin';
}

export interface MemberProfile {
  userId: string;
  phone?: string;
  location?: string;
  position?: string[];
  birthday?: string;
  gender?: 'männlich' | 'weiblich' | 'divers (damenteam)' | 'divers (herrenteam)';
}
