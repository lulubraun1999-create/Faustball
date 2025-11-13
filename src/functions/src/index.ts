/**
 * Speichert eine Änderung für EINEN einzelnen Termin einer Serie als Ausnahme.
 */
export const saveSingleAppointmentException = onCall(async (request: CallableRequest) => {
    if (!request.auth || !request.auth.token.admin) {
      throw new HttpsError('permission-denied', 'Nur Administratoren können diese Aktion ausführen.');
    }
  
    const data = request.data;
    const userId = request.auth.uid;
  
    // Strenge Validierung der Eingabedaten
    if (!data.originalId || !data.originalDateISO || !data.startDate) {
      throw new HttpsError(
        'invalid-argument',
        'Fehlende Daten für die Ausnahme (originalId, originalDateISO, startDate).'
      );
    }
  
    let originalDate: Date, newStartDate: Date, newEndDate: Date | null;
    try {
      originalDate = new Date(data.originalDateISO);
      newStartDate = new Date(data.startDate);
      newEndDate =
        data.endDate && typeof data.endDate === 'string' && data.endDate.trim() !== ''
          ? new Date(data.endDate)
          : null;
  
      if (!isValid(originalDate) || !isValid(newStartDate) || (newEndDate && !isValid(newEndDate))) {
        throw new Error('Invalid date format provided.');
      }
    } catch (e: any) {
      console.error('Date parsing error:', e);
      throw new HttpsError('invalid-argument', 'Ungültiges Datumsformat übergeben.');
    }
  
    const originalDateStartOfDay = startOfDay(originalDate);
  
    const exceptionsColRef = db.collection('appointmentExceptions');
    const q = exceptionsColRef
      .where('originalAppointmentId', '==', data.originalId)
      .where('originalDate', '==', Timestamp.fromDate(originalDateStartOfDay));
  
    try {
      const querySnapshot = await q.get();
      const existingExceptionDoc = querySnapshot.docs.length > 0 ? querySnapshot.docs[0] : null;
  
      // Nur die Felder, die übergeben wurden
      const modifiedData = {
        startDate: Timestamp.fromDate(newStartDate),
        endDate: newEndDate ? Timestamp.fromDate(newEndDate) : null,
        title: data.title,
        locationId: data.locationId,
        description: data.description,
        meetingPoint: data.meetingPoint,
        meetingTime: data.meetingTime,
        isAllDay: data.isAllDay,
      };
  
      if (existingExceptionDoc) {
        // Update einer bestehenden Ausnahme
        const docRefToUpdate = db.collection('appointmentExceptions').doc(existingExceptionDoc.id);
        await docRefToUpdate.update({
          modifiedData,
          status: 'modified', // Stellt sicher, dass der Status 'modified' ist
          userId,
          lastUpdated: FieldValue.serverTimestamp(),
        });
        return { status: 'success', message: 'Terminänderung erfolgreich aktualisiert.' };
      } else {
        // Neue Ausnahme erstellen
        const newExceptionData = {
          originalAppointmentId: data.originalId,
          originalDate: Timestamp.fromDate(originalDateStartOfDay),
          status: 'modified' as const,
          modifiedData,
          createdAt: FieldValue.serverTimestamp(),
          lastUpdated: FieldValue.serverTimestamp(),
          userId,
        };
        const newDocRef = db.collection('appointmentExceptions').doc();
        await newDocRef.set(newExceptionData);
        return { status: 'success', message: 'Termin erfolgreich als Ausnahme gespeichert.' };
      }
    } catch (error: any) {
      console.error('Error saving single instance exception:', error);
      throw new HttpsError('internal', 'Fehler beim Speichern der Ausnahme.', error.message);
    }
  });
  