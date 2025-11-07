
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export interface Appointment {
  id: string;
  title: string;
  startDate: Timestamp;
  endDate: Timestamp | null;
  isAllDay: boolean; // Geändert von optional zu erforderlich
  appointmentTypeId: string;
  locationId?: string;
  description?: string;
  visibility: {
      type: 'all' | 'specificTeams';
      teamIds: string[];
  };
  recurrence: 'none' | 'daily' | 'weekly' | 'bi-weekly' | 'monthly'; // Geändert von optional zu erforderlich
  recurrenceEndDate?: Timestamp | null;
  rsvpDeadline?: Timestamp | null;
  meetingPoint?: string;
  meetingTime?: string;
  createdAt: Timestamp | FieldValue; // Geändert von optional zu erforderlich
  lastUpdated?: Timestamp | FieldValue;
  createdBy: string;
}

export interface AppointmentException {
  id: string;
  originalAppointmentId: string;
  originalDate: Timestamp;
  status: 'cancelled' | 'modified';
  modifiedData?: {
    startDate?: Timestamp;
    endDate?: Timestamp | null;
    title?: string;
    locationId?: string;
    description?: string;
    meetingPoint?: string;
    meetingTime?: string;
    isAllDay?: boolean;
  };
  createdAt: Timestamp | FieldValue; // Geändert von optional zu erforderlich
  lastUpdated?: Timestamp | FieldValue; // Hinzugefügt
  userId: string;
}

export interface AppointmentType {
    id: string;
    name: string;
}

