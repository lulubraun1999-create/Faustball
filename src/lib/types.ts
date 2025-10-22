export interface UserProfile {
  id: string;
  name?: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
  role?: 'user' | 'admin';
  phone?: string;
  location?: string;
  position?: string[] | 'Abwehr' | 'Zuspiel' | 'Angriff';
  birthday?: string;
  gender?: 'männlich' | 'weiblich' | 'divers (damenteam)' | 'divers (herrenteam)';
}
