
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
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  position?: string[];
  birthday?: string;
  gender?: 'männlich' | 'weiblich' | 'divers (Damenteam)' | 'divers (Herrenteam)';
  teams?: string[];
  role?: 'user' | 'admin'; // Add role to member profile
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

export interface Poll {
    id?: string;
    title: string;
    options: { id: string; text: string }[];
    allowCustomAnswers: boolean;
    endDate: any; // Firestore Timestamp
    createdAt: any; // Firestore Timestamp
    visibility: {
        type: 'all' | 'specificTeams';
        teamIds: string[];
    };
    votes: {
        userId: string;
        optionId: string;
        customAnswer?: string;
    }[];
}

export interface NewsArticle {
  id?: string;
  title: string;
  content?: string;
  imageUrls: string[];
  createdAt: any; // Firestore Timestamp
}

export interface Penalty {
    id: string;
    teamId: string;
    description: string;
    amount: number;
}

export interface TreasuryTransaction {
    id: string;
    teamId: string;
    description: string;
    amount: number; // Can be positive or negative
    date: any; // Firestore Timestamp
    type: 'income' | 'expense' | 'penalty';
    memberId?: string; // For penalties
    status: 'paid' | 'unpaid';
}
