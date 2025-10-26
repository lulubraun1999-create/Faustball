import { Timestamp } from 'firebase/firestore';

// UserProfile, MemberProfile, Group, GroupMember... (bleiben wie zuvor, stelle sicher, dass 'id' überall string ist)
export interface UserProfile {
  id: string; // Corresponds to Firebase Auth UID
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user';
  firstLoginComplete?: boolean;
}
export interface MemberProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'admin' | 'user';
  birthday?: string;
  gender?: 'Männlich' | 'Weiblich' | 'Divers';
  position?: ('Angriff' | 'Abwehr' | 'Zuspiel')[];
  teams?: string[];
  phone?: string;
  location?: string;
  profilePictureUrl?: string;
}
export interface Group {
  id: string;
  name: string;
  description?: string;
  type: 'class' | 'team';
  parentId?: string | null;
}
export interface GroupMember {
    userId: string;
    firstName: string;
    lastName: string;
    position?: ('Angriff' | 'Abwehr' | 'Zuspiel')[];
    role: 'admin' | 'user';
}
export interface AppointmentType {
  id: string;
  name: string;
}
export interface Location {
  id: string;
  name: string;
  address?: string;
}
export interface Appointment {
  id: string;
  title: string;
  startDate: Timestamp;
  endDate?: Timestamp;
  isAllDay?: boolean;
  appointmentTypeId: string;
  locationId?: string;
  description?: string;
  visibility: {
      type: 'all' | 'specificTeams';
      teamIds: string[];
  };
  recurrence?: 'none' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly';
  recurrenceEndDate?: Timestamp;
  rsvpDeadline?: Timestamp;
  meetingPoint?: string;
  meetingTime?: string;
  createdAt?: Timestamp;
  lastUpdated?: Timestamp;
}
export interface Poll { /* ... wie zuvor ... */ }
export interface NewsArticle { /* ... wie zuvor ... */ }
export interface Penalty { /* ... wie zuvor ... */ }
export interface TreasuryTransaction { /* ... wie zuvor ... */ }


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
    // Füge hier weitere Felder hinzu, die einzeln änderbar sein sollen
  };
  createdAt: Timestamp; // Wann wurde die Ausnahme erstellt
  userId: string; // Wer hat die Ausnahme erstellt (für Nachverfolgung)
}