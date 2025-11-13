
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Loader2, Users, Users2, ArrowLeft } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import type { Group } from '@/lib/types';
import type { GroupMember } from '@/lib/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';


export default function VerwaltungGruppenPage() {
  const firestore = useFirestore();
  const [selectedClass, setSelectedClass] = useState<Group | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<Group | null>(null);

  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );
  const { data: groups, isLoading } = useCollection<Group>(groupsRef);

  const groupMembersRef = useMemoFirebase(() => 
    (firestore && selectedTeam ? collection(firestore, 'groups', selectedTeam.id, 'members') : null), 
    [firestore, selectedTeam]
  );
  const { data: groupMembers, isLoading: isLoadingMembers } = useCollection<GroupMember>(groupMembersRef);

  const classes =
    groups?.filter((g) => g.type === 'class').sort((a, b) => a.name.localeCompare(b.name)) || [];
  const teams =
    groups?.filter((g) => g.type === 'team' && g.parentId === selectedClass?.id)
      .sort((a, b) => a.name.localeCompare(b.name)) || [];

  useEffect(() => {
    if (!selectedClass && classes.length > 0) {
      setSelectedClass(classes[0]);
    }
     if (selectedClass) {
        const updatedSelectedClass = classes.find(c => c.id === selectedClass.id);
        if(!updatedSelectedClass && classes.length > 0) {
            setSelectedClass(classes[0]);
        } else if (!updatedSelectedClass && classes.length === 0) {
            setSelectedClass(null);
        }
    }
  }, [groups, classes, selectedClass]);
  
  useEffect(() => {
    setSelectedTeam(null);
  }, [selectedClass]);

  const sortedMembers = groupMembers?.slice().sort((a, b) => a.lastName.localeCompare(b.lastName));


  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
       <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Users2 className="h-8 w-8 text-primary" />
            <span className="font-headline">Mannschaften</span>
        </h1>
      </div>
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      <div className="md:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">TSV Bayer Leverkusen</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <nav className="flex flex-col space-y-1">
                {classes.length > 0 ? classes.map((category) => (
                  <Button
                    key={category.id}
                    variant="ghost"
                    onClick={() => setSelectedClass(category)}
                    className={cn(
                      'justify-start px-3 text-left font-normal',
                      selectedClass?.id === category.id &&
                        'bg-accent text-accent-foreground'
                    )}
                  >
                    {category.name}
                  </Button>
                )) : (
                    <p className="text-sm text-muted-foreground p-4 text-center">Noch keine Obergruppen erstellt.</p>
                )}
              </nav>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            {selectedTeam ? (
                 <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedTeam(null)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <CardTitle className="text-xl">{selectedTeam.name}</CardTitle>
                        <CardDescription>Mitgliederliste</CardDescription>
                    </div>
                </div>
            ) : (
                <CardTitle className="text-xl">
                {selectedClass ? selectedClass.name : (isLoading ? 'Laden...' : 'Keine Obergruppe ausgewählt')}
                </CardTitle>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
               <div className="flex justify-center p-12">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
               </div>
            ) : selectedTeam ? (
                // Member List View
                isLoadingMembers ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : sortedMembers && sortedMembers.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nachname</TableHead>
                                <TableHead>Vorname</TableHead>
                                <TableHead>Rolle</TableHead>
                                <TableHead>Position</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sortedMembers.map(member => (
                                <TableRow key={member.userId}>
                                    <TableCell>{member.lastName}</TableCell>
                                    <TableCell>{member.firstName}</TableCell>
                                    <TableCell className="capitalize">{member.role === 'admin' ? 'Trainer' : 'Spieler'}</TableCell>
                                    <TableCell>{member.position?.join(', ') || 'N/A'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                     <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
                        <Users className="h-10 w-10 text-muted-foreground" />
                        <p className="mt-4 text-muted-foreground">
                            Dieser Mannschaft wurden noch keine Mitglieder zugewiesen.
                        </p>
                    </div>
                )
            ) : teams.length > 0 ? (
                // Team List View
              <div className="space-y-2">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    onClick={() => setSelectedTeam(team)}
                    className="rounded-md border p-3 hover:bg-accent/50 cursor-pointer"
                  >
                    {team.name}
                  </div>
                ))}
              </div>
            ) : (
              // Empty State for Teams
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  {selectedClass ? 'Keine Mannschaften in dieser Obergruppe.' : 'Bitte eine Obergruppe auswählen.'}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>

    </div>
  );
}
