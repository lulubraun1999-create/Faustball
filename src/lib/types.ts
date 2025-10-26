import { Timestamp } from 'firebase/firestore';

/**
 * Represents the core user data stored in Firestore under the /users collection.
 * This is primarily used for role management and basic user identification.
 */
export interface UserProfile {
  id: string; // Corresponds to Firebase Auth UID
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user'; // Defines user permissions
  firstLoginComplete?: boolean;
}

/**
 * Represents detailed member information stored in Firestore under the /members collection.
 * This extends basic user info with details relevant to club membership and activities.
 */
export interface MemberProfile {
  userId: string; // Corresponds to Firebase Auth UID, acts as document ID
  firstName: string; // Denormalized for easier querying/display
  lastName: string; // Denormalized for easier querying/display
  email: string; // Denormalized for easier querying/display
  role: 'admin' | 'user'; // Denormalized for easier querying/display
  birthday?: string; // Date string (e.g., "YYYY-MM-DD")
  gender?: 'Männlich' | 'Weiblich' | 'Divers';
  position?: ('Angriff' | 'Abwehr' | 'Zuspiel')[]; // Array of positions
  teams?: string[]; // Array of Group IDs (where group.type is 'team')
  phone?: string;
  location?: string; // City or address
  profilePictureUrl?: string; // URL to the profile picture in Firebase Storage
}

/**
 * Represents a group, which can be either a 'class' (like "Jugend", "Erwachsene")
 * or a 'team' (like "Herren 1", "Damen"). Teams usually belong to a class.
 * Stored in Firestore under the /groups collection.
 */
export interface Group {
  id: string;
  name: string;
  description?: string;
  type: 'class' | 'team';
  parentId?: string | null; // ID of the parent group (class) if it's a team
}

/**
 * Represents a simplified member entry stored within a group's subcollection
 * (/groups/{groupId}/members/{userId}) for quick lookups of group members.
 * This data is denormalized from the main MemberProfile.
 */
export interface GroupMember {
    userId: string;
    firstName: string;
    lastName: string;
    position?: ('Angriff' | 'Abwehr' | 'Zuspiel')[];
    role: 'admin' | 'user';
}

/**
 * Represents a type category for appointments.
 * Stored in Firestore under the /appointmentTypes collection.
 */
export interface AppointmentType {
  id: string;
  name: string; // e.g., "Training", "Spieltag", "Event", "Sitzung"
}

/**
 * Represents a physical location for appointments.
 * Stored in Firestore under the /locations collection.
 */
export interface Location {
  id: string;
  name: string; // e.g., "Fritz-Jacobi-Anlage", "Halle Ostermann-Arena"
  address?: string; // e.g., "Kalkstr. 46, 51377 Leverkusen"
}

/**
 * Represents an event or appointment.
 * Stored in Firestore under the /appointments collection.
 */
export interface Appointment {
  id: string;
  title: string;
  startDate: Timestamp; // Start date and time
  endDate?: Timestamp; // Optional end date and time
  isAllDay?: boolean; // Indicates if it's an all-day event
  appointmentTypeId: string; // Reference to AppointmentType ID
  locationId?: string; // Optional reference to Location ID
  description?: string;
  visibility: { // Controls who can see the appointment
      type: 'all' | 'specificTeams';
      teamIds: string[]; // List of Group IDs (teams) if type is 'specificTeams'
  };
  recurrence?: 'none' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly'; // Recurrence rule
  recurrenceEndDate?: Timestamp; // End date for the recurrence
  rsvpDeadline?: Timestamp; // Optional deadline for responses
  meetingPoint?: string; // Optional meeting point description
  meetingTime?: string; // Optional meeting time description (e.g., "1h vor Beginn")
  createdAt?: Timestamp; // Optional: Server timestamp when created
  lastUpdated?: Timestamp;
}


/**
 * Represents a poll or survey.
 * Stored in Firestore under the /polls collection.
 */
export interface Poll {
  id: string;
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

/**
 * Represents a news article or announcement.
 * Stored in Firestore under the /news collection.
 */
export interface NewsArticle {
  id: string;
  title: string;
  content?: string;
  imageUrls: string[];
  createdAt: any; // Firestore Timestamp
}

/**
 * Represents a rule for automated penalties in the treasury.
 * Stored in Firestore under the /penalties collection.
 */
export interface Penalty {
    id: string;
    teamId: string;
    description: string;
    amount: number;
}

/**
 * Represents a transaction in a team's treasury.
 * Stored in Firestore under the /treasury collection.
 */
export interface TreasuryTransaction {
    id: string;
    teamId: string;
    description: string;
    amount: number;
    date: any; // Firestore Timestamp
    type: 'income' | 'expense' | 'penalty';
    memberId?: string;
    status: 'paid' | 'unpaid';
}

// *** NEU: Typ für Termin-Ausnahmen ***
export interface AppointmentException {
  id?: string; // ID der Ausnahme, wird von Firestore hinzugefügt
  originalAppointmentId: string; // ID der ursprünglichen Terminserie (Appointment.id)
  originalDate: Timestamp; // Das ursprüngliche Datum des betroffenen Termins (nur Datum, Zeit wird ignoriert)
  status: 'cancelled' | 'modified'; // Art der Ausnahme
  modifiedData?: { // Nur relevant, wenn status 'modified' ist
    startDate?: Timestamp; // Die neue Startzeit für diesen Tag
    endDate?: Timestamp; // Die neue Endzeit für diesen Tag
    title?: string; // Der neue Titel für diesen Tag
    locationId?: string; // Der neue Ort für diesen Tag
    description?: string; // Die neue Beschreibung für diesen Tag
    meetingPoint?: string; // Der neue Treffpunkt für diesen Tag
    meetingTime?: string; // Die neue Treffzeit für diesen Tag
  };
  createdAt: Timestamp; // Wann wurde die Ausnahme erstellt
  userId: string; // Wer hat die Ausnahme erstellt (für Nachverfolgung)
}