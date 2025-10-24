import { Timestamp } from 'firebase/firestore';

/**
 * Represents the core user data stored in Firestore under the /users collection.
 * This is primarily used for role management and basic user identification.
 */
export interface UserProfile {
  id?: string; // Corresponds to Firebase Auth UID
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user'; // Defines user permissions
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
  // Add other relevant fields as needed, e.g., jerseyNumber, registrationDate
}

/**
 * Represents a group, which can be either a 'class' (like "Jugend", "Erwachsene")
 * or a 'team' (like "Herren 1", "Damen"). Teams usually belong to a class.
 * Stored in Firestore under the /groups collection.
 */
export interface Group {
  id?: string;
  name: string;
  description?: string;
  type: 'class' | 'team';
  parentId?: string | null; // ID of the parent group (class) if it's a team
  // Optional: Add fields like coachId, trainingTimes
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
 * NEU: Represents a type category for appointments.
 * Stored in Firestore under the /appointmentTypes collection.
 */
export interface AppointmentType {
  id?: string;
  name: string; // e.g., "Training", "Spieltag", "Event", "Sitzung"
}

/**
 * NEU: Represents a physical location for appointments.
 * Stored in Firestore under the /locations collection.
 */
export interface Location {
  id?: string;
  name: string; // e.g., "Fritz-Jacobi-Anlage", "Halle Ostermann-Arena"
  address?: string; // e.g., "Kalkstr. 46, 51377 Leverkusen"
}

/**
 * Angepasst: Represents an event or appointment.
 * Stored in Firestore under the /appointments collection.
 */
export interface Appointment {
  id?: string;
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
  rsvpDeadline?: Timestamp; // Optional deadline for responses
  meetingPoint?: string; // Optional meeting point description
  meetingTime?: string; // Optional meeting time description (e.g., "1h vor Beginn")
  createdAt?: Timestamp; // Optional: Server timestamp when created
  // Optional: Add fields like createdBy (userId), lastUpdated
}


/**
 * Represents a poll or survey.
 * Stored in Firestore under the /polls collection.
 */
export interface Poll {
  id?: string;
  question: string;
  options: { id: string; text: string }[]; // Array of possible answers
  visibility: { // Controls who can see and vote in the poll
    type: 'all' | 'specificTeams';
    teamIds: string[]; // List of Group IDs (teams) if type is 'specificTeams'
  };
  allowMultipleVotes?: boolean; // Whether users can select more than one option
  createdAt: Timestamp;
  // Optional: createdBy (userId), deadline (Timestamp)
  votes?: { userId: string; optionId: string }[]; // Subcollection or array to store votes
}

/**
 * Represents a news article or announcement.
 * Stored in Firestore under the /news collection.
 */
export interface NewsArticle {
  id?: string;
  title: string;
  content: string; // Can contain markdown or HTML
  imageUrl?: string; // Optional image URL
  authorId: string; // User ID of the author
  createdAt: Timestamp;
  // Optional: lastUpdated, category, targetAudience (similar to poll visibility)
}

/**
 * Represents a rule for automated penalties in the treasury.
 * Stored in Firestore under the /penalties collection.
 */
export interface Penalty {
  id?: string;
  teamId: string; // ID of the team this penalty applies to
  description: string; // e.g., "Training vergessen abzusagen", "Zu spät zum Treffpunkt"
  amount: number; // Penalty amount (positive number)
}

/**
 * Represents a transaction in a team's treasury.
 * Stored in Firestore under the /treasury collection.
 */
export interface TreasuryTransaction {
  id?: string;
  teamId: string; // ID of the team this transaction belongs to
  description: string;
  amount: number; // Positive for income/paid penalties, negative for expenses/unpaid penalties
  date: Timestamp; // Date of the transaction
  type: 'income' | 'expense' | 'penalty';
  memberId?: string; // User ID if it's a penalty assigned to a specific member
  status?: 'paid' | 'unpaid'; // Status, mainly relevant for penalties
}