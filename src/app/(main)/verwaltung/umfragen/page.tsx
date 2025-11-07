
'use client';

import { useState, useMemo, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';

export default function UmfragenPage() {
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const memberProfileRef = useMemoFirebase(
    () => (user ? doc(firestore, 'members', user.uid) : null),
    [firestore, user]
  );
  const { data: memberProfile, isLoading: isLoadingMemberProfile } = useDoc<MemberProfile>(memberProfileRef);

  const pollsRef = useMemoFirebase(() => (firestore ? collection(firestore, 'polls') : null), [firestore]);
  const { data: visiblePolls, isLoading: isLoadingPolls } = useCollection<Poll>(pollsRef);

  const [votingStates, setVotingStates] = useState<Record<string, boolean>>({});

  const handleVote = async (pollId: string, selectedOptionIds: string[]) => {
    if (!firestore || !user || selectedOptionIds.length === 0) return;

    setVotingStates((prev) => ({ ...prev, [pollId]: true }));
    const pollDocRef = doc(firestore, 'polls', pollId);

    const currentPoll = visiblePolls?.find((p) => p.id === pollId);
    if (!currentPoll) return;

    try {
      // First, remove any existing votes from this user for this poll
      const existingVotes = (currentPoll.votes || []).filter(v => v.userId === user.uid);
      if (existingVotes.length > 0) {
        await updateDoc(pollDocRef, { votes: arrayRemove(...existingVotes) });
      }

      // Then, add the new votes
      const newVotes = selectedOptionIds.map(optionId => ({ userId: user.uid, optionId }));
      await updateDoc(pollDocRef, { votes: arrayUnion(...newVotes) });
      
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
      const userVotes = (currentPoll?.votes || []).filter(v => v.userId === user.uid);

      if (!userVotes || userVotes.length === 0) {
          setVotingStates((prev) => ({ ...prev, [`retract-${pollId}`]: false }));
          return;
      }
      
      try {
          await updateDoc(pollDocRef, {
              votes: arrayRemove(...userVotes)
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
    
    (visiblePolls || []).forEach(poll => {
        if (isPast(poll.endDate.toDate())) {
            expired.push(poll);
        } else {
            active.push(poll);
        }
    });

    active.sort((a,b) => b.createdAt.toMillis() - a.createdAt.toMillis());
    expired.sort((a,b) => b.endDate.toMillis() - b.endDate.toMillis());

    return { activePolls: active, expiredPolls: expired };
  }, [visiblePolls]);

  const isLoading = isLoadingPolls || isUserLoading || isLoadingMemberProfile;

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
                        <PollCard key={poll.id} poll={poll} user={user} memberProfile={memberProfile} onVote={handleVote} onRetract={handleRetractVote} votingStates={votingStates} />
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
                        <PollCard key={poll.id} poll={poll} user={user} memberProfile={memberProfile} onVote={handleVote} onRetract={handleRetractVote} votingStates={votingStates} />
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
    memberProfile: MemberProfile | null;
    onVote: (pollId: string, optionIds: string[]) => void;
    onRetract: (pollId: string) => void;
    votingStates: Record<string, boolean>;
}

function PollCard({ poll, user, memberProfile, onVote, onRetract, votingStates }: PollCardProps) {
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    
    const votes = poll.votes || [];

    const userVotedOptionIds = useMemo(() => {
        return new Set(votes.filter(v => v.userId === user?.uid).map(v => v.optionId));
    }, [votes, user]);
    
    const pollExpired = isPast(poll.endDate.toDate());
    
    const totalUniqueVoters = new Set(votes.map(v => v.userId)).size;

    const canUserVote = useMemo(() => {
        if (!memberProfile) return false;
        if (poll.visibility.type === 'all') return true;
        
        const userTeamIds = new Set(memberProfile.teams || []);
        return poll.visibility.teamIds.some(teamId => userTeamIds.has(teamId));
    }, [poll.visibility, memberProfile]);

    const canVoteNow = !pollExpired && userVotedOptionIds.size === 0 && canUserVote;
    const canRetractVote = !pollExpired && userVotedOptionIds.size > 0 && canUserVote;
    const showResults = pollExpired || userVotedOptionIds.size > 0;


    useEffect(() => {
        // Pre-fill selection if user has already voted
        if (userVotedOptionIds.size > 0) {
            setSelectedOptions(Array.from(userVotedOptionIds));
        } else {
            setSelectedOptions([]);
        }
    }, [poll.id, userVotedOptionIds]);

    const handleSingleSelection = (optionId: string) => {
        setSelectedOptions([optionId]);
    };

    const handleMultipleSelection = (optionId: string, checked: boolean) => {
        setSelectedOptions(prev => {
            if (checked) {
                return [...prev, optionId];
            } else {
                return prev.filter(id => id !== optionId);
            }
        });
    };

    return (
        <Card className={cn("flex flex-col", (pollExpired || !canUserVote) && "opacity-70")}>
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
                            const uniqueVotersForOption = new Set(votes.filter(v => v.optionId === option.id).map(v => v.userId)).size;
                            const percentage = totalUniqueVoters > 0 ? (uniqueVotersForOption / totalUniqueVoters) * 100 : 0;
                            const userVotedForThis = userVotedOptionIds.has(option.id);
                            return (
                                <div key={option.id}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className={cn("font-medium", userVotedForThis && "text-primary")}>{option.text}</span>
                                        <span className="text-muted-foreground">{uniqueVotersForOption} Stimme(n) ({percentage.toFixed(0)}%)</span>
                                    </div>
                                    <Progress value={percentage} />
                                </div>
                            )
                        })}
                    </div>
                ) : poll.allowMultipleAnswers ? (
                     <div className="space-y-2">
                        {poll.options.map(option => (
                            <div key={option.id} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`${poll.id}-${option.id}`}
                                    checked={selectedOptions.includes(option.id)}
                                    onCheckedChange={(checked) => handleMultipleSelection(option.id, !!checked)}
                                    disabled={!canVoteNow}
                                />
                                <Label htmlFor={`${poll.id}-${option.id}`}>{option.text}</Label>
                            </div>
                        ))}
                    </div>
                ) : (
                    <RadioGroup onValueChange={handleSingleSelection} disabled={!canVoteNow}>
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
                {canVoteNow && (
                    <Button onClick={() => onVote(poll.id!, selectedOptions)} disabled={selectedOptions.length === 0 || votingStates[poll.id!]}>
                         {votingStates[poll.id!] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Abstimmen
                    </Button>
                )}
                {canRetractVote && (
                    <Button variant="outline" onClick={() => onRetract(poll.id!)} disabled={votingStates[`retract-${poll.id!}`]}>
                        {votingStates[`retract-${poll.id!}`] && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Stimme zurückziehen
                    </Button>
                )}
                 {pollExpired && userVotedOptionIds.size === 0 && canUserVote && (
                    <p className="text-sm text-muted-foreground">Sie haben nicht abgestimmt.</p>
                )}
                {!canUserVote && !pollExpired && (
                    <p className="text-sm text-muted-foreground">Nicht für deine Mannschaft.</p>
                )}
            </CardFooter>
        </Card>
    )
}
