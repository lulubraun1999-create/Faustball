
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Users } from 'lucide-react';

const groupCategories = [
  {
    id: 'damen',
    name: 'Damen',
    teams: [{ id: 'damen-1', name: 'Damen 1' }],
  },
  {
    id: 'herren',
    name: 'Herren',
    teams: [{ id: 'herren-1', name: 'Herren 1' }],
  },
  {
    id: 'jugend',
    name: 'Jugend',
    teams: [
      { id: 'jugend-u18w', name: 'U18 weiblich' },
      { id: 'jugend-u18m', name: 'U18 männlich' },
    ],
  },
  { id: 'mixed', name: 'Mixed', teams: [{ id: 'mixed-1', name: 'Mixed' }] },
  {
    id: 'senioren',
    name: 'Senioren',
    teams: [{ id: 'senioren-1', name: 'Senioren' }],
  },
];

export default function AdminGruppenBearbeitenPage() {
  const [selectedCategory, setSelectedCategory] = useState(
    groupCategories[0]
  );

  return (
    <div className="container mx-auto space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gruppen bearbeiten</h1>
        <Button>Änderungen speichern</Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Left Column: Categories */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">TSV Bayer Leverkusen</CardTitle>
            </CardHeader>
            <CardContent>
              <nav className="flex flex-col space-y-1">
                {groupCategories.map((category) => (
                  <Button
                    key={category.id}
                    variant="ghost"
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      'justify-start px-3 text-left font-normal',
                      selectedCategory.id === category.id &&
                        'bg-accent text-accent-foreground'
                    )}
                  >
                    {category.name}
                  </Button>
                ))}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Teams in Selected Category */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">{selectedCategory.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCategory.teams.length > 0 ? (
                <div className="space-y-2">
                  {selectedCategory.teams.map((team) => (
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
                    Keine Teams in dieser Kategorie.
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
