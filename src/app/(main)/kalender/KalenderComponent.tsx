// WICHTIG: Diese Komponente läuft NUR im Client
'use client';

import React, { useEffect, useRef, useState } from 'react';
// HIER ist der import - er passiert jetzt nur noch im Client
import Calendar from 'tui-calendar';

// CSS-Importe
import 'tui-calendar/dist/tui-calendar.css';
import 'tui-date-picker/dist/tui-date-picker.css';
import 'tui-time-picker/dist/tui-time-picker.css';

// ##### 1. Kalender-Definitionen (unsere Filter) #####
const initialCalendarDefinitions = [
    { id: 'herren2', name: 'Herren 2 (LL)', color: '#ffffff', bgColor: '#00a9ff', borderColor: '#00a9ff', visible: true, },
    { id: 'u19', name: 'U19', color: '#ffffff', bgColor: '#00a9ff', borderColor: '#00a9ff', visible: true, },
    { id: 'mixed1', name: 'Mixed 1', color: '#ffffff', bgColor: '#00a9ff', borderColor: '#00a9ff', visible: true, },
    { id: 'jahresabschluss', name: 'Jahresabschluss', color: '#ffffff', bgColor: '#e63946', borderColor: '#e63946', visible: true, },
    { id: 'event', name: 'Event', color: '#ffffff', bgColor: '#e63946', borderColor: '#e63946', visible: true, },
    { id: 'training', name: 'Training', color: '#ffffff', bgColor: '#333333', borderColor: '#333333', visible: true, },
    { id: 'spieltag', name: 'Spieltag', color: '#ffffff', bgColor: '#00a9ff', borderColor: '#00a9ff', visible: true, }
];

// ##### 2. Beispiel-Termine (aus deinem Bild) #####
const sampleSchedules = [
    { id: '1', calendarId: 'spieltag', title: 'Spieltag', category: 'allday', start: '2025-11-10', end: '2025-11-10' },
    { id: '2', calendarId: 'training', title: 'Training', category: 'time', start: '2025-11-16T18:00:00', end: '2025-11-16T20:00:00' },
    { id: '3', calendarId: 'training', title: 'Training', category: 'time', start: '2025-11-23T18:00:00', end: '2025-11-23T20:00:00' },
    { id: '4', calendarId: 'training', title: 'Training', category: 'time', start: '2025-11-30T18:00:00', end: '2025-11-30T20:00:00' },
];

const mannschaften = initialCalendarDefinitions.filter(c => ['herren2', 'u19', 'mixed1'].includes(c.id));
const terminarten = initialCalendarDefinitions.filter(c => ['jahresabschluss', 'event', 'training', 'spieltag'].includes(c.id));


// HINWEIS: 'export default'
export default function KalenderComponent() {
    const calendarInstance = useRef<Calendar | null>(null);
    const calendarContainerRef = useRef<HTMLDivElement>(null);
    const calendarTitleRef = useRef<HTMLSpanElement>(null);

    const [checkedCalendars, setCheckedCalendars] = useState(() => {
        const initialState: { [key: string]: boolean } = {};
        initialCalendarDefinitions.forEach(c => { initialState[c.id] = c.visible; });
        return initialState;
    });

    useEffect(() => {
        if (calendarContainerRef.current && !calendarInstance.current) {
            
            const calendar = new Calendar(calendarContainerRef.current, {
                defaultView: 'month',
                useCreationPopup: true,
                useDetailPopup: true,
                calendars: initialCalendarDefinitions, 
                template: {
                    monthDayname: (d: { label: string }) => `<span class="tui-full-calendar-dayname-date">${d.label}</span>`
                }
            });

            calendar.createSchedules(sampleSchedules);
            calendar.setDate(new Date(2025, 10, 12)); 
            calendarInstance.current = calendar;
            updateCalendarTitle();

            Object.entries(checkedCalendars).forEach(([calendarId, isVisible]) => {
                calendar.toggleSchedules(calendarId, !isVisible, true); 
            });
        }
    }, []); 

    const handleFilterChange = (calendarId: string, isChecked: boolean) => {
        setCheckedCalendars(prev => ({ ...prev, [calendarId]: isChecked }));
        if (calendarInstance.current) {
            calendarInstance.current.toggleSchedules(calendarId, !isChecked, true);
        }
    };

    const updateCalendarTitle = () => {
        if (calendarInstance.current && calendarTitleRef.current) {
            const date = calendarInstance.current.getDate();
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            calendarTitleRef.current.textContent = `${year}-${month}`;
        }
    };
    const handleToday = () => { calendarInstance.current?.today(); updateCalendarTitle(); };
    const handlePrev = () => { calendarInstance.current?.prev(); updateCalendarTitle(); };
    const handleNext = () => { calendarInstance.current?.next(); updateCalendarTitle(); };
    const handleMonthView = () => calendarInstance.current?.changeView('month');
    const handleWeekView = () => calendarInstance.current?.changeView('week');
    const handleDayView = () => calendarInstance.current?.changeView('day');

    return (
        <div style={{ display: 'flex', padding: '20px', gap: '20px' }}>
            <div className="filter-sidebar" style={{ minWidth: '200px', background: '#f9f9f9', padding: '15px', borderRadius: '8px' }}>
                <h4>Mannschaften</h4>
                {mannschaften.map(cal => (
                    <div key={cal.id}>
                        <label>
                            <input
                                type="checkbox"
                                checked={checkedCalendars[cal.id]} 
                                onChange={(e) => handleFilterChange(cal.id, e.target.checked)}
                            />
                            <span style={{ color: cal.bgColor, marginLeft: '5px' }}>■</span> {cal.name}
                        </label>
                    </div>
                ))}
                
                <h4 style={{ marginTop: '20px' }}>Terminarten</h4>
                {terminarten.map(cal => (
                    <div key={cal.id}>
                        <label>
                            <input
                                type="checkbox"
                                checked={checkedCalendars[cal.id]}
                                onChange={(e) => handleFilterChange(cal.id, e.target.checked)}
                            />
                            <span style={{ color: cal.bgColor, marginLeft: '5px' }}>■</span> {cal.name}
                        </label>
                    </div>
                ))}
            </div>

            <div className="calendar-main" style={{ flex: 1 }}>
                <div className="calendar-controls" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <button onClick={handleToday}>Heute</button>
                    <button onClick={handlePrev}>‹</button>
                    <button onClick={handleNext}>›</button>
                    <span ref={calendarTitleRef} style={{ fontSize: '1.5em', margin: '0 15px' }}></span>
                    <div className="view-options" style={{ marginLeft: 'auto' }}>
                        <button onClick={handleMonthView}>Monat</button>
                        <button onClick={handleWeekView}>Woche</button>
                        <button onClick={handleDayView}>Tag</button>
                    </div>
                </div>
                <div ref={calendarContainerRef} style={{ height: '80vh' }}></div>
            </div>
        </div>
    );
}