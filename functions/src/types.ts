import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// +++ HINZUGEFÜGT +++
// Dieser Typ hat in deiner Backend-Typendefinition gefehlt
export interface AppointmentType {
  id: string;
  name: string;
}

export interface Appointment {
  id: string;
  title: string;
  startDate: Timestamp;
  endDate?: Timestamp | null; // <-- KORRIGIERT (erlaube | null)
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
  createdAt?: Timestamp | FieldValue;
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
    endDate?: Timestamp | null; // <-- KORRIGIERT (erlaube | null)
    title?: string;
    locationId?: string;
    description?: string;
    meetingPoint?: string;
    meetingTime?: string;
    isAllDay?: boolean;
  };
  createdAt?: Timestamp | FieldValue;
  userId: string;
}