

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: 'user' | 'admin';
  firstLoginComplete?: boolean;
}

export interface MemberProfile {
  userId: string;
  phone?: string;
  location?: string;
  position?: string[];
  birthday?: string;
  gender?: 'männlich' | 'weiblich' | 'divers (Damenteam)' | 'divers (Herrenteam)';
}

export interface FullUserProfile extends UserProfile, Omit<MemberProfile, 'userId'> {}

export interface Appointment {
  id?: string;
  title: string;
  date: any;
  type: 'Training' | 'Spieltag' | 'Event';
  location?: string;
  description?: string;
}

export interface Group {
  id: string;
  name: string;
  type: 'class' | 'team';
  parentId?: string;
}

    