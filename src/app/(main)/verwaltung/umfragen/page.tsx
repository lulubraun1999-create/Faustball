
'use client';

import { useState, useMemo } from 'react';
import {
  useFirestore,
  useCollection,
  useMemoFirebase,
  useUser,
  errorEmitter,
  FirestorePermissionError,
  useDoc,
} from '@/firebase';
import { collection, doc, updateDoc, arrayUnion, arrayRemove, query, where, Timestamp } from 'firebase/firestore';
import type { Poll, MemberProfile } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Loader2, Vote, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isPast } from 'date-fns';
import { de } from 'date-fns/locale';
import type { User } from 'firebase/auth';

export default function UmfragenPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const memberRef = useMemoFirebase(
    () => (firestore && user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: member, isLoading: isLoadingMember } = useDoc<MemberProfile>(memberRef);
  const userTeamIds = useMemo(() => member?.teams || [], [member]);
  
  const nowTimestamp = Timestamp.now();
  
  // *** BEGINN DER KORREKTUR: Spezifische Abfragen statt einer allgemeinen Abfrage ***
  const pollsForAllQuery = useMemoFirebase(
    () => (firestore ? query(
        collection(firestore, 'polls'), 
        where('visibility.type', '==', 'all')
    ) : null),
    [firestore]
  );
  const { data: pollsForAll, isLoading: isLoadingPollsAll } = useCollection<Poll>(pollsForAllQuery);

  const pollsForTeamsQuery = useMemoFirebase(
    () => (firestore && userTeamIds.length > 0
        ? query(
            collection(firestore, 'polls'),
            where('visibility.type', '==', 'specificTeams'),
            where('visibility.teamIds', 'array-contains-any', userTeamIds)
          )
        : null),
    [firestore, userTeamIds]
  );
  const { data: pollsForTeams, isLoading: isLoadingPollsTeams } = useCollection<Poll>(pollsForTeamsQuery);
  
  const visiblePolls = useMemo(() => {
    const allPolls = [...(pollsForAll || []), ...(pollsForTeams || [])];
    // Eindeutige Umfragen sicherstellen, falls eine Umfrage sowohl 'all' als auch ein Team betrifft (sollte nicht passieren, aber sicher ist sicher)
    const uniquePolls = Array.from(new Map(allPolls.map(p => [p.id, p])).values());
    return uniquePolls;
  }, [pollsForAll, pollsForTeams]);
  // *** ENDE DER KORREKTUR ***


  const [votingStates, setVotingStates] = useState<Record<string, boolean>>({});

  const handleVote = async (pollId: string, optionId: string | null) => {
    if (!firestore || !user || !optionId) return;

    setVotingStates((prev) => ({ ...prev, [pollId]: true }));
    const pollDocRef = doc(firestore, 'polls', pollId);

    const currentPoll = visiblePolls?.find((p) => p.id === pollId);
    if (!currentPoll) return;
    
    const existingVote = currentPoll.votes.find(v => v.userId === user.uid);
    
    try {
        // First, remove the existing vote if there is one
        if (existingVote) {
             await updateDoc(pollDocRef, { votes: arrayRemove(existingVote) });
        }
        // Then, add the new vote
        const newVote = { userId: user.uid, optionId: optionId };
        await updateDoc(pollDocRef, { votes: arrayUnion(newVote) });
        
    } catch (e) {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: pollDocRef.path,
          operation: 'update',
          requestResourceData: { votes: 'update' },
        })
      );
    } finally {
      setVotingStates((prev) => ({ ...prev, [pollId]: false }));
    }
  };
  
  const handleRetractVote = async (pollId: string) => {
      if (!firestore || !user) return;
      
      setVotingStates((prev) => ({ ...prev, [`retract-${pollId}`]: true }));
      const pollDocRef = doc(firestore, 'polls', pollId);

      const currentPoll = visiblePolls?.find(p => p.id === pollId);
      const userVote = currentPoll?.votes.find(v => v.userId === user.uid);

      if (!userVote) {
          setVotingStates((prev) => ({ ...prev, [`retract-${pollId}`]: false }));
          return;
      }
      
      try {
          await updateDoc(pollDocRef, {
              votes: arrayRemove(userVote)
          });
      } catch (e) {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
              path: pollDocRef.path,
              operation: 'update',
              requestResourceData: { votes: 'remove' }
          }));
      } finally {
          setVotingStates((prev) => ({ ...prev, [`retract-${pollId}`]: false }));
      }
  };

  const { activePolls, expiredPolls } = useMemo(() => {
    const active: Poll[] = [];
    const expired: Poll[] = [];
    
    // We iterate over 'visiblePolls' now, which already contains only what the user should see.
    visiblePolls.forEach(poll => {
        if (isPast(poll.endDate.toDate())) {
            expired.push(poll);
        } else {
            active.push(poll);
        }
    });

    active.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    expired.sort((a,b) => b.endDate.toMillis() - a.endDate.toMillis());

    return { activePolls: active, expiredPolls: expired };
  }, [visiblePolls]);

  const isLoading = isLoadingPollsAll || isLoadingPollsTeams || isUserLoading || isLoadingMember;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
       <h1 className="mb-6 flex items-center gap-3 text-3xl font-bold">
          <Vote className="h-8 w-8 text-primary" />
          <span className="font-headline">Abstimmungen</span>
        </h1>
      
      <div className="space-y-8">
        <div>
            <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Aktive Umfragen</h2>
            {activePolls.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {activePolls.map(poll => (
                        <PollCard key={poll.id} poll={poll} user={user} onVote={handleVote} onRetract={handleRetractVote} votingStates={votingStates} />
                    ))}
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
                    <Info className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">Derzeit gibt es keine aktiven Umfragen.</p>
                </div>
            )}
        </div>

         <div>
            <h2 className="text-2xl font-semibold mb-4 border-b pb-2">Abgelaufene Umfragen</h2>
            {expiredPolls.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {expiredPolls.map(poll => (
                        <PollCard key={poll.id} poll={poll} user={user} onVote={handleVote} onRetract={handleRetractVote} votingStates={votingStates} />
                    ))}
                </div>
            ) : (
                 <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/50 p-12 text-center">
                    <Info className="h-10 w-10 text-muted-foreground" />
                    <p className="mt-4 text-muted-foreground">Keine abgelaufenen Umfragen vorhanden.</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}


interface PollCardProps {
    poll: Poll;
    user: User | null;
    onVote: (pollId: string, optionId: string | null) => void;
    onRetract: (pollId: string) => void;
    votingStates: Record<string, boolean>;
}

function PollCard({ poll, user, onVote, onRetract, votingStates }: PollCardProps) {
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const userVote = poll.votes.find(v => v.userId === user?.uid);
    const pollExpired = isPast(poll.endDate.toDate());
    const totalVotes = poll.votes.length;

    const canVote = !pollExpired && !userVote;
    const canRetract = !pollExpired && userVote;
    const showResults = pollExpired || !!userVote;

    return (
        <Card className={cn("flex flex-col", pollExpired && "opacity-70")}>
            <CardHeader>
                <CardTitle>{poll.title}</CardTitle>
                <CardDescription>
                    {pollExpired ? "Abstimmung beendet am" : "Endet am"}: {format(poll.endDate.toDate(), 'dd. MMMM yyyy', { locale: de })}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                {showResults ? (
                    <div className="space-y-4">
                        {poll.options.map(option => {
                            const voteCount = poll.votes.filter(v => v.optionId === option.id).length;
                            const percentage = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
                            return (
                                <div key={option.id}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium">{option.text}</span>
                                        <span className="text-muted-foreground">{voteCount} Stimme(n) ({percentage.toFixed(0)}%)</span>
                                    </div>
                                    <Progress value={percentage} />
                                </div>
                            )
                        })}
                         {poll.allowCustomAnswers && poll.votes.some(v => v.customAnswer) && (
                            <div className="pt-2">
                                <h4 className="text-sm font-semibold mb-2">Eigene Antworten:</h4>
                                <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                    {poll.votes.filter(v => v.customAnswer).map((v,i) => <li key={i}>{v.customAnswer}</li>)}
                                </ul>
                            </div>
                        )}
                    </div>
                ) : (
                    <RadioGroup onValueChange={setSelectedOption} disabled={!canVote}>
                        <div className="space-y-2">
                            {poll.options.map(option => (
                                <div key={option.id} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option.id} id={`${poll.id}-${option.id}`} />
                                    <Label htmlFor={`${poll.id}-${option.id}`}>{option.text}</Label>
                                </div>
                            ))}
                        </div>
                    </RadioGroup>
                )}
            </CardContent>
            <CardFooter className="flex justify-end">
                {canVote && (
                    <Button onClick={() => onVote(poll.id!, selectedOption)} disabled={!selectedOption || votingStates[poll.id!]}>
                         {votingStates[poll.id!] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Abstimmen
                    </Button>
                )}
                {canRetract && (
                    <Button variant="outline" onClick={() => onRetract(poll.id!)} disabled={votingStates[`retract-${poll.id!}`]}>
                        {votingStates[`retract-${poll.id!}`] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Stimme zurückziehen
                    </Button>
                )}
                 {pollExpired && !userVote && (
                    <p className="text-sm text-muted-foreground">Sie haben nicht abgestimmt.</p>
                )}
            </CardFooter>
        </Card>
    )
}

    