
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Loader2, Users, Users2 } from 'lucide-react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
} from '@/firebase';
import { collection } from 'firebase/firestore';
import type { Group } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function VerwaltungGruppenPage() {
  const firestore = useFirestore();
  const router = useRouter();
  const [selectedClass, setSelectedClass] = useState<Group | null>(null);

  const groupsRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'groups') : null),
    [firestore]
  );
  const { data: groups, isLoading } = useCollection<Group>(groupsRef);

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
        }
    }
  }, [groups, classes, selectedClass]);


  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
       <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
            <Users2 className="h-8 w-8 text-primary" />
            <span className="font-headline">Gruppen</span>
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
            <CardTitle className="text-xl">
              {selectedClass ? selectedClass.name : (isLoading ? 'Laden...' : 'Keine Obergruppe ausgewählt')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
               <div className="flex justify-center p-12">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
               </div>
            ) : teams.length > 0 ? (
              <div className="space-y-2">
                {teams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-md border p-3 hover:bg-accent/50"
                  >
                    {team.name}
                  </div>
                ))}
              </div>
            ) : (
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
